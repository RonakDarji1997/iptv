# Real-Time Subtitle System Implementation Plan

## Overview
Update whisper backend to generate subtitles quickly and stream them to frontend with progress updates.

## Backend Requirements

### 1. Streaming Subtitle Generation API
**Endpoint:** `POST /api/subtitles/generate-stream`

**Request:**
```json
{
  "streamUrl": "http://...",
  "language": "en",
  "videoId": "unique-id"
}
```

**Response (SSE - Server-Sent Events):**
```javascript
// Progress updates
data: {"type": "progress", "percent": 15, "estimatedTime": 120, "message": "Processing audio..."}
data: {"type": "progress", "percent": 45, "estimatedTime": 60, "message": "Generating subtitles..."}

// Subtitle chunks as they're generated
data: {"type": "subtitle", "index": 0, "startTime": 0.0, "endTime": 2.5, "text": "Hello world"}
data: {"type": "subtitle", "index": 1, "startTime": 2.5, "endTime": 5.0, "text": "Welcome"}

// Completion
data: {"type": "complete", "totalSubtitles": 150, "duration": 125}

// Error
data: {"type": "error", "message": "Failed to process", "canRetry": true}
```

### 2. Capability Check API
**Endpoint:** `GET /api/subtitles/capability`

**Response:**
```json
{
  "available": true,
  "model": "whisper-medium",
  "averageSpeed": 0.5, // seconds per second of video
  "maxConcurrent": 2,
  "currentLoad": 1,
  "estimatedWaitTime": 30 // seconds
}
```

### 3. Cancel Subtitle Generation
**Endpoint:** `DELETE /api/subtitles/generate/:videoId`

### 4. Backend Improvements

#### Fast Processing Mode
```javascript
// Use smaller Whisper model for speed
// whisper-tiny: ~4x faster, decent quality
// whisper-base: ~2x faster, good quality
// whisper-small: ~1.5x faster, better quality

const PROCESSING_MODES = {
  fast: 'tiny',      // 32x realtime on good CPU
  balanced: 'base',  // 16x realtime
  quality: 'small'   // 8x realtime
};
```

#### Chunk-Based Processing
```javascript
// Process audio in 30-second chunks
// Generate subtitles as each chunk completes
// Stream results immediately to frontend
```

#### Progress Tracking
```javascript
class SubtitleJob {
  constructor(videoId, streamUrl, duration) {
    this.videoId = videoId;
    this.streamUrl = streamUrl;
    this.duration = duration;
    this.processedSeconds = 0;
    this.totalSubtitles = [];
    this.startTime = Date.now();
  }
  
  getProgress() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const percent = (this.processedSeconds / this.duration) * 100;
    const speed = this.processedSeconds / elapsed; // seconds per second
    const remaining = (this.duration - this.processedSeconds) / speed;
    
    return {
      percent: Math.round(percent),
      processedSeconds: this.processedSeconds,
      totalDuration: this.duration,
      estimatedTime: Math.round(remaining)
    };
  }
}
```

## Frontend Implementation

### 1. Subtitle State Management
```typescript
interface Subtitle {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

interface SubtitleState {
  available: boolean;
  loading: boolean;
  progress: number;
  estimatedTime: number;
  subtitles: Subtitle[];
  currentIndex: number;
  error: string | null;
}
```

### 2. SSE Connection Handler
```typescript
const startSubtitleGeneration = async (streamUrl: string, videoId: string) => {
  setSubtitleState({ loading: true, progress: 0 });
  
  const eventSource = new EventSource(
    `${BACKEND_URL}/api/subtitles/generate-stream?streamUrl=${encodeURIComponent(streamUrl)}&videoId=${videoId}`
  );
  
  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'progress':
        setSubtitleState(prev => ({
          ...prev,
          progress: data.percent,
          estimatedTime: data.estimatedTime
        }));
        break;
        
      case 'subtitle':
        setSubtitleState(prev => ({
          ...prev,
          subtitles: [...prev.subtitles, {
            index: data.index,
            startTime: data.startTime,
            endTime: data.endTime,
            text: data.text
          }]
        }));
        break;
        
      case 'complete':
        setSubtitleState(prev => ({ ...prev, loading: false }));
        eventSource.close();
        break;
        
      case 'error':
        setSubtitleState({ error: data.message, loading: false });
        eventSource.close();
        break;
    }
  });
  
  eventSource.addEventListener('error', () => {
    setSubtitleState({ error: 'Connection lost', loading: false });
    eventSource.close();
  });
  
  return () => eventSource.close();
};
```

