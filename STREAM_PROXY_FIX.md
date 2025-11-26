# Stream 403 Forbidden Error - Fixed

## Problem
When trying to play live TV channels or VOD content, the video player was getting **403 Forbidden** errors when requesting the stream URL. 

Example error:
```
http://192.101.68.24/CF5A68754DA1ZZZ13b09e8f3322f2cf28d2f926eb0f54c3451c6f9dd9816888a/index.m3u8?token=1d790d047187889605bcee8df5b24b98
Status Code: 403 Forbidden
```

## Root Cause
The Stalker portal's stream URLs require proper authentication headers (Authorization, Cookie, User-Agent, Referer) to work. However:

1. **HTML5 `<video>` element** and **React Native's `Video` component** don't support custom headers for HLS (.m3u8) streams
2. The video player was making direct requests to the Stalker portal without authentication
3. The Stalker portal rejected these unauthorized requests with 403 Forbidden

## Solution
Implemented a **stream proxy** that:

1. Intercepts video stream requests
2. Adds proper Stalker authentication headers
3. Forwards the authenticated request to the Stalker portal
4. Streams the video back to the player

### Architecture

```
Video Player → Backend Proxy → Stalker Portal
                    ↓
        (Adds Auth Headers)
```

## Implementation Details

### 1. Stream Proxy Endpoint
**File:** `/src/app/api/providers/[id]/stream-proxy/route.ts`

- Accepts stream URL and JWT token as query parameters
- Verifies user authentication
- Fetches provider credentials from database
- Adds Stalker-specific headers:
  - `Authorization: Bearer <token>`
  - `Cookie: mac=<MAC>; timezone=America/Toronto; adid=<ADID>`
  - `User-Agent: Mozilla/5.0 (QtEmbedded...) MAG200 stbapp...`
  - `X-User-Agent: Model: MAG270; Link: WiFi`
  - `Referer: <portal_url>/c/`
- Handles HLS playlists (.m3u8) by rewriting internal URLs to be proxied
- Streams video segments (.ts files) directly to player

### 2. Stream URL Modification
**File:** `/src/app/api/providers/[id]/stream/route.ts`

Modified the stream endpoint to return **proxied URLs** instead of direct Stalker URLs:

```typescript
// Before: http://192.101.68.24/CF5A68754DA1ZZZ.../index.m3u8?token=...
// After:  http://localhost:2005/api/providers/{id}/stream-proxy?url=...&token=...
```

### 3. Frontend Token Injection
**Files:** 
- `/expo-rn/app/(tabs)/live.tsx`
- `/expo-rn/app/watch/[id].tsx`
- `/expo-rn/app/channel/[id].tsx`

Added logic to append JWT token to proxied stream URLs:

```typescript
let url = streamData.streamUrl;
if (url.includes('/stream-proxy')) {
  const separator = url.includes('?') ? '&' : '?';
  url = `${url}${separator}token=${jwtToken}`;
}
setStreamUrl(url);
```

## Benefits

1. **✅ Fixes 403 Forbidden errors** - All streams now include proper authentication
2. **✅ Works across all platforms** - Web, iOS, Android TV
3. **✅ Secure** - JWT token verification ensures only authorized users can stream
4. **✅ Transparent** - Video player doesn't need to know about Stalker authentication
5. **✅ HLS playlist support** - Handles nested .m3u8 playlists and .ts segments

## Testing

To verify the fix:

1. **Start backend server:**
   ```bash
   npm run dev
   ```

2. **Start Expo app:**
   ```bash
   cd expo-rn
   npx expo start
   ```

3. **Test live TV:**
   - Go to Live TV tab
   - Click any channel
   - Video should start playing without 403 errors

4. **Check network requests:**
   - Open browser DevTools → Network tab
   - Filter by `.m3u8` or `stream-proxy`
   - Verify requests return `200 OK` instead of `403 Forbidden`

## What Changed

### Created Files
- `/src/app/api/providers/[id]/stream-proxy/route.ts` - New proxy endpoint

### Modified Files
- `/src/app/api/providers/[id]/stream/route.ts` - Return proxied URLs
- `/expo-rn/app/(tabs)/live.tsx` - Add token to stream URL
- `/expo-rn/app/watch/[id].tsx` - Add token to stream URL
- `/expo-rn/app/channel/[id].tsx` - Add token to stream URL

## Performance Notes

- **Proxy overhead:** Minimal - just header injection and streaming
- **Caching:** Video segments cached by browser/player as normal
- **Scalability:** Each stream proxies independently
- **Memory:** Streams are piped, not buffered in memory

## Future Enhancements

1. **Token refresh:** Auto-refresh expired JWT tokens
2. **CDN support:** Proxy through CDN for better performance
3. **Quality selection:** Support multiple quality streams
4. **Analytics:** Track streaming metrics
