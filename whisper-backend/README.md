# Whisper Subtitle Backend

Real-time subtitle generation using Whisper AI for IPTV Android TV app.

## Features

- ✅ Real-time speech-to-text using Whisper
- ✅ Supports 90+ languages with auto-detection
- ✅ Optimized for speed (faster-whisper)
- ✅ REST API for easy integration
- ✅ Works with any client (Android TV, web, mobile)
- ✅ Auto-restart on crashes

## Quick Start

### 1. Install Dependencies

```bash
cd whisper-backend
npm run setup
```

This will:
- Install Node.js dependencies
- Install Python dependencies (faster-whisper, Flask)
- Create necessary directories
- Copy .env.example to .env

### 2. Start the Server

```bash
npm start
```

First run will download the Whisper model (~150MB), please wait.

Server will start on: `http://localhost:8765`

### 3. Test It

```bash
# Health check
curl http://localhost:8765/health

# System info
curl http://localhost:8765/system-info
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "whisper_service": "ready",
  "timestamp": "2025-11-27T10:30:00Z"
}
```

### GET /system-info
Check if backend can generate subtitles

**Response:**
```json
{
  "capable": true,
  "model": "base",
  "languages": ["en", "es", "fr", "de", "auto"],
  "max_concurrent": 3,
  "recommended": true
}
```

### POST /transcribe
Transcribe audio to text

**Request:**
- Method: POST
- Content-Type: multipart/form-data or audio/wav
- Body: Audio file (WAV, 16kHz, mono)
- Query: `?language=en` (optional, default: auto)

**Example:**
```bash
curl -X POST \
  -F "audio=@audio.wav" \
  "http://localhost:8765/transcribe?language=en"
```

**Response:**
```json
{
  "success": true,
  "text": "Hello, this is a transcription test.",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Hello, this is a transcription test."
    }
  ],
  "language": "en",
  "language_probability": 0.99,
  "duration": 2.5,
  "processing_time": 0.8,
  "total_time": 0.85
}
```

## Configuration

Edit `.env` file:

```env
# Server port
PORT=8765

# Whisper model (tiny, base, small, medium, large)
WHISPER_MODEL=base

# Default language (auto for auto-detect)
WHISPER_LANGUAGE=auto

# Audio chunk duration (milliseconds)
CHUNK_DURATION_MS=3000

# Max concurrent transcriptions
MAX_CONCURRENT_TRANSCRIPTIONS=3
```

### Model Comparison

| Model  | Size   | Speed    | Accuracy | Recommended For          |
|--------|--------|----------|----------|--------------------------|
| tiny   | 75 MB  | Fastest  | ~80%     | Testing only             |
| base   | 142 MB | Fast     | ~85%     | **Recommended** (balanced) |
| small  | 466 MB | Medium   | ~90%     | High accuracy needed     |
| medium | 1.5 GB | Slow     | ~95%     | Best quality             |

## Performance

### Expected Latency (on moderate hardware)

- **Tiny**: 0.5-1 second per 3s audio
- **Base**: 1-2 seconds per 3s audio ⭐ Recommended
- **Small**: 3-5 seconds per 3s audio

### Optimization Tips

1. **Use GPU**: If you have NVIDIA GPU, edit `whisper_service.py`:
   ```python
   device = "cuda"
   compute_type = "float16"
   ```

2. **Increase Chunk Size**: For better accuracy, increase `CHUNK_DURATION_MS` to 5000 (5 seconds)

3. **Pre-load Model**: Model is cached in memory after first load

## Troubleshooting

### Port Already in Use
```bash
# Change PORT in .env
PORT=8766
```

### Python Dependencies Failed
```bash
pip3 install --upgrade pip
pip3 install faster-whisper flask flask-cors numpy
```

### Model Download Fails
```bash
# Manually download model
python3 -c "from faster-whisper import WhisperModel; WhisperModel('base')"
```

### Service Keeps Restarting
Check logs for errors. Common issues:
- Not enough RAM (need 2GB+ for base model)
- Python version < 3.8

## Development

### Run with Auto-Reload
```bash
npm run dev
```

### View Logs
```bash
tail -f logs/whisper.log
```

## Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start server.js --name whisper-backend
pm2 startup
pm2 save
```

### Using Docker
```dockerfile
# Coming soon
```

## Integration with Android App

See Android app implementation in:
- `app/src/main/java/com/ronika/iptvnative/services/SubtitleService.kt`
- `app/src/main/java/com/ronika/iptvnative/PlayerActivity.kt`

## License

MIT
