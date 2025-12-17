const express = require('express');
const morgan = require('morgan');
const { spawn, execSync } = require('child_process');
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Create temp directory for HLS segments
const HLS_DIR = path.join(__dirname, 'hls_temp');
if (!fs.existsSync(HLS_DIR)) {
  fs.mkdirSync(HLS_DIR, { recursive: true });
}

// Track active transcoding sessions
const sessions = new Map();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(morgan('dev'));

// Simple health check - also reports whether ffmpeg is available
app.get('/health', (req, res) => {
  try {
    const ff = execSync('ffmpeg -version', { stdio: 'pipe' }).toString();
    return res.json({ ok: true, ffmpeg: true, version: ff.split('\n')[0] });
  } catch (e) {
    return res.status(503).json({ ok: false, ffmpeg: false, message: 'ffmpeg not available' });
  }
});

// /transcode?url=<encoded_url>&target=1080&mode=downscale|upscale
app.get('/transcode', (req, res) => {
  const input = req.query.url;
  const target = req.query.target || '1080';
  const mode = (req.query.mode || 'downscale').toLowerCase();

  if (!input) {
    return res.status(400).json({ error: 'missing url param' });
  }

  // Only allow http(s) inputs for now
  const parsed = url.parse(input);
  if (!parsed.protocol || !parsed.protocol.startsWith('http')) {
    return res.status(400).json({ error: 'only http(s) input URLs are supported' });
  }

  // Validate ffmpeg availability
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch (e) {
    return res.status(501).json({ error: 'ffmpeg not available on server' });
  }

  // Create unique session ID for this transcode
  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionDir = path.join(HLS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  console.log(`[Transcode] Starting session ${sessionId} for ${target}p ${mode}`);

  // Determine target resolution
  const targetParam = parseInt(req.query.target || '1080', 10);
  let targetW = 1920, targetH = 1080;
  if (targetParam === 2160) {
    targetW = 3840;
    targetH = 2160;
  } else if (targetParam === 720) {
    targetW = 1280;
    targetH = 720;
  }

  // Determine scale args
  let scaleArg = '';
  if (mode === 'upscale') {
    scaleArg = `scale=${targetW}:-2:flags=lanczos`;
  } else {
    scaleArg = `scale='if(gt(iw,${targetW}),${targetW},iw)':'-2'`;
  }

  // Adjust bitrate based on target resolution
  let videoBitrate = '5000k';
  let maxRate = '6000k';
  let bufSize = '12000k';
  
  if (targetParam === 2160) {
    videoBitrate = '20000k';
    maxRate = '25000k';
    bufSize = '50000k';
  } else if (targetParam === 1080) {
    videoBitrate = '8000k';
    maxRate = '10000k';
    bufSize = '20000k';
  } else if (targetParam === 720) {
    videoBitrate = '4000k';
    maxRate = '5000k';
    bufSize = '10000k';
  }
  
  const playlistPath = path.join(sessionDir, 'playlist.m3u8');
  const segmentPattern = path.join(sessionDir, 'segment%d.ts');
  
  const ffArgs = [
    '-hide_banner',
    '-loglevel', 'info',
    '-i', input,
    '-vf', scaleArg,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', videoBitrate,
    '-maxrate', maxRate,
    '-bufsize', bufSize,
    '-c:a', 'aac',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0', // 0 = keep all segments for full seeking support
    '-hls_segment_filename', segmentPattern,
    playlistPath
  ];

  const ff = spawn('ffmpeg', ffArgs);

  ff.stderr.on('data', (d) => {
    console.log('[ffmpeg]', d.toString());
  });

  ff.on('error', (err) => {
    console.error('[ffmpeg] Process error:', err);
    cleanupSession(sessionId);
  });

  ff.on('exit', (code, signal) => {
    console.log('[ffmpeg] Process exited with code:', code, 'signal:', signal);
    setTimeout(() => cleanupSession(sessionId), 60000); // Clean up after 1 minute
  });

  // Store session info
  sessions.set(sessionId, {
    process: ff,
    dir: sessionDir,
    createdAt: Date.now()
  });

  // Wait a bit for playlist to be created, then return URL
  const checkInterval = setInterval(() => {
    if (fs.existsSync(playlistPath)) {
      clearInterval(checkInterval);
      const playlistUrl = `http://localhost:${PORT}/hls/${sessionId}/playlist.m3u8`;
      res.json({ 
        success: true, 
        playlistUrl,
        sessionId,
        message: 'HLS stream ready'
      });
    }
  }, 200);

  // Timeout after 30 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Timeout waiting for transcode to start' });
      cleanupSession(sessionId);
    }
  }, 30000);
});

// Serve HLS playlists and segments
app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filepath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Cleanup endpoint - allow clients to trigger cleanup when stopping playback
app.post('/cleanup/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  console.log(`[Cleanup] Manual cleanup requested for session ${sessionId}`);
  cleanupSession(sessionId);
  res.json({ success: true, message: 'Session cleaned up' });
});

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      session.process.kill('SIGKILL');
    } catch (e) {
      console.error('[Cleanup] Error killing process:', e);
    }
    
    try {
      if (fs.existsSync(session.dir)) {
        fs.rmSync(session.dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('[Cleanup] Error removing directory:', e);
    }
    
    sessions.delete(sessionId);
    console.log(`[Cleanup] Session ${sessionId} cleaned up`);
  }
}

app.listen(PORT, () => {
  console.log(`tv-transcode-be listening on ${PORT}`);
});
