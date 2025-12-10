# Connecting Local Development to Docker-NAS Database

This guide explains how to connect your local development environment to the PostgreSQL database running on docker-nas.

## Prerequisites

- Docker containers (PostgreSQL and Redis) running on docker-nas
- SSH access to docker-nas
- Network connectivity to docker-nas

## Connection Methods

### Method 1: SSH Tunnel (Recommended - Most Secure)

This method creates an encrypted SSH tunnel to forward ports from docker-nas to your local machine.

#### Steps:

1. **Update the SSH tunnel script** with your docker-nas credentials:
   ```bash
   nano connect-to-docker-nas.sh
   ```
   
   Update these values:
   ```bash
   DOCKER_NAS_USER="your-username"      # Your SSH username on docker-nas
   DOCKER_NAS_HOST="docker-nas"         # Hostname or IP (e.g., 192.168.1.100)
   DOCKER_NAS_SSH_PORT="22"             # SSH port (usually 22)
   ```

2. **Start the SSH tunnel**:
   ```bash
   ./connect-to-docker-nas.sh
   ```
   
   Keep this terminal window open while developing.

3. **The DATABASE_URL in `.env.local` is already configured** for SSH tunnel:
   ```
   DATABASE_URL="postgresql://postgres:postgres_password_change_me@localhost:5432/iptv_sync"
   ```

4. **Test the connection**:
   ```bash
   cd iptv-sync-backend
   npm run dev
   ```

### Method 2: Direct Connection (Simpler but Less Secure)

Connect directly to docker-nas over your local network.

#### Steps:

1. **Find your docker-nas IP address**:
   ```bash
   # On docker-nas, run:
   ip addr show | grep inet
   ```
   
   Or check your router's DHCP table for the docker-nas IP.

2. **Update `.env.local`** to use direct connection:
   ```env
   # Comment out SSH tunnel connection
   # DATABASE_URL="postgresql://postgres:postgres_password_change_me@localhost:5432/iptv_sync"
   
   # Use direct connection (replace 192.168.1.xxx with your docker-nas IP)
   DATABASE_URL="postgresql://postgres:postgres_password_change_me@192.168.1.xxx:5432/iptv_sync"
   ```

3. **Ensure PostgreSQL accepts remote connections**:
   
   Check that docker-compose.yml on docker-nas has PostgreSQL port exposed:
   ```yaml
   ports:
     - "5432:5432"  # Should be present
   ```

4. **Test the connection**:
   ```bash
   cd iptv-sync-backend
   npm run dev
   ```

## Environment Variables

The `.env.local` file contains all necessary configuration:

```env
# Database connection (choose one method above)
DATABASE_URL="postgresql://postgres:postgres_password_change_me@localhost:5432/iptv_sync"

# Redis connection (via SSH tunnel)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password_change_me

# Application settings
JWT_SECRET=change-this-to-a-random-secret-in-production
JWT_REFRESH_SECRET=change-this-to-another-random-secret-in-production
NODE_ENV=development
PORT=3000
```

## Verifying the Connection

### Test PostgreSQL Connection:

```bash
# If using SSH tunnel:
psql -h localhost -p 5432 -U postgres -d iptv_sync

# If using direct connection:
psql -h <docker-nas-ip> -p 5432 -U postgres -d iptv_sync
```

Password: `postgres_password_change_me`

### Test from Node.js:

```bash
cd iptv-sync-backend
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.\$connect().then(() => console.log('✅ Connected!')).catch(e => console.error('❌ Failed:', e));"
```

## Troubleshooting

### Connection Refused

**SSH Tunnel:**
- Ensure SSH service is running on docker-nas
- Verify SSH credentials are correct
- Check if port 22 is accessible: `nc -zv <docker-nas-ip> 22`

**Direct Connection:**
- Verify docker-nas IP address is correct
- Ensure PostgreSQL container is running: `docker ps | grep postgres`
- Check firewall rules on docker-nas
- Test port accessibility: `nc -zv <docker-nas-ip> 5432`

### Authentication Failed

- Verify the password in `.env.local` matches docker-compose.yml
- Default password: `postgres_password_change_me`
- Username should be: `postgres`
- Database name should be: `iptv_sync`

### Database Does Not Exist

If the database hasn't been created yet:

```bash
# Connect to PostgreSQL
psql -h localhost -p 5432 -U postgres

# Create database
CREATE DATABASE iptv_sync;

# Exit
\q

# Run Prisma migrations
cd iptv-sync-backend
npx prisma migrate deploy
```

### SSH Tunnel Keeps Disconnecting

Add keep-alive to SSH config:

```bash
# Edit ~/.ssh/config
nano ~/.ssh/config

# Add these lines:
Host docker-nas
    HostName <docker-nas-ip>
    User <your-username>
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Then use: `./connect-to-docker-nas.sh`

## Running Multiple Projects

Each project can use the same database connection:

### Backend API:
```bash
cd iptv-sync-backend
npm run dev
```

### Web Portal:
```bash
cd web-portal
npm run dev
```

### Mobile App:
```bash
cd mobile-app
npm start
```

All will connect to the same PostgreSQL database on docker-nas.

## Security Notes

1. **SSH Tunnel** is the most secure method for production-like environments
2. **Direct Connection** should only be used on trusted local networks
3. **Change default passwords** in production environments
4. Consider using **SSL/TLS** for PostgreSQL connections in production
5. Never commit `.env.local` to version control (it's already in .gitignore)

## Quick Reference

### Start SSH Tunnel:
```bash
./connect-to-docker-nas.sh
```

### Stop SSH Tunnel:
```
Press Ctrl+C in the tunnel terminal
```

### Check Connection:
```bash
psql postgresql://postgres:postgres_password_change_me@localhost:5432/iptv_sync -c "SELECT version();"
```

### View Database Tables:
```bash
cd iptv-sync-backend
npx prisma studio
```

This opens Prisma Studio at http://localhost:5555 to browse your database.
