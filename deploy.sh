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
sudo npm install || {
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
sleep 5

if sudo docker ps | grep -q "iptv-sync-api"; then
    print_success "Backend API container is running"
else
    print_error "Backend API container is not running"
    print_warning "Showing last 50 lines of logs:"
    sudo docker-compose logs --tail=50 api
    exit 1
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

    print_warning ".env.production not found, creating from example..."
    cp .env.example .env.production
    print_error "Please edit .env.production with your credentials before continuing!"
    exit 1
fi

# Install dependencies
print_info "Installing backend dependencies..."
npm install

# Build backend
print_info "Building backend..."
npm run build

# Run migrations (safe - won't lose data)
print_info "Running database migrations..."
npm run db:migrate

# Restart backend with PM2
print_info "Restarting backend with PM2..."
if pm2 list | grep -q "iptv-sync-backend"; then
    pm2 restart iptv-sync-backend
else
    pm2 start ecosystem.config.js --env production
fi

# Deploy Web Portal
print_info "=== Deploying Web Portal ==="
cd $PROJECT_ROOT/web-portal

# Install dependencies
print_info "Installing web portal dependencies..."
npm install

# Build web portal
print_info "Building web portal for production..."
npm run build

# Restart web portal with PM2
print_info "Restarting web portal with PM2..."
if pm2 list | grep -q "iptv-web-portal"; then
    pm2 restart iptv-web-portal
else
    pm2 start ecosystem.config.js --env production
fi

# Save PM2 configuration
print_info "Saving PM2 configuration..."
pm2 save

# Show PM2 status
print_info "=== PM2 Status ==="
pm2 list

print_info "✅ Deployment completed successfully!"
print_info ""
print_info "Useful commands:"
print_info "  - View logs: pm2 logs"
print_info "  - Monitor: pm2 monit"
print_info "  - Restart: pm2 restart all"
print_info "  - Backend logs: pm2 logs iptv-sync-backend"
print_info "  - Portal logs: pm2 logs iptv-web-portal"
