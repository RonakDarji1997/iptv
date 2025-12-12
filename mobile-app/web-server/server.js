const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.WEB_PORT || 3005;
const BUILD_DIR = process.env.WEB_BUILD_DIR || path.join(__dirname, '..', 'web-build');

// Basic health endpoint
app.get('/_health', (req, res) => res.status(200).send('ok'));

// Serve static files if the build dir exists
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));

  // SPA fallback: serve index.html for unknown routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('text').send(`Web build not found at ${BUILD_DIR}.\nRun \"npm run build:web\" in the mobile-app folder then restart this server.`);
  });
}

app.listen(PORT, () => {
  console.log(`📡 mobile-app web server listening on port ${PORT}`);
  console.log(`   - Serving from: ${BUILD_DIR}`);
});
