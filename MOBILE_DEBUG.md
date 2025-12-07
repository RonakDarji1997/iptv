## Mobile App Debugging - Network Error

### Current Status
- ✅ API working (tested with curl)
- ✅ Provider synced to server
- ✅ Code updated with production URLs
- ❌ Mobile app still getting "Network Error"

### What "Network Error" Means in Axios
A "Network Error" in React Native/Axios typically means:
1. **Request never reached server** - DNS/network issue
2. **Wrong URL format** - missing http://, malformed URL
3. **App using old cached code** - bundle not updated
4. **CORS preflight failing** (less likely on mobile)

### Debugging Steps

#### 1. Check if app reloaded new code
In Expo terminal, press:
- `r` - Reload app
- Or shake device → "Reload"

#### 2. Add console.log to see actual URL being called
The error happens in `getVodItemsByCategory()` which constructs:
```typescript
const backendUrl = `${this.backendUrl}/api/stalker-proxy/vod/${categoryId}?page=${page}`;
```

Expected URL: `http://api.iptv.ronika.co/api/stalker-proxy/vod/162?page=1`

#### 3. Check what this.backendUrl actually is
In MoviesScreen.tsx line 79-80:
```typescript
const backendBaseUrl = API_CONFIG.BACKEND_URL.replace('/api', '');
// Should be: http://api.iptv.ronika.co
```

#### 4. Verify token is stored after login
After logging in, check if token exists:
```typescript
const token = await AsyncStorage.getItem('auth_token');
console.log('Token:', token);
```

### Most Likely Issue
The app is constructing this URL:
```
http://api.iptv.ronika.co/api/stalker-proxy/vod/...
```

But `this.backendUrl` might be **undefined** or wrong, resulting in:
```
undefined/api/stalker-proxy/vod/...  ❌
```

### Solution
Add debug logging to StalkerPortalClient constructor:
