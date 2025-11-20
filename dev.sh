#!/bin/bash
echo "Starting Expo and Next.js..."

# Function to kill background processes on exit
cleanup() {
  echo "Stopping processes..."
  kill $(jobs -p)
}
trap cleanup EXIT

# Start Expo (Web)
echo "Starting Expo on port 8081..."
(cd expo-rn && npm run web) &

# Wait a bit for Expo to start
sleep 5

# Start Next.js
echo "Starting Next.js on port 2005..."
npm run dev
