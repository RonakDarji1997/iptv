# Stalker Portal Direct Integration (No Handshake)

## Summary
Updated the mobile app to get provider credentials (bearer token, MAC address, portal URL) directly from backend sync data instead of performing handshake/profile authentication. The token is obtained from the Android TV app's sync and reused in the mobile app.

## Changes Made

### 1. Removed Authentication Flow
**Removed handshake and profile calls:**
- No longer calls `/load.php?type=stb&action=handshake`
- No longer calls `/load.php?type=stb&action=get_profile`
- Bearer token is now received from backend sync (Android TV app syncs it)

### 2. Backend Sync Integration
**New method `initializeFromBackend()`:**
- Calls backend API: `GET /sync/pull`
- Extracts provider data: bearer_token, mac_address, server_url
- Sets up StalkerPortalClient with received credentials

### 3. Required Headers
All API calls include exact headers from Android TV (using synced token):

```typescript
{
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
  'X-User-Agent': 'Model: MAG270; Link: WiFi',
  'Authorization': 'Bearer {token_from_sync}',
  'Cookie': 'mac={mac_from_sync}; timezone=America/Toronto; adid={md5_of_mac}',
  'Connection': 'keep-alive'
}
```

### 4. Cookie Generation
- **mac**: MAC address from backend sync data
- **timezone**: `America/Toronto`
- **adid**: MD5 hash of MAC address (without colons, uppercase)
- Generated using expo-crypto

### 5. New Flow

**App Initialization (App.tsx):**
1. Initialize database
2. Auto-authenticate user (device UUID-based)
3. Call `StalkerSyncService.initializeFromBackend()` - gets provider config from backend
4. Backend returns: `{ bearer_token, mac_address, server_url, name }`
5. Set up StalkerPortalClient with received credentials
6. Sync categories from Stalker portal

**Backend Sync Response:**
```json
{
  "success": true,
  "data": {
    "providers": [{
      "provider_id": "stream4k",
      "name": "Stream4K",
      "server_url": "http://tv.stream4k.cc",
      "bearer_token": "abc123...",
      "mac_address": "00:1a:79:17:f4:f5"
    }]
  }
}
```

### 6. API URL Format
Updated all API calls to match Android TV's exact format:

**Live TV Categories:**
```
GET /load.php?type=itv&action=get_genres&JsHttpRequest=1-xml
```

**VOD Categories:**
```
GET /load.php?type=vod&action=get_categories&JsHttpRequest=1-xml
```

**Channels:**
```
GET /load.php?type=itv&action=get_ordered_list&genre={id}&page={page}&p={page}&sortby=number&JsHttpRequest=1-xml
```

**VOD Items:**
```
GET /load.php?type=vod&action=get_ordered_list&category={id}&page={page}&p={page}&sortby=added&JsHttpRequest=1-xml
```

### 7. Simplified Client
**StalkerPortalClient changes:**
- Removed `performHandshake()` method
- Removed `getProfile()` method
- Removed `ensureAuthenticated()` method
- Removed `loadToken()` / `saveToken()` methods
- Added `setToken(token: string)` to receive token from sync
- All API methods directly use the set bearer token

## Testing

### Expected Behavior
1. App starts and initializes database
2. Auto-authenticates user with device UUID
3. Calls backend `/sync/pull` to get provider config
4. Receives bearer token, MAC address, portal URL from backend
5. Sets up StalkerPortalClient with received credentials
6. Category sync fetches live TV and VOD categories using the token
7. Categories are saved to SQLite database
8. UI displays categories

### Logs to Watch
```
🚀 Initializing database...
🔐 Authenticating...
✅ User authenticated: device_xxx@mobile.app
📡 Setting up Stalker portal from backend sync...
🔄 Fetching provider config from backend...
✅ Bearer token set from sync data
✅ Provider initialized from backend: Stream4K
🔄 Syncing categories from Stalker portal...
📡 Fetching live categories from: http://tv.stream4k.cc/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml
✅ Found X live categories
📡 Fetching VOD categories from: http://tv.stream4k.cc/load.php?type=vod&action=get_categories&JsHttpRequest=1-xml
✅ Found Y VOD categories
```

### If Issues Occur
1. **Backend not running**: Check if backend is running on port 3001
2. **No providers in backend**: Android TV app must sync data first
3. **Missing token**: Verify backend returns `bearer_token` field
4. **Missing MAC**: Verify backend returns `mac_address` field
5. **Authentication fails**: Check if device UUID auth works
6. **Fallback used**: App will use hardcoded config if backend fails

## Dependencies
- `expo-crypto`: ~15.0.8 (for MD5/SHA1 hashing)
- Already installed in package.json

## Files Modified
1. `/src/services/StalkerPortalClient.ts`
   - Removed handshake and profile authentication methods
   - Added `setToken()` to receive token from sync
   - Simplified header building (no auth parameter)

2. `/src/services/StalkerSyncService.ts`
   - Added `initializeFromBackend()` method
   - Updated `setProvider()` to accept bearerToken and macAddress
   - Updated `getClient()` to set token when creating client

3. `/App.tsx`
   - Added backend sync initialization flow
   - Calls `initializeFromBackend()` before syncing
   - Falls back to hardcoded config if backend fails

## Prerequisites
1. Backend API must be running on port 3001
2. Android TV app must have synced data to backend
3. Backend must return provider with: `bearer_token`, `mac_address`, `server_url`

## Data Flow
```
Android TV → Backend Sync → Mobile App
     ↓              ↓              ↓
  Handshake    Stores Token   Uses Token
  + Profile    + MAC + URL    for API calls
```

## Reference
- Android TV implementation: `/android-tv-native/app/src/main/java/com/ronika/iptvnative/StalkerAuthClient.kt`
- Android TV client: `/android-tv-native/app/src/main/java/com/ronika/iptvnative/api/StalkerPortalClient.kt`
- Backend API: `http://192.168.2.69:3001/api/sync/pull`
