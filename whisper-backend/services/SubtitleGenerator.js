/**
 * Subtitle Generator Service
 * 
 * Handles chunk-based subtitle generation with real-time streaming
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { EventEmitter } = require('events');

class SubtitleGenerator extends EventEmitter {
  constructor(videoId, streamUrl, options = {}) {
    super();
    this.videoId = videoId;
    this.streamUrl = streamUrl;
    this.language = options.language || 'en';
    this.model = options.model || 'tiny'; // tiny, base, small, medium
    this.pythonPort = options.pythonPort || process.env.PYTHON_PORT || 8766;
    this.startPosition = options.startPosition || 0; // Start from specific position
    
    this.subtitles = [];
    this.processedSeconds = this.startPosition; // Start from given position
    this.totalDuration = null;
    this.startTime = Date.now();
    this.ffmpegProcess = null;
    this.chunkSize = 30; // Process 30 seconds at a time
    this.currentChunk = Math.floor(this.startPosition / this.chunkSize); // Start from correct chunk
    this.isRunning = false;
    this.isCancelled = false;
    
    this.tempDir = path.join(__dirname, '../uploads', videoId);
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Generation already in progress');
    }

    this.isRunning = true;
    this.isCancelled = false;

    try {
      // Create temp directory
      await fs.mkdir(this.tempDir, { recursive: true });

      this.emit('started', { videoId: this.videoId });

      // First, get video duration
      await this.getVideoDuration();

      // Start processing chunks
      await this.processChunks();

      this.emit('complete', {
        videoId: this.videoId,
        totalSubtitles: this.subtitles.length,
        duration: (Date.now() - this.startTime) / 1000
      });

    } catch (error) {
      if (!this.isCancelled) {
        this.emit('error', { error: error.message, canRetry: true });
      }
      throw error;
    } finally {
      this.isRunning = false;
      await this.cleanup();
    }
  }

  async getVideoDuration() {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        this.streamUrl
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          this.totalDuration = parseFloat(output.trim());
          console.log(`📺 Video duration: ${this.totalDuration}s`);
          resolve(this.totalDuration);
        } else {
          // If can't get duration, estimate high
          this.totalDuration = 3600; // 1 hour default
          resolve(this.totalDuration);
        }
      });

      ffprobe.on('error', (err) => {
        this.totalDuration = 3600;
        resolve(this.totalDuration);
      });
    });
  }

  async processChunks() {
    const startChunk = Math.floor(this.startPosition / this.chunkSize);
    const numChunks = Math.ceil(this.totalDuration / this.chunkSize);
    console.log(`🔄 Processing ${numChunks - startChunk} chunks from ${this.startPosition}s (chunk ${startChunk + 1}/${numChunks})`);

    for (let i = startChunk; i < numChunks; i++) {
      if (this.isCancelled) {
        console.log('❌ Processing cancelled');
        break;
      }

      this.currentChunk = i;
      const startTime = i * this.chunkSize;
      const duration = Math.min(this.chunkSize, this.totalDuration - startTime);

      console.log(`🎬 Processing chunk ${i + 1}/${numChunks}: ${startTime}s - ${startTime + duration}s`);

      await this.processChunk(startTime, duration);
      this.processedSeconds = Math.min(startTime + duration, this.totalDuration);

      // Emit progress
      this.emitProgress();
    }
  }

  async processChunk(startTime, duration) {
    const chunkFile = path.join(this.tempDir, `chunk_${this.currentChunk}.wav`);

    try {
      // Extract audio chunk
      await this.extractAudioChunk(startTime, duration, chunkFile);

      // Generate subtitles for chunk
      const chunkSubtitles = await this.generateSubtitlesForChunk(chunkFile, startTime);

      // Add to total subtitles and emit
      for (const subtitle of chunkSubtitles) {
        this.subtitles.push(subtitle);
        this.emit('subtitle', subtitle);
      }

      console.log(`✅ Chunk ${this.currentChunk} generated ${chunkSubtitles.length} subtitles`);

      // Clean up chunk file
      await fs.unlink(chunkFile).catch(() => {});

    } catch (error) {
      console.error(`❌ Error processing chunk ${this.currentChunk}:`, error.message);
      console.log(`⏭️ Skipping chunk ${this.currentChunk}, continuing with next...`);
      // Clean up failed chunk file
      await fs.unlink(chunkFile).catch(() => {});
      // Continue with next chunk - don't let one bad chunk stop everything
    }
  }

  async extractAudioChunk(startTime, duration, outputFile) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-i', this.streamUrl,
        '-vn', // No video
        '-ar', '16000', // 16kHz sample rate (Whisper requirement)
        '-ac', '1', // Mono
        '-f', 'wav',
        '-y', // Overwrite
        outputFile
      ]);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  async generateSubtitlesForChunk(audioFile, offsetSeconds) {
    // Send audio to Python Whisper service
    const formData = new FormData();
    formData.append('file', fsSync.createReadStream(audioFile));

    const response = await fetch(`http://localhost:${this.pythonPort}/transcribe?language=${this.language}`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Whisper service returned ${response.status}: ${errorText}`);
      throw new Error(`Whisper service error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    // Convert segments to subtitle format with offset
    const subtitles = result.segments.map((segment, index) => ({
      index: this.subtitles.length + index,
      startTime: segment.start + offsetSeconds,
      endTime: segment.end + offsetSeconds,
      text: segment.text.trim()
    }));

    return subtitles;
  }

  emitProgress() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const percent = Math.min(100, (this.processedSeconds / this.totalDuration) * 100);
    const speed = this.processedSeconds / elapsed; // seconds per second
    const remaining = (this.totalDuration - this.processedSeconds) / Math.max(speed, 0.1);

    this.emit('progress', {
      percent: Math.round(percent),
      processedSeconds: Math.round(this.processedSeconds),
      totalDuration: Math.round(this.totalDuration),
      estimatedTime: Math.round(remaining),
      message: `Processing chunk ${this.currentChunk + 1}...`
    });
  }

  cancel() {
    console.log(`🛑 Cancelling subtitle generation for ${this.videoId}`);
    this.isCancelled = true;
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill();
    }
    this.cleanup();
  }

  async cleanup() {
    try {
      // Remove temp directory and all chunks
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  getProgress() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const percent = this.totalDuration 
      ? Math.min(100, (this.processedSeconds / this.totalDuration) * 100)
      : 0;
    const speed = elapsed > 0 ? this.processedSeconds / elapsed : 0;
    const remaining = this.totalDuration 
      ? (this.totalDuration - this.processedSeconds) / Math.max(speed, 0.1)
      : 0;

    return {
      percent: Math.round(percent),
      processedSeconds: Math.round(this.processedSeconds),
      totalDuration: Math.round(this.totalDuration || 0),
      estimatedTime: Math.round(remaining),
      subtitlesGenerated: this.subtitles.length,
      isRunning: this.isRunning
    };
  }

  getSubtitles() {
    return this.subtitles;
  }
}

module.exports = SubtitleGenerator;
