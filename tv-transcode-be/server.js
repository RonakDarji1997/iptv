const express = require('express');
const morgan = require('morgan');
const { spawn, execSync } = require('child_process');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 4000;

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

  // Determine target resolution (support 720, 1080 and 2160)
  const targetParam = parseInt(req.query.target || '1080', 10);
  let targetW = 1920, targetH = 1080;
  if (targetParam === 2160) {
    targetW = 3840;
    targetH = 2160;
  } else if (targetParam === 720) {
    targetW = 1280;
    targetH = 720;
  }

  // Determine scale args:
  // - For upscale: force width to targetW and keep aspect (-2 sets height automatically)
  // - For downscale: only reduce if input width > targetW, otherwise keep original resolution
  let scaleArg = '';
  if (mode === 'upscale') {
    scaleArg = `scale=${targetW}:-2:flags=lanczos`;
  } else {
    // if input width greater than targetW, set width to targetW, else keep input width
    scaleArg = `scale='if(gt(iw,${targetW}),${targetW},iw)':'-2'`;
  }

  // Use libx264 + aac for broad compatibility, output MPEG-TS stream
  // Adjust bitrate based on target resolution
  let videoBitrate = '5000k';
  let maxRate = '6000k';
  let bufSize = '12000k';
  
  if (targetParam === 2160) {
    // 4K requires much higher bitrate
    videoBitrate = '20000k';  // 20 Mbps for 4K
    maxRate = '25000k';       // 25 Mbps max
    bufSize = '50000k';       // 50 MB buffer
  } else if (targetParam === 1080) {
    videoBitrate = '8000k';   // 8 Mbps for 1080p
    maxRate = '10000k';       // 10 Mbps max
    bufSize = '20000k';       // 20 MB buffer
  } else if (targetParam === 720) {
    videoBitrate = '4000k';   // 4 Mbps for 720p
    maxRate = '5000k';        // 5 Mbps max
    bufSize = '10000k';       // 10 MB buffer
  }
  
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
    '-f', 'mpegts',
    'pipe:1'
  ];

  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'no-cache');

  // Spawn ffmpeg and pipe output to response
  const ff = spawn('ffmpeg', ffArgs);

  ff.stdout.pipe(res);

  ff.stderr.on('data', (d) => {
    // Log ffmpeg messages
    console.log('[ffmpeg]', d.toString());
  });

  ff.on('error', (err) => {
    console.error('[ffmpeg] Process error:', err);
    try { 
      if (!res.headersSent) {
        res.status(500).json({ error: 'FFmpeg process error' });
      }
      res.end(); 
    } catch (e) {
      console.error('[ffmpeg] Error ending response:', e);
    }
  });

  ff.on('exit', (code, signal) => {
    console.log('[ffmpeg] Process exited with code:', code, 'signal:', signal);
  });

  // When client disconnects, kill ffmpeg
  req.on('close', () => {
    console.log('[ffmpeg] Client disconnected, killing process');
    try {
      ff.kill('SIGKILL');
    } catch (e) {
      console.error('[ffmpeg] Error killing process:', e);
    }
  });
});

app.listen(PORT, () => {
  console.log(`tv-transcode-be listening on ${PORT}`);
});
