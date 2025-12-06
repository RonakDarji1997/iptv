#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Whisper Subtitle Backend...\n');

// Check if Python is installed
try {
  const pythonVersion = execSync('python3 --version', { encoding: 'utf8' });
  console.log('✅ Python found:', pythonVersion.trim());
} catch (error) {
  console.error('❌ Python 3 is required but not found!');
  console.error('   Install from: https://www.python.org/downloads/');
  process.exit(1);
}

// Check if pip is installed
try {
  execSync('pip3 --version', { encoding: 'utf8' });
  console.log('✅ pip3 found\n');
} catch (error) {
  console.error('❌ pip3 is required but not found!');
  process.exit(1);
}

// Create directories
const dirs = ['uploads', 'models'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`📁 Created ${dir}/ directory`);
  }
});

// Create .env if not exists
if (!fs.existsSync('.env')) {
  fs.copyFileSync('.env.example', '.env');
  console.log('📝 Created .env file from .env.example');
}

console.log('\n📦 Installing Python dependencies...');
console.log('   This may take a few minutes...\n');

try {
  // Install faster-whisper (optimized for speed)
  execSync('pip3 install faster-whisper flask flask-cors numpy', { 
    stdio: 'inherit' 
  });
  console.log('\n✅ Python dependencies installed successfully!');
} catch (error) {
  console.error('\n❌ Failed to install Python dependencies');
  console.error('   Try manually: pip3 install faster-whisper flask flask-cors numpy');
  process.exit(1);
}

console.log('\n📦 Installing Node.js dependencies...\n');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('\n✅ Node.js dependencies installed successfully!');
} catch (error) {
  console.error('\n❌ Failed to install Node.js dependencies');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('✨ Setup Complete! ✨');
console.log('='.repeat(60));
console.log('\n📚 Next Steps:');
console.log('   1. Start the backend: npm start');
console.log('   2. Backend will run on: http://localhost:8765');
console.log('   3. First run will download Whisper model (~150MB)');
console.log('\n💡 Tips:');
console.log('   - Edit .env to change model (tiny/base/small)');
console.log('   - Use "base" model for best balance');
console.log('   - Check logs for transcription performance\n');
