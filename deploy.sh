#!/bin/bash

# IPTV App Deployment Script
# This script packages your app for deployment to NAS

set -e

echo "🚀 IPTV App Deployment Packager"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if build exists
if [ ! -d ".next/standalone" ]; then
    echo -e "${RED}❌ Build not found! Running build first...${NC}"
    npm run build
fi

# Create deployment package
DEPLOY_DIR="iptv-deploy-$(date +%Y%m%d-%H%M%S)"
echo -e "${BLUE}📦 Creating deployment package: ${DEPLOY_DIR}${NC}"
mkdir -p "$DEPLOY_DIR"

# Copy standalone build
echo "   Copying standalone build..."
cp -r .next/standalone/* "$DEPLOY_DIR/"

# Copy static files
echo "   Copying static files..."
mkdir -p "$DEPLOY_DIR/.next/static"
cp -r .next/static/* "$DEPLOY_DIR/.next/static/"

# Copy public folder
echo "   Copying public assets..."
cp -r public "$DEPLOY_DIR/"

# Copy package.json
echo "   Copying package.json..."
cp package.json "$DEPLOY_DIR/"

# Create .env.local template
echo "   Creating environment template..."
cat > "$DEPLOY_DIR/.env.local" << 'EOF'
# IMPORTANT: Fill in these values before deploying!
NEXT_PUBLIC_STALKER_BEARER=your_bearer_token_here
NEXT_PUBLIC_STALKER_ADID=your_adid_here
NEXT_PUBLIC_APP_PASSWORD_HASH=your_password_hash_here
EOF

# Create start script
echo "   Creating start script..."
cat > "$DEPLOY_DIR/start.sh" << 'EOF'
#!/bin/bash
# IPTV App Start Script

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found! Please create it with your credentials."
    exit 1
fi

# Export environment variables
export $(cat .env.local | grep -v '^#' | xargs)
export NODE_ENV=production
export PORT=${PORT:-3001}
export HOSTNAME="0.0.0.0"

echo "🚀 Starting IPTV App on port $PORT..."
node server.js
EOF

chmod +x "$DEPLOY_DIR/start.sh"

# Create systemd service file
echo "   Creating systemd service file..."
cat > "$DEPLOY_DIR/iptv.service" << 'EOF'
[Unit]
Description=IPTV Next.js Application
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/iptv-app
EnvironmentFile=/path/to/iptv-app/.env.local
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOSTNAME=0.0.0.0
ExecStart=/usr/bin/node /path/to/iptv-app/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create PM2 ecosystem file
echo "   Creating PM2 config..."
cat > "$DEPLOY_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'iptv-app',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOSTNAME: '0.0.0.0'
    }
  }]
};
EOF

# Create README for deployment
echo "   Creating deployment README..."
cat > "$DEPLOY_DIR/README-DEPLOY.md" << 'EOF'
# Deployment Instructions

## Quick Start

1. **Upload to NAS**: Transfer this entire folder to your NAS server
   ```bash
   scp -r iptv-deploy-* user@nas-ip:/path/to/destination/
   ```

2. **Configure Environment**: Edit `.env.local` with your credentials
   ```bash
   nano .env.local
   ```

3. **Start the App**:
   ```bash
   ./start.sh
   ```

## Deployment Options

### Option A: Direct Node.js
```bash
./start.sh
```

### Option B: PM2 (Recommended)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option C: Systemd Service
```bash
# 1. Edit iptv.service file (update paths and user)
# 2. Copy to systemd
sudo cp iptv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable iptv
sudo systemctl start iptv
sudo systemctl status iptv
```

### Option D: Docker
```bash
# Build from parent directory where Dockerfile exists
docker build -t iptv-app .
docker run -d -p 3001:3001 --env-file .env.local --name iptv-app iptv-app
```

## Access

- Default URL: `http://your-nas-ip:3001`
- Change port by setting `PORT` environment variable

## Troubleshooting

### Check if port is in use
```bash
lsof -ti:3001
```

### View logs
```bash
# PM2
pm2 logs iptv-app

# Systemd
sudo journalctl -u iptv -f
```

### Restart app
```bash
# PM2
pm2 restart iptv-app

# Systemd
sudo systemctl restart iptv
```

## Notes

- Node.js 18+ required
- Ensure .env.local has valid credentials
- For production, use reverse proxy (Nginx/Apache)
- Consider HTTPS setup for security
EOF

# Create archive
echo -e "${BLUE}📦 Creating archive...${NC}"
tar -czf "${DEPLOY_DIR}.tar.gz" "$DEPLOY_DIR"

echo ""
echo -e "${GREEN}✅ Deployment package created successfully!${NC}"
echo ""
echo "📁 Package location: ${DEPLOY_DIR}.tar.gz"
echo "📏 Package size: $(du -h "${DEPLOY_DIR}.tar.gz" | cut -f1)"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Edit ${DEPLOY_DIR}/.env.local with your credentials"
echo "2. Transfer to NAS: scp ${DEPLOY_DIR}.tar.gz user@nas-ip:/path/"
echo "3. Extract: tar -xzf ${DEPLOY_DIR}.tar.gz"
echo "4. Run: cd ${DEPLOY_DIR} && ./start.sh"
echo ""
echo -e "${GREEN}📖 Full deployment guide: DEPLOYMENT.md${NC}"
