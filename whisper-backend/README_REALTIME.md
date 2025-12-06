# Whisper Backend - Real-Time Subtitle Generation

Generates subtitles in real-time using OpenAI's Whisper model with SSE (Server-Sent Events) streaming.

## Features

- ✅ **Real-time streaming**: Subtitles sent as they're generated
- ✅ **Chunk-based processing**: Process 30-second chunks, stream immediately
- ✅ **Progress updates**: Live progress with estimated time remaining
- ✅ **Multiple models**: tiny (fastest), base, small, medium
- ✅ **Smart handling**: Works on fast local servers and slow remote servers
- ✅ **Auto-recovery**: Continues processing even if one chunk fails

## Installation

```bash
cd whisper-backend
npm install
pip3 install -r requirements.txt
```

## Environment Variables

Create `.env` file:

```bash
PORT=8765
PYTHON_PORT=8766
WHISPER_MODEL=tiny  # tiny, base, small, medium
WHISPER_LANGUAGE=auto  # or en, es, fr, etc.
MAX_CONCURRENT_JOBS=2
```

## Start Server

```bash
# Development
npm run dev

# Production with PM2
pm2 start ecosystem.config.js
```

## API Endpoints

### 1. Check Capability
```bash
GET /api/subtitles/capability
```

Response:
```json
{
  "available": true,
  "model": "tiny",
  "averageSpeed": 0.03,
  "maxConcurrent": 2,
  "currentLoad": 0,
  "estimatedWaitTime": 0,
  "supportedLanguages": ["en", "es", "fr", ...]
}
```

### 2. Generate Subtitles (SSE Stream)
```bash
GET /api/subtitles/generate-stream?streamUrl=http://...&videoId=abc123&language=en&model=tiny
```

SSE Events:
```javascript
// Connected
{"type": "connected", "videoId": "abc123"}

// Progress updates
{"type": "progress", "percent": 25, "estimatedTime": 45, "message": "Processing chunk 1..."}

// Subtitle chunks
{"type": "subtitle", "index": 0, "startTime": 0.0, "endTime": 2.5, "text": "Hello"}
{"type": "subtitle", "index": 1, "startTime": 2.5, "endTime": 5.0, "text": "Welcome"}

// Complete
{"type": "complete", "videoId": "abc123", "totalSubtitles": 150, "duration": 125}

// Error
{"type": "error", "message": "FFmpeg failed", "canRetry": true}
```

### 3. Cancel Generation
```bash
DELETE /api/subtitles/generate/:videoId
```

### 4. Get Status
```bash
GET /api/subtitles/status/:videoId
```

Response:
```json
{
  "isRunning": true,
  "percent": 50,
  "processedSeconds": 60,
  "totalDuration": 120,
  "estimatedTime": 30,
  "subtitlesGenerated": 45
}
```

### 5. Download VTT File
```bash
GET /api/subtitles/download/:videoId.vtt
```

Returns standard WebVTT format subtitle file.

## Frontend Integration

### Using EventSource (SSE)

```typescript
const eventSource = new EventSource(
  `http://localhost:8765/api/subtitles/generate-stream?streamUrl=${encodeURIComponent(url)}&videoId=${id}`
);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'connected':
      console.log('Connected:', data.videoId);
      break;
      
    case 'progress':
      console.log(`Progress: ${data.percent}% (${data.estimatedTime}s remaining)`);
      setProgress(data.percent);
      break;
      
    case 'subtitle':
      console.log(`Subtitle: ${data.text} (${data.startTime} - ${data.endTime})`);
      addSubtitle(data);
      break;
      
    case 'complete':
      console.log('Complete!', data.totalSubtitles);
      eventSource.close();
      break;
      
    case 'error':
      console.error('Error:', data.message);
      eventSource.close();
      break;
  }
});

eventSource.addEventListener('error', () => {
  console.error('Connection error');
  eventSource.close();
});
```

### React Native (EventSource polyfill needed)

```bash
npm install react-native-sse
```

```typescript
import EventSource from 'react-native-sse';

const es = new EventSource(url);
es.addEventListener('message', handleMessage);
```

## Performance

### Whisper Models

| Model  | Size  | Speed (Local)     | Speed (Remote)   | Quality |
|--------|-------|-------------------|------------------|---------|
| tiny   | 39 MB | 32x realtime      | 10x realtime     | Good    |
| base   | 74 MB | 16x realtime      | 5x realtime      | Better  |
| small  | 244MB | 8x realtime       | 2x realtime      | Great   |
| medium | 769MB | 4x realtime       | 1x realtime      | Best    |

**Recommendation**: Use `tiny` for most cases - it's fast enough and quality is good for subtitles.

### Example Processing Times

**2-minute video:**
- Local (tiny): ~4 seconds
- Local (base): ~7 seconds
- Remote (tiny): ~12 seconds
- Remote (base): ~24 seconds

**10-minute video:**
- Local (tiny): ~20 seconds
- Local (base): ~37 seconds
- Remote (tiny): ~60 seconds
- Remote (base): ~120 seconds

## Troubleshooting

### FFmpeg not found
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### Whisper model not downloading
Models are downloaded automatically on first use to `~/.cache/whisper/`.

### Out of memory
- Use smaller model (tiny instead of base)
- Reduce `MAX_CONCURRENT_JOBS`
- Reduce chunk size in SubtitleGenerator.js

### Slow generation
- Check CPU usage
- Use smaller model
- Ensure FFmpeg can access the stream URL
- Check network speed if stream is remote

## Architecture

```
┌─────────────┐
│  Frontend   │
│  (Mobile)   │
└──────┬──────┘
       │ SSE
       ↓
┌─────────────────────────────────┐
│  Node.js Server (port 8765)    │
│  - SSE endpoint                 │
│  - Job management               │
│  - Progress tracking            │
└───────┬─────────────────────────┘
        │
        ↓
┌─────────────────────────────────┐
│  SubtitleGenerator Service      │
│  - FFmpeg (audio extraction)    │
│  - Chunk-based processing       │
│  - Event emission               │
└───────┬─────────────────────────┘
        │
        ↓
┌─────────────────────────────────┐
│  Python Whisper (port 8766)     │
│  - Whisper model inference      │
│  - Segment generation           │
└─────────────────────────────────┘
```

## License

MIT
