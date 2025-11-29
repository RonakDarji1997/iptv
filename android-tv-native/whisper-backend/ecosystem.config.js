module.exports = {
  apps: [{
    name: 'stream-subtitle-server',
    script: 'caffeinate',
    args: ['-i', 'node', 'stream-subtitle-server.js'], // -i prevents idle sleep
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: '8770',
      ALLOWED_IPS: '100.94.19.65' // Chromecast's Tailscale IP
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};