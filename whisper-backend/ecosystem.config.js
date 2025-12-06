module.exports = {
  apps: [
    {
      name: 'whisper-subtitle-backend',
      script: 'server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: '8765',
        PYTHON_PORT: '8766',
        WHISPER_MODEL: 'tiny',
        WHISPER_LANGUAGE: 'auto',
        MAX_CONCURRENT_JOBS: '2'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '2G',
      error_file: './logs/whisper-err.log',
      out_file: './logs/whisper-out.log',
      log_file: './logs/whisper-combined.log',
      time: true
    },
    {
      name: 'stream-subtitle-server',
      script: 'caffeinate',
      args: ['-i', 'node', 'stream-subtitle-server.js'],
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: '8770',
        ALLOWED_IPS: '100.94.19.65'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/stream-err.log',
      out_file: './logs/stream-out.log',
      log_file: './logs/stream-combined.log',
      time: true
    }
  ]
};