/**
 * Stream Subtitle Server
 * 
 * Architecture:
 * 1. TV sends stream URL to /start-subtitle endpoint
 * 2. Server spawns FFmpeg to listen to stream and extract audio
 * 3. FFmpeg outputs audio chunks to Python Whisper service
 * 4. Whisper generates subtitles and appends to VTT file
 * 5. TV fetches subtitles from /subtitle/:streamId.vtt
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 8770;
const PYTHON_PORT = process.env.PYTHON_PORT || 8771;

const app = express();
const glob = require('glob');
app.use(cors());
app.use(express.json());

// Active subtitle jobs: streamId -> { streamUrl, ffmpegProcess, vttFile, lastUpdate }
const activeJobs = new Map();

// Event emitter for subtitle ready notifications
const subtitleEvents = new EventEmitter();

// Transcription queue and concurrency control
const transcriptionQueues = new Map(); // streamId -> array of pending chunks
const activeTranscriptions = new Map(); // streamId -> count of running transcriptions
const MAX_CONCURRENT_PER_STREAM = 3;

// Ensure subtitle directory exists
const SUBTITLE_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(SUBTITLE_DIR)) {
    fs.mkdirSync(SUBTITLE_DIR, { recursive: true });
}

/**
 * Process transcription queue with concurrency control
 * Ensures max 3 whisper-cli processes run simultaneously per stream
 */
async function processTranscriptionQueue(streamId) {
    const queue = transcriptionQueues.get(streamId);
    if (!queue || queue.length === 0) return;
    
    // Check if already processing
    const activeCount = activeTranscriptions.get(streamId) || 0;
    if (activeCount > 0) return; // Only process one chunk at a time to maintain order
    
    // Get next chunk from queue
    const chunkTask = queue.shift();
    if (!chunkTask) return;
    
    // Mark as active
    activeTranscriptions.set(streamId, 1);
    
    // Process chunk sequentially
    try {
        await chunkTask.process();
    } catch (err) {
        console.error(`Queue processing error: ${err.message}`);
    } finally {
        // Mark as inactive
        activeTranscriptions.delete(streamId);
        
        // Process next chunk in queue
        setImmediate(() => processTranscriptionQueue(streamId));
    }
}

/**
 * Generate unique stream ID from URL and timestamp
 * Include timestamp to allow multiple subtitle sessions for same video
 */
function getStreamId(streamUrl) {
    const timestamp = Date.now();
    return crypto.createHash('md5').update(streamUrl + timestamp).digest('hex').substring(0, 12);
}

/**
 * Create VTT file header
 */
function initVTTFile(vttPath) {
    fs.writeFileSync(vttPath, 'WEBVTT\n\n');
}

/**
 * Append subtitle cue to VTT file
 */
function appendSubtitle(vttPath, startTime, endTime, text) {
    const cue = `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n${text}\n\n`;
    fs.appendFileSync(vttPath, cue);
}

/**
 * Format seconds to VTT timestamp (00:00:00.000)
 */
function formatVTTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Start FFmpeg to extract audio from stream and process with Whisper
 */
