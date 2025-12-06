#!/bin/bash

# Stream Subtitle Server Quick Start
# This script starts the backend server for subtitle generation

set -e

echo "🚀 Starting Stream Subtitle Server..."
echo ""

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ ERROR: FFmpeg is not installed!"
    echo ""
    echo "Please install FFmpeg first:"
    echo "  macOS:  brew install ffmpeg"
    echo "  Linux:  sudo apt-get install ffmpeg"
    echo ""
    exit 1
fi

echo "✅ FFmpeg found: $(ffmpeg -version | head -n1)"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ ERROR: Python 3 is not installed!"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo ""

# Check if required Python packages are installed
echo "📦 Checking Python dependencies..."
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Installing Python dependencies..."
    pip3 install flask flask-cors faster-whisper numpy
fi

echo "✅ Python dependencies OK"
echo ""

# Check if Node.js modules are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

echo "✅ Node.js dependencies OK"
echo ""

# Kill any existing instances
echo "🔄 Stopping any existing instances..."
lsof -ti:8770 | xargs kill -9 2>/dev/null || true
lsof -ti:8771 | xargs kill -9 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════"
echo "  Stream Subtitle Server"
echo "════════════════════════════════════════════"
echo ""
echo "  📺 Node.js Server:  http://localhost:8770"
echo "  🎙️  Python Service:  http://localhost:8771"
echo ""
echo "  Endpoints:"
echo "    POST   /start-subtitle"
echo "    POST   /stop-subtitle"
echo "    GET    /subtitle/:id.vtt"
echo "    GET    /active-jobs"
echo "    GET    /health"
echo ""
echo "════════════════════════════════════════════"
echo ""

# Start the server
node stream-subtitle-server.js
