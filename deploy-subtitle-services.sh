#!/bin/bash

# Subtitle Services Deployment Script for NAS
# This script deploys the Node.js subtitle server and Python Whisper service to your Synology NAS

set -e

echo "🚀 Deploying Subtitle Services to NAS..."
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.subtitle.yml"
SERVICES_DIR="/volume1/docker/subtitle-services"

# Check if running on NAS
if ! command -v synopkg &> /dev/null; then
    echo -e "${RED}❌ This script should be run on your Synology NAS${NC}"
    echo ""
    echo "Please SSH into your NAS and run:"
    echo "  scp docker-compose.subtitle.yml admin@nas-ip:/tmp/"
    echo "  ssh admin@nas-ip"
    echo "  cd /tmp && chmod +x deploy-subtitle-services.sh && ./deploy-subtitle-services.sh"
    echo ""
    exit 1
fi

echo -e "${BLUE}📍 Detected Synology NAS environment${NC}"
echo ""

# Create services directory
echo -e "${BLUE}📁 Creating services directory: ${SERVICES_DIR}${NC}"
sudo mkdir -p "$SERVICES_DIR"
cd "$SERVICES_DIR"

# Copy docker-compose file
echo "📋 Copying docker-compose configuration..."
sudo cp /tmp/docker-compose.subtitle.yml ./docker-compose.yml

# Create necessary directories
echo "📁 Creating subtitle directories..."
sudo mkdir -p android-tv-native/whisper-backend/subtitles
sudo mkdir -p android-tv-native/whisper-backend/uploads

# Set proper permissions
echo "🔐 Setting permissions..."
sudo chmod -R 755 android-tv-native/
sudo chown -R admin:users android-tv-native/

# Stop any existing containers
echo "🛑 Stopping existing containers..."
sudo docker compose down 2>/dev/null || true

# Clean up old images (optional)
echo "🧹 Cleaning up old Docker images..."
sudo docker image prune -f

# Start services
echo -e "${BLUE}🚀 Starting subtitle services...${NC}"
sudo docker compose up -d

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 10

# Check service status
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
sudo docker compose ps

# Test services
echo ""
echo -e "${BLUE}🧪 Testing services:${NC}"

# Test Python service
echo "Testing Python Whisper service (port 8771)..."
if curl -f -s http://localhost:8771/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Python service is healthy${NC}"
else
    echo -e "${RED}❌ Python service is not responding${NC}"
fi

# Test Node.js service
echo "Testing Node.js subtitle server (port 8770)..."
if curl -f -s http://localhost:8770/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Subtitle server is healthy${NC}"
else
    echo -e "${RED}❌ Subtitle server is not responding${NC}"
fi

# Get NAS IP for configuration
NAS_IP=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -n 1)
if [ -z "$NAS_IP" ]; then
    NAS_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "🎯 Services are running on:"
echo "   📡 Python Whisper Service: http://${NAS_IP}:8771"
echo "   🎬 Subtitle Server: http://${NAS_IP}:8770"
echo ""
echo "📝 Update your Android app configuration:"
echo "   In SubtitleService.kt, change backendUrl to:"
echo "   private val backendUrl = \"http://${NAS_IP}:8770\""
echo ""
echo "🔍 Monitor services:"
echo "   sudo docker compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   sudo docker compose down"
echo ""
echo "🔄 Restart services:"
echo "   sudo docker compose restart"
echo ""

# Create monitoring script
cat > monitor-services.sh << 'EOF'
#!/bin/bash
echo "📊 Subtitle Services Monitor"
echo "============================"
echo ""
echo "🐳 Docker containers:"
docker ps --filter "name=whisper-python\|subtitle-server"
echo ""
echo "🌐 Service health:"
echo "Python service (8771): $(curl -s http://localhost:8771/health | jq -r '.status' 2>/dev/null || echo 'DOWN')"
echo "Subtitle server (8770): $(curl -s http://localhost:8770/health | jq -r '.status' 2>/dev/null || echo 'DOWN')"
echo ""
echo "📋 Active subtitle jobs:"
curl -s http://localhost:8770/active-jobs | jq '.' 2>/dev/null || echo "Unable to fetch jobs"
echo ""
echo "💾 Disk usage:"
df -h /volume1 | tail -1
EOF

chmod +x monitor-services.sh
echo -e "${GREEN}📊 Created monitoring script: monitor-services.sh${NC}"
echo "   Run: ./monitor-services.sh"
echo ""

echo -e "${GREEN}🎉 Subtitle services are now running on your NAS!${NC}"