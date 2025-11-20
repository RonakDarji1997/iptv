# PM2 Deployment Guide

## Prerequisites

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Build the Expo web app:
```bash
cd expo-rn
npm run export:web
cd ..
```

3. Build the Next.js app:
```bash
npm run build
```

## Start with PM2

```bash
pm2 start ecosystem.config.json
```

## PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs iptv

# Restart
pm2 restart iptv

# Stop
pm2 stop iptv

# Delete from PM2
pm2 delete iptv

# Save PM2 process list (survives reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

## Access

The app will be available at `http://localhost:2005`
