# Deployment Guide for NAS Server

## Build Successful! ✅

Your IPTV app has been built for production. Here's how to deploy it to your NAS server.

## What Was Built

- **Output Type**: Standalone
- **Location**: `.next/standalone/` folder
- **Static Files**: `.next/static/` and `public/` folders

## Deployment Methods

### Method 1: Docker (Recommended)

1. **Create Dockerfile** (already included in project)
2. **Build Docker image**:
   ```bash
   docker build -t iptv-app .
   ```
3. **Run on NAS**:
   ```bash
   docker run -d -p 3001:3001 --name iptv-app iptv-app
   ```

### Method 2: Direct Node.js Deployment

1. **Copy files to NAS**:
   ```bash
   # Copy the standalone build
   scp -r .next/standalone/ user@nas-ip:/path/to/app/
   
   # Copy static files
   scp -r .next/static/ user@nas-ip:/path/to/app/.next/
   scp -r public/ user@nas-ip:/path/to/app/
   
   # Copy package.json
   scp package.json user@nas-ip:/path/to/app/
   
   # Copy .env.local (your credentials!)
   scp .env.local user@nas-ip:/path/to/app/
   ```

2. **SSH into NAS and run**:
   ```bash
   ssh user@nas-ip
   cd /path/to/app
   NODE_ENV=production node standalone/server.js
   ```

### Method 3: PM2 (Process Manager - Recommended for Production)

1. **Install PM2 on NAS**:
   ```bash
   npm install -g pm2
   ```

2. **Start app with PM2**:
   ```bash
   cd /path/to/app
   pm2 start standalone/server.js --name iptv-app
   pm2 save
   pm2 startup
   ```

## Environment Variables

Make sure to create `.env.local` on your NAS with:

```env
NEXT_PUBLIC_STALKER_BEARER=your_bearer_token
NEXT_PUBLIC_STALKER_ADID=your_adid
NEXT_PUBLIC_APP_PASSWORD_HASH=your_password_hash
```

## Port Configuration

The app runs on port **3001** by default. To change:
- Edit `package.json` scripts
- Or set `PORT` environment variable: `PORT=8080 node standalone/server.js`

## Reverse Proxy (Optional but Recommended)

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/iptv.service`:

```ini
[Unit]
Description=IPTV Next.js App
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /path/to/app/standalone/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable iptv
sudo systemctl start iptv
sudo systemctl status iptv
```

## Quick Deploy Script

Run `./deploy.sh` to automatically package and prepare for deployment.

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3001
lsof -ti:3001 | xargs kill -9
```

### Check Logs
```bash
# PM2
pm2 logs iptv-app

# Systemd
sudo journalctl -u iptv -f

# Docker
docker logs iptv-app
```

### Permissions
```bash
# Make sure Node.js can bind to port
sudo setcap cap_net_bind_service=+ep /usr/bin/node
```

## Updates

To update the app:
1. Build new version locally: `npm run build`
2. Stop running instance
3. Copy new files
4. Restart app

## Security Notes

- **Never expose Stalker credentials** in client code
- Use HTTPS in production (setup SSL certificate)
- Consider firewall rules to restrict access
- Change default password hash
- Keep Node.js updated

## Performance Tips

- Use PM2 cluster mode: `pm2 start server.js -i max`
- Enable Nginx caching for static assets
- Use CDN for public assets if available
- Monitor with `pm2 monit`

## Need Help?

- Check logs first
- Verify environment variables are set
- Ensure Node.js version >= 18
- Check network connectivity to Stalker portal
