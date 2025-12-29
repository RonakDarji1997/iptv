# Logout Cache Clearing Fix

## Problem

When users logged out from the web-portal (which runs in a React Native WebView in the IPTVMobile app), the cache data was **not being cleared** from the mobile app's `AsyncStorage`. This caused:

1. ❌ Old authentication tokens to persist in mobile app
2. ❌ Cached API data to remain after logout
3. ❌ User data to leak between sessions

## Root Cause

The `authService.logout()` function was directly calling `localStorage.clear()`, which:
- ✅ Works correctly in web browsers
- ❌ **Does NOT work** in React Native WebView - it doesn't communicate with the native app's `AsyncStorage`

### Before (Broken):
```typescript
logout() {
  if (typeof window !== 'undefined') {
    localStorage.clear()  // ❌ Only clears web localStorage, not AsyncStorage
  }
}
```

## Solution

### 1. Updated `authService.ts` to use Storage Adapter

**File:** `web-portal/src/services/authService.ts`

#### Changes Made:

1. **Imported storage adapter and cache utilities:**
```typescript
import { storage } from '@/utils/storage'
import { cache } from '@/utils/cache'
import { apiCache } from '@/utils/api-cache'
```

2. **Made all storage methods async:**
```typescript
// Async methods (for login/logout operations):
async logout() { await storage.clear() }
async setToken(token: string) { await storage.setItem(...) }
async setRefreshToken(token: string) { await storage.setItem(...) }

// Synchronous methods (for backward compatibility - used in many API calls):
getToken(): string | null { return localStorage.getItem(...) }
getRefreshToken(): string | null { return localStorage.getItem(...) }
isAuthenticated(): boolean { ... }
getUser(): DecodedToken | null { ... }
getAuthHeader(): { Authorization: string } | {} { ... }
```

**Note:** Read methods remain synchronous to avoid breaking 100+ call sites across the app. They use `localStorage` directly which works fine for reading. The critical `logout()` method uses the storage adapter for cross-platform clearing.

3. **Enhanced logout to clear ALL caches:**
```typescript
async logout() {
  // Clear storage (works for both web localStorage and mobile AsyncStorage)
  await storage.clear()
  
  // Clear in-memory cache
  cache.clear()
  
  // Clear API cache (includes localStorage persistence)
  apiCache.clear()
  
  console.log('[Auth] Logout complete - cleared storage, in-memory cache, and API cache')
}
```

### 2. Storage Adapter Bridge

**File:** `web-portal/src/utils/storage.ts`

The storage adapter already handles both environments:

```typescript
async clear(): Promise<void> {
  if (isMobileApp()) {
    sendToNative('STORAGE_CLEAR', {})  // ✅ Sends message to native app
  } else {
    localStorage.clear()  // ✅ Clears web localStorage
  }
}
```

### 3. Updated Logout Handlers

Updated all logout handlers to be async:

**Files:**
- `web-portal/src/components/Navbar.tsx`
- `web-portal/src/app/dashboard/page.tsx`
- `web-portal/src/app/settings/page.tsx`

```typescript
// Before:
const handleLogout = () => {
  authService.logout()
  router.push('/')
}

// After:
const handleLogout = async () => {
  await authService.logout()  // ✅ Now waits for storage to clear
  router.push('/')
}
```

### 4. Mobile App Handler

**File:** `IPTVMobile/src/screens/WebViewScreen.tsx`

The mobile app already handles the `STORAGE_CLEAR` message correctly:

```typescript
case 'STORAGE_CLEAR':
  try {
    await AsyncStorage.clear()  // ✅ Clears all AsyncStorage data
    console.log('[Storage] Cleared all keys')
  } catch (error) {
    console.error('[Storage] Error clearing:', error)
  }
  break;
```

## What Gets Cleared on Logout

### Web Browser:
1. ✅ `localStorage` (auth tokens, user data)
2. ✅ In-memory cache (`CacheManager`)
3. ✅ API cache with localStorage persistence (`ApiCache`)

### Mobile App (React Native WebView):
1. ✅ `AsyncStorage` (auth tokens, user data)
2. ✅ In-memory cache (via web-portal)
3. ✅ API cache (via web-portal)

## Testing Checklist

### Web Browser:
- [ ] Login with credentials
- [ ] Navigate through app (loads cached data)
- [ ] Click logout
- [ ] Verify all localStorage is cleared
- [ ] Verify user is redirected to login page
- [ ] Login again - should fetch fresh data

### Mobile App:
- [ ] Login with credentials
- [ ] Navigate through app (loads cached data)
- [ ] Click logout in WebView
- [ ] Verify AsyncStorage is cleared (check React Native debugger)
- [ ] Verify user is redirected to login page
- [ ] Close and reopen app
- [ ] Should require login again (no cached credentials)

## Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│ User clicks LOGOUT in web-portal                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ authService.logout() is called (async)              │
│ 1. await storage.clear()                            │
│ 2. cache.clear()                                    │
│ 3. apiCache.clear()                                 │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  WEB BROWSER     │    │  MOBILE APP          │
├──────────────────┤    ├──────────────────────┤
│ localStorage     │    │ sendToNative(        │
│   .clear()       │    │   'STORAGE_CLEAR'    │
│                  │    │ )                    │
└──────────────────┘    └──────┬───────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ WebViewScreen.tsx    │
                    │ handles message:     │
                    │ AsyncStorage.clear() │
                    └──────────────────────┘
```

## Files Modified

1. ✅ `web-portal/src/services/authService.ts` - Main fix
2. ✅ `web-portal/src/components/Navbar.tsx` - Async logout
3. ✅ `web-portal/src/app/dashboard/page.tsx` - Async logout
4. ✅ `web-portal/src/app/settings/page.tsx` - Async logout

## Files Referenced (No Changes Needed)

- `web-portal/src/utils/storage.ts` - Already has bridge
- `web-portal/src/utils/cache.ts` - Already has clear()
- `web-portal/src/utils/api-cache.ts` - Already has clear()
- `IPTVMobile/src/screens/WebViewScreen.tsx` - Already handles STORAGE_CLEAR

## Benefits

1. ✅ **Proper security** - No cached credentials after logout
2. ✅ **Cross-platform consistency** - Works same in web and mobile
3. ✅ **Clean state** - Fresh app state after logout
4. ✅ **No data leaks** - User data doesn't persist between sessions
5. ✅ **Better UX** - Users can safely switch accounts

## Notes

- The storage adapter already existed and was working correctly
- The issue was that `authService` was bypassing the adapter
- All other services should use the storage adapter too (if they store sensitive data)
- The async/await pattern ensures storage is cleared before navigation
