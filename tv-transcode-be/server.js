const express = require('express');
const morgan = require('morgan');
const { spawn, execSync } = require('child_process');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 4000;

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

  // Determine target resolution (support 1080 and 2160 by default)
  const targetParam = parseInt(req.query.target || '1080', 10);
  let targetW = 1920, targetH = 1080;
  if (targetParam === 2160) {
    targetW = 3840;
    targetH = 2160;
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
  const ffArgs = [
    '-hide_banner',
    '-loglevel', 'info',
    '-i', input,
    '-vf', scaleArg,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', '5000k',
    '-maxrate', '6000k',
    '-bufsize', '12000k',
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
    console.error('ffmpeg error', err);
    try { res.end(); } catch (e) {}
  });

  // When client disconnects, kill ffmpeg
  req.on('close', () => {
    try {
      ff.kill('SIGKILL');
    } catch (e) {}
  });
});

app.listen(PORT, () => {
  console.log(`tv-transcode-be listening on ${PORT}`);
});