async function startSubtitleGeneration(streamUrl, language = 'auto', startPosition = 0) {
    const streamId = getStreamId(streamUrl);
    
    // Get base stream URL (without token) for checking if it's the same stream
    const baseStreamUrl = streamUrl.split('?')[0]; // Remove query params
    
    // Check if already processing ANY job for this base stream
    console.log(`🔍 Checking for existing jobs... Active jobs: ${activeJobs.size}`);
    let existingJobId = null;
    for (const [jobId, job] of activeJobs.entries()) {
        console.log(`  - Job ${jobId}: streamUrl=${job.streamUrl ? 'set' : 'NOT SET'}, startPos=${job.startPosition}`);
        const jobBaseUrl = job.streamUrl ? job.streamUrl.split('?')[0] : '';
        if (jobBaseUrl === baseStreamUrl) {
            console.log(`  ✅ Found matching job: ${jobId}`);
            existingJobId = jobId;
            break;
        }
    }
    
    // If found an existing job for same stream, cancel it (new position requested)
    if (existingJobId) {
        const existingJob = activeJobs.get(existingJobId);
        console.log(`⚠️ Canceling old job ${existingJobId} at ${existingJob.startPosition}s, starting new job at ${startPosition}s`);
        
        // Kill FFmpeg process
        if (existingJob.ffmpegProcess) {
            existingJob.ffmpegProcess.kill('SIGKILL');
        }
        
        // Delete old VTT file
        const oldVttPath = path.join(SUBTITLE_DIR, `${existingJobId}.vtt`);
        if (fs.existsSync(oldVttPath)) {
            fs.unlinkSync(oldVttPath);
        }
        
        // Remove from active jobs and clear queue
        activeJobs.delete(existingJobId);
        transcriptionQueues.delete(existingJobId);
        activeTranscriptions.delete(existingJobId);
        console.log(`✅ Old job canceled, starting fresh`);
    }
    
    const vttPath = path.join(SUBTITLE_DIR, `${streamId}.vtt`);
    initVTTFile(vttPath);
    
    console.log(`Starting subtitle generation for stream: ${streamUrl}`);
    console.log(`Stream ID: ${streamId}`);
    console.log(`VTT file: ${vttPath}`);
    
    // FFmpeg command to extract audio chunks
    // -ss BEFORE -i: fast seek to start position (input seeking)
    // -i: input stream URL
    // -t 600: limit to 10 minutes (600 seconds) for longer subtitle coverage
    // -vn: no video
    // -acodec pcm_s16le: convert to PCM 16-bit
    // -ar 16000: 16kHz sample rate (Whisper requirement)
    // -ac 1: mono audio
    // -f segment: output segments
    // -segment_time 2: 2-second chunks (faster processing)
    // -af silencedetect: Skip silence to avoid processing empty audio
    const ffmpegArgs = [
        '-ss', startPosition.toString(),
        '-i', streamUrl,
        // No -t limit: generate continuously until stopped
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-af', 'silencedetect=n=-30dB:d=2',
        '-f', 'segment',
        '-segment_time', '2',
        '-segment_format', 'wav',
        '-reset_timestamps', '1',
        path.join(SUBTITLE_DIR, `${streamId}_chunk_%03d.wav`)
    ];
    
    console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
    console.log(`⏱️  Starting from ${startPosition}s, generating continuously until stopped`);
    
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    
    // Start currentTime from startPosition so VTT timestamps match video time
    let currentTime = startPosition;
    const processedChunks = new Set(); // Track processed chunks to avoid duplicates
    
    // Create placeholder job BEFORE watcher so callbacks can update it
    const jobInfo = {
        streamUrl,
        ffmpegProcess: null, // Will be set below
        chunkWatcher: null,  // Will be set below
        vttPath,
        language,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        startPosition,
        currentTime: startPosition,
        firstSubtitleReady: false
    };
    activeJobs.set(streamId, jobInfo);
    
    // Update reference
    jobInfo.ffmpegProcess = ffmpegProcess;
    
    // Initialize transcription queue for this stream
    if (!transcriptionQueues.has(streamId)) {
        transcriptionQueues.set(streamId, []);
    }
    
    // Watch directory for new chunk files
    const chunkWatcher = fs.watch(SUBTITLE_DIR, async (event, filename) => {
        if (!filename) return;
        if (!filename.endsWith('.wav')) return;
        if (!filename.startsWith(streamId)) return;
        
        const chunkPath = path.join(SUBTITLE_DIR, filename);
        
        // Skip if already processing this chunk
        if (processedChunks.has(filename)) return;
        processedChunks.add(filename);
        
        console.log(`📋 Queued chunk: ${chunkPath}`);
        
        // Add to queue instead of processing immediately
        const queue = transcriptionQueues.get(streamId);
        if (!queue) {
            console.log(`⚠️  Queue not found for stream ${streamId} - job may have been canceled`);
            return;
        }
        
        // If queue is too large (>150 chunks = 5 minutes ahead), delete this chunk
        // This prevents infinite file buildup when FFmpeg generates faster than transcription
        // No deletion here; chunks will only be deleted on stop request
            // Delete all .wav chunks for this stream on stop
            // fs, path, and glob are already required at the top. No deletion here; chunks will only be deleted on stop request.
        
        queue.push({
            filename,
            chunkPath,
            process: async () => {
                // Wait for file to be fully written
                await new Promise(resolve => setTimeout(resolve, 300));
                
                if (!fs.existsSync(chunkPath)) {
                    processedChunks.delete(filename); // Allow retry if file doesn't exist
                    return;
                }
                
                try {
                    console.log(`🎤 Transcribing: ${filename}`);
                    const transcription = await transcribeAudioFile(chunkPath, language);
                    
                    if (transcription?.text?.trim()) {
                        const startTime = currentTime;
                        const endTime = currentTime + 2;
                        
                        console.log(`Subtitle [${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}]: ${transcription.text}`);
                        
                        appendSubtitle(vttPath, startTime, endTime, transcription.text);
                        
                        jobInfo.lastUpdate = Date.now();
                        
                        // Increment currentTime only when we add a subtitle
                        currentTime += 2;
                        jobInfo.currentTime = currentTime;
                        
                        // Emit event for first subtitle ready
                        if (!jobInfo.firstSubtitleReady) {
                            jobInfo.firstSubtitleReady = true;
                            console.log(`🎉 First subtitle ready for stream ${streamId}`);
                            subtitleEvents.emit(`ready:${streamId}`, streamId);
                        }
                    } else {
                        console.log(`⏭️  Skipping empty transcription for chunk`);
                    }
                    
                    // Delete processed chunk to save disk space
                    try {
                        fs.unlinkSync(chunkPath);
                        console.log(`🗑️  Deleted: ${filename}`);
                    } catch (err) {
                        console.error(`⚠️  Failed to delete ${filename}: ${err.message}`);
                    }
                    
                } catch (err) {
                    console.error(`Chunk error: ${err.message}`);
                    processedChunks.delete(filename); // Allow retry on error
                }
            }
        });
        
        // Start processing queue (will respect MAX_CONCURRENT limit)
        processTranscriptionQueue(streamId);
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Log FFmpeg progress
        if (output.includes('time=')) {
            console.log(`FFmpeg: ${output.trim()}`);
        }
    });
    
    ffmpegProcess.on('error', (error) => {
        console.error(`FFmpeg error for stream ${streamId}:`, error);
        chunkWatcher.close();
        activeJobs.delete(streamId);
        transcriptionQueues.delete(streamId);
        activeTranscriptions.delete(streamId);
    });
    
    ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process for stream ${streamId} exited with code ${code}`);
        try {
            chunkWatcher.close();
        } catch (e) {
            // Watcher may already be closed
        }
        activeJobs.delete(streamId);
        
        // Don't delete queue immediately - let remaining chunks finish processing
        const queue = transcriptionQueues.get(streamId);
        if (queue && queue.length > 0) {
            console.log(`📦 FFmpeg finished, but ${queue.length} chunks still in queue - will process remaining`);
            // Queue will be deleted automatically when empty
        } else {
            transcriptionQueues.delete(streamId);
            activeTranscriptions.delete(streamId);
            console.log(`✅ Stream ${streamId} fully completed`);
        }
    });
    
    // Update watcher reference in existing job
    jobInfo.chunkWatcher = chunkWatcher;
    
    return streamId;
}

/**
 * Send audio file to Python Whisper service for transcription
 */
async function transcribeAudioFile(audioPath, language) {
    console.log(`Transcribing with whisper-cli: ${audioPath} (${language})`);
    
    return new Promise((resolve, reject) => {
        const modelPath = path.join(__dirname, 'models', 'ggml-tiny.bin');
        const langParam = (language && language !== 'auto') ? language : 'en';
        
        // Use whisper-cli with Metal acceleration (4x faster than real-time!)
        const whisperProcess = spawn('whisper-cli', [
            '-m', modelPath,
            audioPath,
            '-l', langParam,
            '-nt',  // no timestamps in output
            '-np'   // no prints except result
        ]);
        
        let output = '';
        let errorOutput = '';
        let resolved = false;
        
        // 10-second timeout for 2-second audio chunks (should take < 1 second)
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.error(`⏱️  Whisper timeout for ${path.basename(audioPath)}`);
                whisperProcess.kill('SIGKILL');
                reject(new Error('Whisper transcription timeout'));
            }
        }, 10000);
        
        whisperProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        whisperProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        whisperProcess.on('close', (code) => {
            if (resolved) return; // Already handled by timeout
            resolved = true;
            clearTimeout(timeout);
            if (code !== 0) {
                console.error(`whisper-cli error: ${errorOutput}`);
                reject(new Error(`whisper-cli failed with code ${code}`));
                return;
            }
            
            // Extract transcribed text (remove metadata lines)
            const lines = output.split('\n').filter(line => 
                !line.includes('whisper_') && 
                !line.includes('ggml_') &&
                !line.includes('system_info') &&
                !line.includes('main: processing') &&
                line.trim().length > 0
            );
            
            const text = lines.join(' ').trim();
            console.log(`Transcription result: ${text || '(empty)'}`);
            resolve({ text });
        });
    });
}

/**
 * Stop subtitle generation for a stream
 */
function stopSubtitleGeneration(streamId) {
    const job = activeJobs.get(streamId);
    if (!job) {
        return false;
    }
    
    console.log(`Stopping subtitle generation for stream ${streamId}`);
    
    // Close file watcher
    if (job.chunkWatcher) {
        try {
            job.chunkWatcher.close();
        } catch (e) {
            // Watcher may already be closed
        }
    }
    
    // Kill FFmpeg process
    if (job.ffmpegProcess) {
        console.log(`🛑 Stopping FFmpeg process for stream ${streamId}`);
        job.ffmpegProcess.kill('SIGTERM');
    }
    // Kill all FFmpeg processes (global)
    const { exec } = require('child_process');
    exec('pkill -f ffmpeg', (error, stdout, stderr) => {
        if (error) {
            console.log(`Error killing all ffmpeg: ${error.message}`);
        } else {
            console.log('🛑 pkill -f ffmpeg executed to kill all FFmpeg processes');
        }
    });
    
    // Clean up chunk files
    const chunkFiles = fs.readdirSync(SUBTITLE_DIR).filter(f => f.startsWith(`${streamId}_chunk_`));
    chunkFiles.forEach(f => fs.unlinkSync(path.join(SUBTITLE_DIR, f)));
    
    activeJobs.delete(streamId);
    transcriptionQueues.delete(streamId);
    activeTranscriptions.delete(streamId);
    return true;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Start subtitle generation for a stream
 * POST /start-subtitle
 * Body: { streamUrl, language? }
 * Returns: { streamId, subtitleUrl }
 */
app.post('/start-subtitle', async (req, res) => {
    try {
        const { streamUrl, language, startPosition } = req.body;
        
        console.log('\n📥 ===== RECEIVED START REQUEST =====');
        console.log('📥 Stream URL:', streamUrl);
        console.log('📥 Language:', language);
        console.log('📥 Start Position:', startPosition, 'seconds');
        console.log('=====================================\n');
        
        if (!streamUrl) {
            return res.status(400).json({ error: 'streamUrl is required' });
        }
        
        // Cancel ALL existing subtitle generation jobs and clean up files
        console.log('🧹 Canceling all existing subtitle jobs...');
        for (const [existingStreamId, job] of activeJobs.entries()) {
            console.log(`🛑 Stopping job: ${existingStreamId}`);
            stopSubtitleGeneration(existingStreamId);
        }
        
        // Delete all old audio files
        const fs = require('fs');
        const oldFiles = fs.readdirSync(SUBTITLE_DIR).filter(f => f.endsWith('.wav'));
        console.log(`🗑️  Deleting ${oldFiles.length} old audio files...`);
        for (const file of oldFiles) {
            try {
                fs.unlinkSync(path.join(SUBTITLE_DIR, file));
            } catch (err) {
                // Ignore errors
            }
        }
        
        const streamId = await startSubtitleGeneration(streamUrl, language, startPosition || 0);
        const subtitleUrl = `http://${req.hostname}:${PORT}/subtitle/${streamId}.vtt`;
        
        console.log('✅ Stream ID created:', streamId);
        console.log('✅ Subtitle URL:', subtitleUrl);
        console.log('⏳ Waiting for first subtitle to be ready...');
        
        // Wait for first subtitle with 10 second timeout (reduced from 60s)
        // Typically takes 2-3 seconds: FFmpeg generates first 2s chunk + whisper transcribes (~0.5s)
        const firstSubtitleReady = await Promise.race([
            new Promise((resolve) => {
                subtitleEvents.once(`ready:${streamId}`, () => resolve(true));
            }),
            new Promise((resolve) => setTimeout(() => resolve(false), 10000))
        ]);
        
        if (firstSubtitleReady) {
            console.log('🎉 First subtitle ready, sending response');
        } else {
            console.log('⚠️  Timeout waiting for first subtitle (10s), sending response anyway');
        }
        
        res.json({
            streamId,
            subtitleUrl,
            message: 'Subtitle generation started'
        });
        
    } catch (error) {
        console.error('❌ Error starting subtitle generation:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Stop subtitle generation for a stream
 * POST /stop-subtitle
 * Body: { streamId }
 */
app.post('/stop-subtitle', (req, res) => {
    try {
        const { streamId } = req.body;
        
        console.log('\n🛑 ===== RECEIVED STOP REQUEST =====');
        console.log('🛑 Stream ID:', streamId);
        console.log('====================================\n');
        
        if (!streamId) {
            return res.status(400).json({ error: 'streamId is required' });
        }
        
        const stopped = stopSubtitleGeneration(streamId);
        
        if (stopped) {
            console.log('✅ Stream stopped successfully:', streamId);
            res.json({ message: 'Subtitle generation stopped' });
        } else {
            console.log('❌ Stream not found:', streamId);
            res.status(404).json({ error: 'Stream not found' });
        }
        
    } catch (error) {
        console.error('❌ Error stopping subtitle generation:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Serve subtitle VTT file
 * GET /subtitle/:streamId.vtt
 */
app.get('/subtitle/:filename', (req, res) => {
    const filename = req.params.filename;
    const vttPath = path.join(SUBTITLE_DIR, filename);
    
    if (!fs.existsSync(vttPath)) {
        return res.status(404).send('Subtitle file not found');
    }
    
    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(vttPath);
});

/**
 * List active subtitle jobs
 * GET /active-jobs
 */
app.get('/active-jobs', (req, res) => {
    const jobs = Array.from(activeJobs.entries()).map(([streamId, job]) => ({
        streamId,
        streamUrl: job.streamUrl,
        language: job.language,
        startTime: job.startTime,
        lastUpdate: job.lastUpdate,
        uptime: Math.floor((Date.now() - job.startTime) / 1000),
        subtitleUrl: `http://${req.hostname}:${PORT}/subtitle/${streamId}.vtt`
    }));
    
    res.json({ count: jobs.length, jobs });
});

/**
 * Health check
 */
app.get('/health', async (req, res) => {
    try {
        // Check if Python service is running
        const pythonResponse = await fetch(`http://localhost:${PYTHON_PORT}/health`, {
            timeout: 2000
        });
        
        const pythonHealth = await pythonResponse.json();
        
        res.json({
            status: 'healthy',
            activeJobs: activeJobs.size,
            whisperService: pythonHealth
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            activeJobs: activeJobs.size,
            whisperService: 'unavailable',
            error: error.message
        });
    }
});

// ============================================
// START SERVER
// ============================================

// Python service no longer needed - using whisper-cli with Metal acceleration instead!
// whisper-cli is 10x faster (4x faster than real-time vs 20x slower)

// Start Express server
app.listen(PORT, () => {
    console.log(`\n🚀 Stream Subtitle Server running on port ${PORT}`);
    console.log(`📝 Python Whisper service on port ${PYTHON_PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /start-subtitle - Start subtitle generation`);
    console.log(`  POST /stop-subtitle - Stop subtitle generation`);
    console.log(`  GET /subtitle/:streamId.vtt - Download subtitle file`);
    console.log(`  GET /active-jobs - List active jobs`);
    console.log(`  GET /health - Health check\n`);
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    
    // Stop all active jobs
    activeJobs.forEach((job, streamId) => {
        stopSubtitleGeneration(streamId);
    });
    
    process.exit(0);
});
