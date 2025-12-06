/**
 * Subtitle API Routes
 * 
 * SSE-based real-time subtitle generation
 */

const express = require('express');
const SubtitleGenerator = require('../services/SubtitleGenerator');

const router = express.Router();

// Store active generation jobs
const activeJobs = new Map();

/**
 * Check subtitle generation capability
 * GET /api/subtitles/capability
 */
router.get('/capability', (req, res) => {
  const currentLoad = activeJobs.size;
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_JOBS || '2');

  res.json({
    available: currentLoad < maxConcurrent,
    model: process.env.WHISPER_MODEL || 'tiny',
    averageSpeed: getAverageSpeed(),
    maxConcurrent,
    currentLoad,
    estimatedWaitTime: currentLoad >= maxConcurrent ? 60 : 0,
    supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'auto']
  });
});

/**
 * Generate subtitles with SSE streaming
 * GET /api/subtitles/generate-stream
 */
router.get('/generate-stream', async (req, res) => {
  const { streamUrl, videoId, language = 'en', model = 'tiny', startPosition = '0' } = req.query;

  if (!streamUrl || !videoId) {
    return res.status(400).json({ error: 'streamUrl and videoId required' });
  }

  const startPos = parseFloat(startPosition);
  console.log(`🎬 Starting subtitle generation for ${videoId} from ${startPos}s`);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', videoId })}\n\n`);

  // Check if already generating
  if (activeJobs.has(videoId)) {
    const existingJob = activeJobs.get(videoId);
    
    // Send current progress
    const progress = existingJob.getProgress();
    res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
    
    // Send existing subtitles
    const existingSubtitles = existingJob.getSubtitles();
    for (const subtitle of existingSubtitles) {
      res.write(`data: ${JSON.stringify({ type: 'subtitle', ...subtitle })}\n\n`);
    }

    // Listen for new events
    setupEventListeners(existingJob, res, req, videoId);
    return;
  }

  // Create new generation job
  const generator = new SubtitleGenerator(videoId, streamUrl, { language, model, startPosition: startPos });
  activeJobs.set(videoId, generator);

  // Set up event listeners
  setupEventListeners(generator, res, req, videoId);

  // Start generation
  try {
    await generator.start();
  } catch (error) {
    console.error(`❌ Subtitle generation failed for ${videoId}:`, error);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message,
        canRetry: true
      })}\n\n`);
    }
  } finally {
    activeJobs.delete(videoId);
  }
});

/**
 * Cancel subtitle generation
 * DELETE /api/subtitles/generate/:videoId
 */
router.delete('/generate/:videoId', (req, res) => {
  const { videoId } = req.params;

  if (!activeJobs.has(videoId)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const generator = activeJobs.get(videoId);
  generator.cancel();
  activeJobs.delete(videoId);

  res.json({ success: true, message: 'Generation cancelled' });
});

/**
 * Get current generation status
 * GET /api/subtitles/status/:videoId
 */
router.get('/status/:videoId', (req, res) => {
  const { videoId } = req.params;

  if (!activeJobs.has(videoId)) {
    return res.status(404).json({ error: 'Job not found', isRunning: false });
  }

  const generator = activeJobs.get(videoId);
  const progress = generator.getProgress();

  res.json({
    isRunning: true,
    ...progress,
    subtitles: generator.getSubtitles()
  });
});

/**
 * Get generated subtitles as VTT file
 * GET /api/subtitles/download/:videoId.vtt
 */
router.get('/download/:videoId.vtt', (req, res) => {
  const { videoId } = req.params;

  if (!activeJobs.has(videoId)) {
    return res.status(404).send('WEBVTT\n\nNOTE Subtitles not ready yet');
  }

  const generator = activeJobs.get(videoId);
  const subtitles = generator.getSubtitles();

  // Generate VTT format
  let vtt = 'WEBVTT\n\n';
  
  for (const subtitle of subtitles) {
    const start = formatTime(subtitle.startTime);
    const end = formatTime(subtitle.endTime);
    vtt += `${subtitle.index + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `${subtitle.text}\n\n`;
  }

  res.setHeader('Content-Type', 'text/vtt');
  res.setHeader('Content-Disposition', `inline; filename="${videoId}.vtt"`);
  res.send(vtt);
});

// Helper functions

function setupEventListeners(generator, res, req, videoId) {
  const onProgress = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    }
  };

  const onSubtitle = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'subtitle', ...data })}\n\n`);
    }
  };

  const onComplete = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
      res.end();
    }
  };

  const onError = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`);
      res.end();
    }
  };

  generator.on('progress', onProgress);
  generator.on('subtitle', onSubtitle);
  generator.on('complete', onComplete);
  generator.on('error', onError);

  // Clean up on client disconnect
  req.on('close', () => {
    console.log(`🔌 Client disconnected from ${videoId}`);
    generator.removeListener('progress', onProgress);
    generator.removeListener('subtitle', onSubtitle);
    generator.removeListener('complete', onComplete);
    generator.removeListener('error', onError);
  });
}

function getAverageSpeed() {
  // TODO: Track actual speeds from completed jobs
  // For now, return estimated speed based on model
  const model = process.env.WHISPER_MODEL || 'tiny';
  const speeds = {
    tiny: 0.03,    // 32x realtime
    base: 0.06,    // 16x realtime
    small: 0.125,  // 8x realtime
    medium: 0.25,  // 4x realtime
  };
  return speeds[model] || 0.1;
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

module.exports = router;