### 3. Subtitle Display Logic
```typescript
// Only show subtitles that match current playback time
const getCurrentSubtitle = (currentTime: number): Subtitle | null => {
  return subtitles.find(sub => 
    currentTime >= sub.startTime && currentTime <= sub.endTime
  ) || null;
};

// Skip subtitles that are in the past
const filterRelevantSubtitles = (currentTime: number): Subtitle[] => {
  return subtitles.filter(sub => sub.endTime >= currentTime);
};
```

### 4. UI Components

#### Loading State
```tsx
{subtitleState.loading && (
  <View style={styles.subtitleLoading}>
    <ActivityIndicator />
    <Text>Generating subtitles... {subtitleState.progress}%</Text>
    <Text>Est. {subtitleState.estimatedTime}s remaining</Text>
  </View>
)}
```

#### Subtitle Display
```tsx
{currentSubtitle && (
  <View style={styles.subtitleContainer}>
    <Text style={styles.subtitleText}>{currentSubtitle.text}</Text>
  </View>
)}
```

#### Subtitle Toggle Button
```tsx
<TouchableOpacity onPress={toggleSubtitles}>
  <Ionicons name="chatbox-outline" />
  <Text>CC</Text>
  {subtitleState.available && (
    <View style={styles.badge}>
      <Text>{subtitleState.subtitles.length}</Text>
    </View>
  )}
</TouchableOpacity>
```

## Implementation Steps

### Phase 1: Backend Updates
1. ✅ Add subtitle button UI to both players
2. Add SSE endpoint for streaming subtitle generation
3. Implement chunk-based Whisper processing
4. Add progress tracking and estimation
5. Add capability check endpoint

### Phase 2: Frontend Integration
1. Add EventSource/SSE support for React Native
2. Implement subtitle state management
3. Add subtitle display overlay
4. Add progress indicator during generation
5. Sync subtitles with video playback position

### Phase 3: Optimization
1. Add subtitle caching (don't regenerate for same video)
2. Add language selection
3. Add subtitle styling options
4. Add manual subtitle upload option
5. Add subtitle search/jump to time feature

## Performance Expectations

### Local Server (Good CPU):
- Whisper tiny: 32x realtime (2min video = 4sec processing)
- Whisper base: 16x realtime (2min video = 7sec processing)
- Whisper small: 8x realtime (2min video = 15sec processing)

### Remote Server (Medium CPU):
- Whisper tiny: 10x realtime (2min video = 12sec processing)
- Whisper base: 5x realtime (2min video = 24sec processing)
- Whisper small: 2x realtime (2min video = 60sec processing)

## Files to Create/Modify

### Backend:
- `/whisper-backend/routes/subtitles.js` - New SSE endpoints
- `/whisper-backend/services/SubtitleGenerator.js` - Chunk processing
- `/whisper-backend/services/ProgressTracker.js` - Progress estimation
- `/whisper-backend/whisper_service.py` - Update for chunk mode

### Frontend:
- `/mobile-app/src/services/SubtitleService.ts` - SSE connection
- `/mobile-app/src/components/SubtitleOverlay.tsx` - Display component
- `/mobile-app/src/hooks/useSubtitles.ts` - State management hook
- Update both VODPlayer.tsx and LiveTVPlayer.tsx

## Next Steps
1. Implement backend SSE endpoint
2. Test chunk-based Whisper processing
3. Create frontend subtitle service
4. Integrate with video players
5. Test end-to-end flow
