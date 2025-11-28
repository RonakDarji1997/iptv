#!/usr/bin/env node
/**
 * Node.js Proxy Server for Whisper Backend
 * Forwards audio from Android app to Python Whisper service
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8765;
const PYTHON_PORT = parseInt(PORT) + 1; // Python runs on PORT+1

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'audio/*', limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Track Python service
let pythonProcess = null;
let pythonServiceReady = false;

// Start Python Whisper service
function startPythonService() {
  console.log('🚀 Starting Python Whisper service...');
  
  pythonProcess = spawn('python3', ['whisper_service.py'], {
    env: { ...process.env, PORT: PYTHON_PORT },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Whisper] ${output.trim()}`);
    
    // Check if service is ready
    if (output.includes('Running on') || output.includes('loaded successfully')) {
      pythonServiceReady = true;
      console.log('✅ Whisper service is ready!');
    }
  });
  
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Whisper Error] ${data.toString().trim()}`);
  });
  
  pythonProcess.on('close', (code) => {
    console.log(`⚠️  Python service exited with code ${code}`);
    pythonServiceReady = false;
    
    // Auto-restart on crash
    if (code !== 0) {
      console.log('🔄 Restarting Python service in 5 seconds...');
      setTimeout(startPythonService, 5000);
    }
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    whisper_service: pythonServiceReady ? 'ready' : 'starting',
    timestamp: new Date().toISOString()
  });
});

// System info endpoint for clients
app.get('/system-info', (req, res) => {
  res.json({
    capable: true, // Backend can always handle it
    model: process.env.WHISPER_MODEL || 'base',
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'auto'],
    max_concurrent: parseInt(process.env.MAX_CONCURRENT_TRANSCRIPTIONS) || 3,
    recommended: true // Always recommend using backend
  });
});

// Main transcription endpoint
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!pythonServiceReady) {
    return res.status(503).json({
      success: false,
      error: 'Whisper service is starting, please try again in a moment'
    });
  }
  
  try {
    const startTime = Date.now();
    
    // Get audio file path
    let audioPath;
    if (req.file) {
      audioPath = req.file.path;
    } else if (req.body && Buffer.isBuffer(req.body)) {
      // Handle raw audio data
      audioPath = `uploads/temp_${Date.now()}.wav`;
      fs.writeFileSync(audioPath, req.body);
    } else {
      return res.status(400).json({
        success: false,
        error: 'No audio data provided'
      });
    }
    
    const language = req.query.language || 'auto';
    
    console.log(`📝 Transcribing audio: ${path.basename(audioPath)} (${language})`);
    
    // Forward to Python service
    const fetch = (await import('node-fetch')).default;
    const formData = (await import('form-data')).default;
    
    const form = new formData();
    form.append('file', fs.createReadStream(audioPath));
    
    const response = await fetch(`http://localhost:${PYTHON_PORT}/transcribe?language=${language}`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    
    // Clean up temp file
    try {
      if (req.file || audioPath.includes('temp_')) {
        fs.unlinkSync(audioPath);
      }
    } catch (err) {
      console.error('Failed to clean up temp file:', err.message);
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Transcription complete (${totalTime}s): ${result.text?.substring(0, 50)}...`);
    
    res.json({
      ...result,
      total_time: parseFloat(totalTime)
    });
    
  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (pythonProcess) {
    pythonProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🎙️  Whisper Subtitle Backend');
  console.log('='.repeat(60));
  console.log(`📡 Node.js API: http://localhost:${PORT}`);
  console.log(`🐍 Python Whisper: http://localhost:${PYTHON_PORT}`);
  console.log(`🔧 Model: ${process.env.WHISPER_MODEL || 'base'}`);
  console.log(`🌍 Language: ${process.env.WHISPER_LANGUAGE || 'auto'}`);
  console.log('='.repeat(60));
  console.log('');
  
  // Start Python service
  startPythonService();
});
