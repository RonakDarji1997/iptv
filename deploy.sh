#!/bin/bash

# IPTV Production Deployment Script
# This script automates the deployment of both backend and web portal

set -e  # Exit on error

echo "🚀 Starting IPTV Production Deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="/root/iptv"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root or with sudo"
   exit 1
fi

# Update code from git
print_info "Pulling latest changes from git..."
cd $PROJECT_ROOT
git fetch origin
git checkout updates-branch
git pull origin updates-branch

# Deploy Backend
print_info "=== Deploying Backend ==="
cd $PROJECT_ROOT/iptv-sync-backend

# Check if .env.production exists
if [ ! -f .env.production ]; then
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
