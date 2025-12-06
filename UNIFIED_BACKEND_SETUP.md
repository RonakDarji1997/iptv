# Unified IPTV Backend - Docker Setup

This setup combines both the IPTV Sync Backend and Whisper Subtitle Backend behind a single nginx reverse proxy.

## Architecture

```
                    ┌─────────────────┐
                    │   Port 80/443   │
                    │  api.iptv.      │
                    │  ronika.co      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Nginx Proxy   │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
       ┌────────▼──────┐ ┌──▼─────────┐ │
       │  IPTV API     │ │  Whisper   │ │
       │  Port 3000    │ │  Port 3001 │ │
       └───────┬───────┘ └────────────┘ │
               │                         │
       ┌───────▼───────┐ ┌──────────────▼─┐
       │  PostgreSQL   │ │     Redis      │
       │  Port 5432    │ │   Port 6379    │
       └───────────────┘ └────────────────┘
```

## API Endpoints

**Note:** Using unique ports 8880 (HTTP) and 8443 (HTTPS) to avoid conflicts with other apps.

### IPTV Sync API
- Base URL: `http://api.iptv.ronika.co:8880/api/`
- Routes:
  - `/api/stalker-proxy/*` - Stalker portal proxy
  - `/api/health` - Health check

### Whisper Subtitle API
- Base URL: `http://api.iptv.ronika.co:8880/subtitle/`
- Routes:
  - `/subtitle/generate` - Generate subtitles
  - `/subtitle/status/:id` - Check subtitle status
  - `/subtitle/ws` - WebSocket for live subtitles

## Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DB_PASSWORD=your_secure_postgres_password

# Redis
REDIS_PASSWORD=your_secure_redis_password

# Whisper Settings
WHISPER_MODEL=tiny
MAX_CONCURRENT_JOBS=3
```

## Quick Start

### Development (Local)
```bash
# Start all services
docker-compose -f docker-compose.unified.yml up -d

# View logs
docker-compose -f docker-compose.unified.yml logs -f

# Stop all services
docker-compose -f docker-compose.unified.yml down
```

### Production Deployment

1. **Setup DNS**
   ```bash
   # Point api.iptv.ronika.co to your server IP
   ```

2. **Start Services**
   ```bash
   docker-compose -f docker-compose.unified.yml up -d
   ```

3. **Enable SSL (Optional but Recommended)**
   ```bash
   # Install certbot
   sudo apt-get install certbot python3-certbot-nginx

   # Get SSL certificate
   sudo certbot --nginx -d api.iptv.ronika.co

   # Certificate will auto-renew
   ```

4. **Update Mobile App URLs**
   
   Update these files to use `https://api.iptv.ronika.co`:
   
   - `mobile-app/src/services/StalkerPortalClient.ts`
   - `mobile-app/src/hooks/useSubtitles.ts`

## Service Management

```bash
# View status
docker-compose -f docker-compose.unified.yml ps

# Restart specific service
docker-compose -f docker-compose.unified.yml restart iptv-api
docker-compose -f docker-compose.unified.yml restart whisper-api

# View logs for specific service
docker-compose -f docker-compose.unified.yml logs -f iptv-api
docker-compose -f docker-compose.unified.yml logs -f whisper-api

# Scale whisper workers (if needed)
docker-compose -f docker-compose.unified.yml up -d --scale whisper-api=3

# Clean up everything
docker-compose -f docker-compose.unified.yml down -v
```

## Health Checks

```bash
# Overall health
curl http://api.iptv.ronika.co:8880/health

# IPTV API health
curl http://api.iptv.ronika.co:8880/api/health

# Whisper API health
curl http://api.iptv.ronika.co:8880/subtitle/health
```

## Monitoring

### Check Service Status
```bash
# All containers
docker ps

# Resource usage
docker stats
```

### View Logs
```bash
# Nginx access logs
docker exec iptv-nginx tail -f /var/log/nginx/access.log

# Nginx error logs
docker exec iptv-nginx tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Port Conflicts
Using ports 8880 and 8443 to avoid conflicts. If these are still in use:
```bash
# Check what's using the ports
sudo lsof -i :8880
sudo lsof -i :8443

# Change ports in docker-compose.unified.yml if needed
# Edit the ports section under nginx service:
#   ports:
#     - "YOUR_PORT:80"
#     - "YOUR_SSL_PORT:443"
```

### Database Connection Issues
```bash
# Check if postgres is running
docker-compose -f docker-compose.unified.yml ps postgres

# Connect to database
docker exec -it iptv-postgres psql -U postgres -d iptv_sync

# Check logs
docker-compose -f docker-compose.unified.yml logs postgres
```

### Subtitle Generation Failing
```bash
# Check whisper logs
docker-compose -f docker-compose.unified.yml logs whisper-api

# Check if ffmpeg is installed
docker exec whisper-api ffmpeg -version

# Check Python and whisper installation
docker exec whisper-api python3 -c "import whisper; print(whisper.__version__)"
```

## Performance Tuning

### Nginx
- Adjust `worker_connections` in `nginx/nginx.conf`
- Tune rate limiting: `rate=10r/s` can be increased

### PostgreSQL
- Increase `max_connections` for high traffic
- Adjust `shared_buffers` and `work_mem`

### Whisper
- Use `base` or `small` model for better accuracy (slower)
- Increase `MAX_CONCURRENT_JOBS` if you have more CPU cores

## Security Notes

1. **Change default passwords** in `.env` file
2. **Enable SSL** in production
3. **Restrict CORS** in `nginx.conf` to your domain only
4. **Use firewall** to limit access to ports 5432 and 6379
5. **Regular updates**: `docker-compose pull && docker-compose up -d`
