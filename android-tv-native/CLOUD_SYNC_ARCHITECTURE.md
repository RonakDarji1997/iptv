# Cloud Sync Implementation Guide

## Overview
This implementation adds cloud synchronization features to the Android TV app, allowing users to optionally sync their data (favorites, watch history) with a cloud backend.

## Architecture

### 1. Backend Changes

#### Database Schema (`007_add_cloud_sync_and_subscription_features.sql`)
- Added `cloud_enabled` (BOOLEAN) to users table - controls if user wants cloud sync
- Added `subscription_enabled` (BOOLEAN) to users table - controls subtitle features
- Created index for fast lookup of cloud-enabled users

#### API Endpoints (`/api/tv/*`)

**POST /api/tv/link-account**
- Links TV device to cloud account
- Creates user if doesn't exist, or links existing user
- Syncs provider configuration to cloud
- Returns cloud user ID and subscription status

**POST /api/tv/unlink-account** (requires auth)
- Disables cloud sync for user
- Keeps local data intact

**GET /api/tv/sync-status** (requires auth)
- Returns current cloud sync status
- Returns subscription status
- Returns device count

### 2. Android TV Changes

#### Database Schema (Version 13)
Updated `UserEntity` with:
- `cloudUserId: String?` - Cloud user ID from backend
- `cloudEnabled: Boolean` - Whether cloud sync is enabled
- `subscriptionEnabled: Boolean` - Whether subscription features are enabled

Migration `MIGRATION_12_13` safely adds these columns.

#### CloudSyncManager
Central manager for all cloud operations:

**Key Methods:**
- `isCloudEnabled()` - Check if cloud sync is on
- `isSubscriptionEnabled()` - Check if user has subscription features
- `linkToCloud(email, password, deviceId, deviceName)` - Link device to cloud account
- `unlinkFromCloud()` - Disable cloud sync
- `syncToCloud()` - Push local data (favorites, watch history) to cloud
- `syncFromCloud()` - Pull cloud data to local database

**Features:**
- Automatic fallback to local data if cloud unavailable
- Only syncs when cloud enabled
- Handles provider syncing during account linking

### 3. Data Flow

#### Initial Setup (No Cloud)
```
User → Setup Provider → Local DB only
```

#### Link to Cloud (from Settings)
```
User → Enter credentials → POST /api/tv/link-account
→ Cloud creates/updates user
→ Returns cloudUserId
→ Local DB updated with cloudUserId, cloudEnabled=true
→ Initial sync: Local data → Cloud
```

#### With Cloud Enabled
```
User makes change (add favorite, watch video)
→ Save to local DB immediately
→ Background sync to cloud (if online)

App starts
→ Load from local DB (instant)
→ Background sync from cloud (if online and cloudEnabled)
→ Merge with local data
```

#### If Cloud Unavailable
```
All operations continue using local DB
No user-facing errors
Data syncs when connection restored
```

## User Experience Flows

### Flow 1: New User Without Cloud
1. User sets up provider directly on TV
2. Creates local user (no cloud)
3. All data stored locally
4. Settings shows option to "Link to Cloud" ✨

### Flow 2: New User With Cloud
1. Initial setup shows "Sign in to sync your data" option
2. User enters email/password
3. App calls `linkToCloud()`
4. Provider auto-synced to cloud
5. Future watch history/favorites synced automatically

### Flow 3: Existing User Links Cloud Later
1. User goes to Settings
2. Taps "Link to Cloud"
3. Enters credentials
4. All existing local data pushed to cloud
5. Future changes bidirectionally synced

### Flow 4: User Disables Cloud Sync
1. User goes to Settings
2. Toggles "Cloud Sync" off
3. Local data preserved
4. No more syncing to cloud
5. Can re-enable anytime

## Implementation Status

### ✅ Completed
- [x] Backend database schema with cloud_enabled and subscription_enabled
- [x] Backend API endpoints for TV linking (/api/tv/*)
- [x] Android TV database schema with cloud fields
- [x] CloudSyncManager with full sync logic
- [x] Migration scripts for both backend and Android

### 🔲 To Do
- [ ] Cloud sign-in UI screen
- [ ] Settings screen with cloud toggle
- [ ] Show/hide subtitle icon based on subscription_enabled
- [ ] Sync status indicators in UI
- [ ] Test offline fallback behavior

## Subtitle Feature Control

The `subscription_enabled` flag controls whether subtitle features are shown:

```kotlin
// In VODPlayerComponent or where subtitles are shown
val cloudSyncManager = CloudSyncManager(context)
val showSubtitles = cloudSyncManager.isSubscriptionEnabled()

if (showSubtitles) {
    // Show subtitle icon/controls
} else {
    // Hide subtitle features
}
```

## Usage Example

```kotlin
// In your Activity or ViewModel
val cloudSyncManager = CloudSyncManager(context)

// Check if cloud sync is enabled
lifecycleScope.launch {
    if (cloudSyncManager.isCloudEnabled()) {
        // Sync from cloud on app start
        cloudSyncManager.syncFromCloud()
    }
}

// Link to cloud (from settings screen)
lifecycleScope.launch {
    val result = cloudSyncManager.linkToCloud(
        email = "user@example.com",
        password = "password123",
        deviceId = "unique-device-id",
        deviceName = "Living Room TV"
    )
    
    result.onSuccess { linkResult ->
        Toast.makeText(context, "Linked to cloud!", Toast.LENGTH_SHORT).show()
        // linkResult.subscriptionEnabled tells if subtitles are available
    }
    
    result.onFailure { error ->
        Toast.makeText(context, "Failed: ${error.message}", Toast.LENGTH_SHORT).show()
    }
}

// Sync after user makes changes
lifecycleScope.launch {
    // User adds favorite
    favoriteDao.insert(favorite)
    // Push to cloud
    cloudSyncManager.syncToCloud()
}
```

## Security Considerations

1. **Passwords**: Stored in local DB for token refresh, encrypted in backend
2. **Tokens**: Bearer tokens used for all authenticated requests
3. **Provider Credentials**: Synced to cloud, stored securely
4. **Local Data**: Always available, cloud is optional enhancement

## Performance Optimizations

1. **Local-First**: All reads from local DB (instant)
2. **Background Sync**: Cloud sync happens asynchronously
3. **Conflict Resolution**: Cloud data overwrites local on manual sync
4. **No Blocking**: Network failures don't block UI

---

**Note**: All cloud features are optional. Users can use the app completely offline with all features except cloud sync. Data is always stored locally first for reliability.
