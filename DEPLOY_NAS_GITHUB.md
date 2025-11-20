# Deploy IPTV App to NAS via GitHub

## Quick Deployment Steps

### 1️⃣ Initial Setup (One Time)

#### On Your NAS:

```bash
# SSH into your NAS
ssh admin@your-nas-ip

# Navigate to your apps directory (adjust path for your NAS)
cd /volume1/docker  # Synology
# OR
cd /share/Container  # QNAP
# OR
cd /mnt/user/appdata  # Unraid

# Clone your GitHub repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git iptv-app
cd iptv-app

# Install Node.js if not already installed
# For Synology: Install via Package Center
# For QNAP: Install via App Center
# For others: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

# Create environment file
nano .env.local
```

**Add to .env.local:**
```env
NEXT_PUBLIC_STALKER_BEARER=your_bearer_token_here
NEXT_PUBLIC_STALKER_ADID=your_adid_here
NEXT_PUBLIC_APP_PASSWORD_HASH=your_bcrypt_hash_here
```

**Build and start:**
```bash
# Install dependencies
npm install

# Build the app
npm run build

# Install PM2 for process management
npm install -g pm2

# Start the app
pm2 start npm --name "iptv" -- start

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
# Follow the command it outputs
```

### 2️⃣ Deploying Updates (Every Time)

#### On Your Local Machine:

```bash
# Make your changes, then:
git add .
git commit -m "Your update message"
git push origin main
```

#### On Your NAS:

```bash
# SSH into NAS
ssh admin@your-nas-ip
cd /volume1/docker/iptv-app

# Pull latest changes
git pull origin main

# Rebuild
npm install
npm run build

# Restart the app
pm2 restart iptv
```

### 3️⃣ Access Your App

Open browser: **`http://your-nas-ip:3001`**

---

## Alternative: Docker Deployment

If you prefer Docker on your NAS:

### Initial Setup:

```bash
# Clone repo (same as above)
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git iptv-app
cd iptv-app

# Create .env.local with your credentials
nano .env.local

# Build and run with Docker
docker compose up -d
```

### Updates:

```bash
cd /volume1/docker/iptv-app
git pull origin main
docker compose down
docker compose build
docker compose up -d
```

---

## Synology DSM Specific

### Using Synology Container Manager (Docker):

1. Open **Container Manager** in DSM
2. Go to **Registry** → Search "node" → Download "node:20-alpine"
3. Go to **Project** → Create → Choose your folder
4. Use the `docker-compose.yml` from the repo
5. Start the project

### File Locations:
- Apps: `/volume1/docker/`
- Logs: `pm2 logs iptv`
- Restart: `pm2 restart iptv`

---

## QNAP Specific

### Using Container Station:

1. Open **Container Station**
2. Create new container from image "node:20-alpine"
3. Mount volume: `/share/Container/iptv-app` → `/app`
4. Port mapping: `3001:3001`
5. Command: `npm start`

### File Locations:
- Apps: `/share/Container/`
- Access via SSH: Port 22 (enable SSH in QNAP settings)

---

## Common Commands

```bash
# Check if app is running
pm2 status

# View logs
pm2 logs iptv

# Restart app
pm2 restart iptv

# Stop app
pm2 stop iptv

# View app info
pm2 show iptv

# Monitor resources
pm2 monit
```

---

## Troubleshooting

### Port 3001 already in use
```bash
# Find what's using the port
lsof -ti:3001
# Kill the process
kill -9 $(lsof -ti:3001)
# Restart your app
pm2 restart iptv
```

### App not starting
```bash
# Check logs
pm2 logs iptv --lines 50

# Check Node version (needs v18+)
node --version

# Rebuild
npm install
npm run build
pm2 restart iptv
```

### Can't access from browser
- Check firewall on NAS
- Verify port 3001 is open
- Try: `http://localhost:3001` from NAS browser first
- Check if app is running: `pm2 status`

### Git pull errors
```bash
# Stash local changes
git stash

# Pull updates
git pull origin main

# Reapply your .env.local if needed
```

---

## Security Tips

1. **Don't commit .env.local to GitHub** (already in .gitignore)
2. **Use firewall rules** to limit access to your NAS IP only
3. **Change the password hash** from default
4. **Use HTTPS** if exposing to internet (setup reverse proxy)
5. **Keep Node.js updated** on your NAS

---

## One-Line Update Script

Create `update.sh` on your NAS:

```bash
#!/bin/bash
cd /volume1/docker/iptv-app && \
git pull origin main && \
npm install && \
npm run build && \
pm2 restart iptv && \
echo "✅ Update complete!"
```

Make executable and run:
```bash
chmod +x update.sh
./update.sh
```

---

## Need Help?

1. Check PM2 logs: `pm2 logs iptv`
2. Verify environment variables are set in `.env.local`
3. Ensure Node.js version is 18 or higher: `node --version`
4. Test Stalker portal connection from NAS
5. Check NAS firewall settings

---

**Default Login Password**: The password you set in `NEXT_PUBLIC_APP_PASSWORD_HASH`

To generate a new hash, run on your local machine:
```bash
node scripts/hash-password.js
```
