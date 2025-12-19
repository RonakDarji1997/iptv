#!/bin/bash

# IPTV Production Deployment Script
# This script automates the deployment of both backend and web portal

set -e  # Exit on error

echo "=================================="
echo "🚀 IPTV Deployment Script"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory (works both locally and in production)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WEB_PORTAL_DIR="$SCRIPT_DIR/web-portal"
BACKEND_DIR="$SCRIPT_DIR/iptv-sync-backend"

echo "📂 Project directory: $SCRIPT_DIR"
echo ""

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Step 1: Git Pull
print_info "=================================="
print_info "📥 Step 1: Pulling latest changes from Git"
print_info "=================================="
cd "$SCRIPT_DIR"
print_info "Running git pull..."
sudo git pull origin updates-branch || {
    print_error "Git pull failed"
    exit 1
}
print_success "Git pull completed"
echo ""

# Step 2: Deploy Web Portal
print_info "=================================="
print_info "🌐 Step 2: Deploying Web Portal"
print_info "=================================="
cd "$WEB_PORTAL_DIR"

print_info "Installing dependencies..."
sudo npm install --legacy-peer-deps || {
    print_error "npm install failed for web portal"
    exit 1
}
print_success "Dependencies installed"

print_info "Building web portal..."
sudo npm run build || {
    print_error "Build failed for web portal"
    exit 1
}
print_success "Web portal built successfully"

print_info "Restarting PM2 process: iptv-web-portal..."
sudo pm2 restart iptv-web-portal || {
    print_error "PM2 restart failed"
    exit 1
}
print_success "Web portal restarted"

print_info "Saving PM2 configuration..."
sudo pm2 save
print_success "PM2 configuration saved"
echo ""

# Step 3: Deploy Backend API
print_info "=================================="
print_info "🔧 Step 3: Deploying Backend API"
print_info "=================================="
cd "$BACKEND_DIR"

# Check if Docker network exists and create if needed
print_info "Checking Docker network connectivity..."
if ! sudo docker network ls | grep -q "iptv_iptv-network"; then
    print_warning "External network 'iptv_iptv-network' not found. Creating it..."
    sudo docker network create iptv_iptv-network || print_warning "Network might already exist"
fi
print_success "Docker network verified"

# Ensure postgres and redis containers are running
print_info "Ensuring database and redis are running..."
sudo docker-compose up -d postgres redis || {
    print_error "Failed to start postgres/redis"
    exit 1
}
print_success "Database and Redis are running"

print_info "Waiting for database to be healthy..."
for i in {1..30}; do
    if sudo docker ps | grep -q "iptv-sync-postgres.*healthy" || sudo docker exec iptv-sync-postgres pg_isready -U postgres > /dev/null 2>&1; then
        print_success "Database is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Database failed to become healthy"
        sudo docker-compose logs postgres
        exit 1
    fi
    sleep 2
done

print_info "Running database migrations..."
# Detect the postgres container name (could be iptv-postgres or iptv-sync-postgres)
POSTGRES_CONTAINER=$(sudo docker ps --filter "name=postgres" --format "{{.Names}}" | grep -E "iptv.*postgres" | head -n 1)

if [ -z "$POSTGRES_CONTAINER" ]; then
  print_error "Postgres container not found"
  exit 1
fi

print_info "Using postgres container: $POSTGRES_CONTAINER"

# Run migrations directly inside the postgres container
sudo docker exec "$POSTGRES_CONTAINER" sh -c '
  cd /migrations 2>/dev/null || { echo "❌ Migrations directory not found"; exit 1; }
  
  echo "🔄 Running migrations..."
  for file in *.sql; do
    [ -e "$file" ] || continue
    filename=$(basename "$file")
    echo "📄 Checking migration: $filename"
    
    # Check if migration already executed
    executed=$(PGPASSWORD=test123 psql -U postgres -d iptv_sync -tAc "SELECT COUNT(*) FROM migrations WHERE name = '\''$filename'\''" 2>/dev/null || echo "0")
    
    if [ "$executed" = "0" ]; then
      # Create migrations table if it does not exist
      PGPASSWORD=test123 psql -U postgres -d iptv_sync -c "CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )" > /dev/null 2>&1
      
      echo "🔄 Running: $filename"
      if PGPASSWORD=test123 psql -U postgres -d iptv_sync -f "$file"; then
        PGPASSWORD=test123 psql -U postgres -d iptv_sync -c "INSERT INTO migrations (name) VALUES ('\''$filename'\'')" > /dev/null
        echo "✅ Completed: $filename"
      else
        echo "❌ Failed: $filename"
        exit 1
      fi
    else
      echo "⏭️  Skipped (already executed): $filename"
    fi
  done
  echo "✅ All migrations completed"
' || {
  print_error "Database migrations failed"
  print_warning "Showing postgres logs:"
  sudo docker logs --tail=50 "$POSTGRES_CONTAINER"
  exit 1
}
print_success "Database migrations completed"

print_info "Building Docker image for backend API..."
sudo docker-compose build api || {
    print_error "Docker build failed for backend"
    exit 1
}
print_success "Backend Docker image built"

print_info "Restarting backend API container..."
sudo docker-compose up -d api || {
    print_error "Docker restart failed for backend"
    exit 1
}
print_success "Backend API container restarted"

print_info "Waiting for backend to be ready..."
sleep 10

if sudo docker ps | grep -q "iptv-sync-api"; then
    print_success "Backend API container is running"
    
    # Verify API is accessible
    print_info "Testing API health endpoint..."
    if sudo docker exec iptv-sync-api curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_success "API health check passed"
    else
        print_warning "API health check failed (might still be starting up)"
    fi
else
    print_error "Backend API container is not running"
    print_warning "Showing last 50 lines of logs:"
    sudo docker-compose logs --tail=50 api
    exit 1
fi

# Verify network connectivity
print_info "Verifying network connectivity..."
if sudo docker network inspect iptv_iptv-network | grep -q "iptv-sync-api"; then
    print_success "API is connected to iptv_iptv-network"
else
    print_warning "API might not be connected to iptv_iptv-network"
fi
echo ""

# Step 4: Verify Deployments
print_info "=================================="
print_info "✅ Step 4: Verification"
print_info "=================================="

print_info "PM2 processes:"
sudo pm2 list | grep iptv-web-portal || print_warning "Web portal not found in PM2"

print_info "Docker containers:"
sudo docker ps | grep iptv-sync || print_warning "Backend services not found in Docker"

echo ""
print_success "=================================="
print_success "Deployment completed successfully!"
print_success "=================================="
echo ""
echo "📊 Service Status:"
echo "  - Web Portal: PM2 (iptv-web-portal)"
echo "  - Backend API: Docker (iptv-sync-api)"
echo ""
echo "📝 View Logs:"
echo "  - Web Portal: sudo pm2 logs iptv-web-portal"
echo "  - Backend API: sudo docker-compose -f $BACKEND_DIR/docker-compose.yml logs -f api"
echo ""
echo "🔧 Manage Services:"
echo "  - PM2: sudo pm2 status | restart | stop iptv-web-portal"
echo "  - Docker: sudo docker ps | sudo docker-compose logs api"
echo ""
