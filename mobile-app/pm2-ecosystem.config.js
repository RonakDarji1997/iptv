module.exports = {
  apps: [
    {
      name: 'mobile-app-web',
      script: 'web-server/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3005,
        WEB_BUILD_DIR: process.env.WEB_BUILD_DIR || './web-build'
      },
      // Optional: restart on file changes in dev only
      watch: false,
      max_restarts: 10,
      autorestart: true,
      restart_delay: 3000,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
