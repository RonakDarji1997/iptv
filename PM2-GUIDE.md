# PM2 Deployment Guide (No Docker)

This guide explains how to run the IPTV application (Next.js Backend + Expo React Native App) using PM2 on a single machine.

## Prerequisites

- Node.js (v18 or v20 recommended)
- NPM
- PM2 (`npm install -g pm2`)

## Configuration

The application is configured via `ecosystem.config.json`.

- **Backend (Next.js)**: Runs on port `2005`.
- **Expo App**: Runs on port `3005` (Metro Bundler).

## Quick Start

Run the helper script to install dependencies and start everything:

```bash
./pm2-start.sh
```

## Manual Commands

### 1. Install Dependencies

```bash
# Backend
npm install

# Expo App
cd expo-rn
npm install
cd ..
```

### 2. Start Applications

```bash
pm2 start ecosystem.config.json
```

### 3. Manage Processes

```bash
# List running processes
pm2 list

# View logs
pm2 logs

# Stop all
pm2 stop all

# Restart all
pm2 restart all
```

## Ports

- **Backend**: http://localhost:2005
- **Expo Metro Bundler**: http://localhost:3005
