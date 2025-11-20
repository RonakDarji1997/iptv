# Deploy Ronika's IPTV (Expo RN) to NAS via GitHub + Docker

## Your Setup
- **App**: Expo React Native (mobile app)
- **Deployment**: Docker on Synology NAS
- **Source**: GitHub repository

## Quick Deployment Steps

### 1️⃣ Initial Setup (One Time)

#### On Your NAS:

```bash
# SSH into your NAS
ssh ronak-admin@your-nas-ip

# Navigate to docker directory
cd /volume1/docker

# Clone your GitHub repository
git clone https://github.com/RonakDarji1997/iptv.git
cd iptv

# Create environment file for Expo app
cd expo-rn
nano .env.local
```

**Add to expo-rn/.env.local:**
```env
EXPO_PUBLIC_STALKER_BEARER=your_bearer_token_here
EXPO_PUBLIC_STALKER_ADID=your_adid_here
EXPO_PUBLIC_STALKER_MAC=your_mac_address
EXPO_PUBLIC_STALKER_URL=your_portal_url
EXPO_PUBLIC_APP_PASSWORD_HASH=your_bcrypt_hash_here
```

**Start with Docker:**
```bash
# Go back to root directory
cd /volume1/docker/iptv

# Start the Expo app with Docker
docker compose up -d

# Check if running
docker ps
```

### 2️⃣ Deploying Updates (Every Time)

#### On Your Local Machine:

```bash
# Make your changes in expo-rn folder
cd expo-rn
# Test locally first with: npx expo start

# Push to GitHub
cd ..
git add .
git commit -m "Update app"
git push origin main
```

#### On Your NAS:

```bash
# SSH into NAS
ssh ronak-admin@your-nas-ip
cd /volume1/docker/iptv

# Stash any local changes (like .env.local)
sudo git stash

# Pull latest changes from GitHub
sudo git pull origin main

# Reapply local changes if needed
sudo git stash pop

# Rebuild and restart Docker container
docker compose down
docker compose build
docker compose up -d

# Check logs
docker logs iptv-app
```

### 3️⃣ Access Your App

- **Mobile**: Install Expo Go app, scan QR code from `http://nas-ip:3005`
- **Web**: Open browser at `http://nas-ip:3005`

---

## Docker Commands Reference

```bash
# View running containers
docker ps

# View logs
docker logs iptv-app
docker logs -f iptv-app  # Follow logs

# Restart container
docker compose restart

# Stop container
docker compose down

# Rebuild after code changes
docker compose build --no-cache

# Start fresh
docker compose down && docker compose build && docker compose up -d
```

---

## Handling Git Conflicts

If you get "Your local changes would be overwritten" error:

```bash
# Option 1: Stash local changes (recommended)
sudo git stash
sudo git pull origin main
sudo git stash pop  # Reapply your .env.local

# Option 2: Force overwrite with GitHub version
sudo git reset --hard origin/main
# Then recreate your .env.local file

# Option 3: Commit local changes first
sudo git add .
sudo git commit -m "Local NAS changes"
sudo git pull origin main
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

## Troubleshooting

### Port 3005 already in use
```bash
# Find what's using the port
docker ps
# Stop conflicting container
docker stop container_name

# Or kill the process
sudo lsof -ti:3005 | xargs kill -9
```

### Container not starting
```bash
# Check logs for errors
docker logs iptv-app

# Check if image built correctly
docker images | grep iptv

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Can't access from mobile device
- Make sure mobile device is on same network as NAS
- Check NAS firewall allows port 3005
- Try accessing from NAS browser first: `http://localhost:3005`
- Verify container is running: `docker ps`

### Git pull conflicts
```bash
# Your Dockerfile was modified locally
sudo git stash
sudo git pull origin main
sudo git stash pop
```

### Environment variables not working
```bash
# Check if .env.local exists in expo-rn folder
ls -la /volume1/docker/iptv/expo-rn/.env.local

# Rebuild to pick up new env vars
docker compose down
docker compose build --no-cache
docker compose up -d
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
cd /volume1/docker/iptv && \
sudo git stash && \
sudo git pull origin main && \
sudo git stash pop && \
docker compose down && \
docker compose build && \
docker compose up -d && \
echo "✅ Update complete! App running on port 3005"
```

Make executable and run:
```bash
chmod +x update.sh
./update.sh
```

---

## Need Help?

1. Check Docker logs: `docker logs iptv-app -f`
2. Verify environment variables in `expo-rn/.env.local`
3. Ensure Docker is running: `docker ps`
4. Test Stalker portal connection from NAS
5. Check NAS firewall settings for port 3005
6. Make sure mobile device is on same network

---

## App Configuration

**Login Password**: The password you set in `EXPO_PUBLIC_APP_PASSWORD_HASH`

To generate a new password hash, run on your local machine:
```bash
cd expo-rn
node ../scripts/hash-password.js
```

Then copy the hash to your NAS `.env.local` file.

---

## Ports Used

- **3005**: Expo Metro bundler (development server)
- Access from mobile: Install Expo Go app, scan QR code
- Access from web: `http://nas-ip:3005`
