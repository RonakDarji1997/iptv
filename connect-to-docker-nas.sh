#!/bin/bash

# SSH Tunnel Script to connect to docker-nas PostgreSQL and Redis
# This creates secure tunnels to your docker-nas services

# Configuration - UPDATE THESE VALUES
DOCKER_NAS_USER="your-username"
DOCKER_NAS_HOST="docker-nas"  # or use IP address like 192.168.1.xxx
DOCKER_NAS_SSH_PORT="22"

# Port forwarding
POSTGRES_LOCAL_PORT="5432"
POSTGRES_REMOTE_PORT="5432"
REDIS_LOCAL_PORT="6379"
REDIS_REMOTE_PORT="6379"

echo "🔌 Establishing SSH tunnel to docker-nas..."
echo "📍 Connecting to: $DOCKER_NAS_USER@$DOCKER_NAS_HOST:$DOCKER_NAS_SSH_PORT"
echo ""
echo "Port Forwarding:"
echo "  PostgreSQL: localhost:$POSTGRES_LOCAL_PORT -> docker-nas:$POSTGRES_REMOTE_PORT"
echo "  Redis: localhost:$REDIS_LOCAL_PORT -> docker-nas:$REDIS_REMOTE_PORT"
echo ""
echo "Press Ctrl+C to close the tunnel"
echo ""

# Create SSH tunnel with port forwarding
ssh -N \
  -L $POSTGRES_LOCAL_PORT:localhost:$POSTGRES_REMOTE_PORT \
  -L $REDIS_LOCAL_PORT:localhost:$REDIS_REMOTE_PORT \
  -p $DOCKER_NAS_SSH_PORT \
  $DOCKER_NAS_USER@$DOCKER_NAS_HOST

# If the SSH connection fails, show error message
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Failed to establish SSH tunnel"
  echo ""
  echo "Please check:"
  echo "  1. docker-nas is accessible from your network"
  echo "  2. SSH credentials are correct"
  echo "  3. PostgreSQL and Redis containers are running on docker-nas"
  echo ""
  exit 1
fi
