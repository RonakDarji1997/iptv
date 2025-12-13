# IPTV Production Deployment Guide

## Architecture Overview

- **Backend API**: `http://api.iptv.ronika.co/api` (runs on port 3000, proxied through nginx)
- **Web Portal**: `http://iptv.ronika.co` (runs on port 3001)
- **Nginx**: Handles routing `/api/` to backend and `/subtitle/` to whisper service

## Prerequisites

1. Node.js 18+ and npm installed
2. PostgreSQL database running
3. PM2 installed globally: `npm install -g pm2`
4. Git access to the repository

## Deployment Steps

### 1. Backend Deployment

```bash
# Navigate to project root
cd /root/iptv

# Pull latest changes
git fetch origin
git checkout updates-branch
git pull origin updates-branch

# Navigate to backend
cd iptv-sync-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.production
nano .env.production  # Edit with your database credentials and secrets

# Build the project
npm run build

# Run database migrations (SAFE - won't lose data)
npm run db:migrate

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 2. Web Portal Deployment

```bash
# Navigate to web portal
cd /root/iptv/web-portal

# Install dependencies
npm install

# Build for production
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
```

### 3. Nginx Configuration (if needed)

The nginx configuration is already set up to proxy:
- `/api/` → Backend (port 3000)
- `/subtitle/` → Whisper service (port 8882)

Your domain should point to the nginx server.

### 4. Verify Deployment

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs iptv-sync-backend
pm2 logs iptv-web-portal

# Monitor processes
pm2 monit
```

## Environment Variables

### Backend (.env.production)
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secure random string for JWT signing
- `JWT_REFRESH_SECRET`: Secure random string for refresh tokens
- `CORS_ORIGIN`: Allowed origins (your domain)
- `PORT`: 3000 (default)

### Web Portal (.env.production)
- `NEXT_PUBLIC_API_URL`: http://api.iptv.ronika.co/api
- `NODE_ENV`: production

## Database Migration Notes

The migration command is **SAFE** and follows these principles:
- Only adds new tables/columns if they don't exist
- Never drops or modifies existing data
- Idempotent - can be run multiple times safely
- Creates tables: users, providers, categories, content, devices, watch_history, etc.

## PM2 Commands

```bash
# Start apps
pm2 start ecosystem.config.js

# Restart apps
pm2 restart iptv-sync-backend
pm2 restart iptv-web-portal

# Stop apps
pm2 stop iptv-sync-backend
pm2 stop iptv-web-portal

# View logs
pm2 logs [app-name]

# Monitor resources
pm2 monit

# List all processes
pm2 list

# Delete from PM2
pm2 delete [app-name]

# Restart all
pm2 restart all

# Save current PM2 list
pm2 save

# Reload PM2 processes (zero-downtime)
pm2 reload all
```

## Domain & Port Binding

### For Backend (already configured via nginx)
Nginx proxies `http://api.iptv.ronika.co/api` to `localhost:3000`

### For Web Portal
You need to bind your domain to port 3001. Options:

1. **Using Nginx (Recommended)**:
   ```nginx
   server {
       listen 80;
       server_name iptv.ronika.co;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

2. **Direct Port Binding**:
   - Point DNS A record to server IP
   - Configure firewall to allow port 3001
   - Access via `http://iptv.ronika.co:3001`

## Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs iptv-sync-backend --lines 100

# Check database connection
psql -U user -d iptv_sync -h localhost

# Test backend directly
curl http://localhost:3000/health
```

### Web Portal won't start
```bash
# Check logs
pm2 logs iptv-web-portal --lines 100

# Check if port 3001 is available
lsof -i :3001

# Test portal directly
curl http://localhost:3001
```

### API Connection Issues
```bash
# Check nginx is running
systemctl status nginx

# Test API endpoint
curl http://api.iptv.ronika.co/api/health

# Check nginx logs
tail -f /var/log/nginx/error.log
```

## Updates & Maintenance

```bash
# Pull latest changes
cd /root/iptv
git pull origin updates-branch

# Update backend
cd iptv-sync-backend
npm install
npm run build
npm run db:migrate
pm2 restart iptv-sync-backend

# Update web portal
cd ../web-portal
npm install
npm run build
pm2 restart iptv-web-portal
```

## Security Checklist

- [ ] Update `JWT_SECRET` and `JWT_REFRESH_SECRET` in .env.production
- [ ] Configure strong database password
- [ ] Set proper CORS origins
- [ ] Enable HTTPS (SSL certificates)
- [ ] Configure firewall rules
- [ ] Set up backup for PostgreSQL database
- [ ] Enable PM2 monitoring and alerts
- [ ] Review nginx rate limiting
- [ ] Keep dependencies updated

## Monitoring

```bash
# Enable PM2 Plus (optional monitoring service)
pm2 link [secret-key] [public-key]

# Or use simple monitoring
pm2 monit

# Check system resources
htop
```

## Backup Strategy

```bash
# Backup PostgreSQL database
pg_dump -U user iptv_sync > backup_$(date +%Y%m%d).sql

# Backup with compression
pg_dump -U user iptv_sync | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
psql -U user iptv_sync < backup_20231213.sql
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run successfully
- [ ] PM2 processes running
- [ ] Nginx configuration updated
- [ ] Domain DNS pointing to server
- [ ] SSL certificates installed (optional)
- [ ] Firewall configured
- [ ] PM2 startup script enabled
- [ ] Logs directory created and writable
- [ ] Database backup configured
- [ ] Monitoring set up

## Support

For issues or questions:
1. Check logs: `pm2 logs`
2. Review this deployment guide
3. Check nginx logs: `/var/log/nginx/error.log`
4. Verify database connection
