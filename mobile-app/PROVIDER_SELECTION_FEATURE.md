# Multi-Provider Selection Feature

## Overview
This feature allows users to select which IPTV providers to display in the app when multiple providers are available. Users can manage their provider selections and filter content by provider.

## Features Implemented

### 1. Provider Selection Screen
- **File**: `/mobile-app/src/screens/ProviderSelectionScreen.tsx`
- Displays all available providers in a checkbox list
- Select All / Deselect All functionality
- Shows provider name, type, and server URL
- Saves selections to AsyncStorage
- Automatically shows when multiple providers are detected after backend sync

### 2. Provider Dropdown Component
- **File**: `/mobile-app/src/components/ProviderDropdown.tsx`
- Appears in Live TV, Movies, and Series screens
- Only visible when multiple providers are selected
- Allows filtering content by specific provider or "All Providers"
- Modal-based selection UI

### 3. Provider Settings Screen
- **File**: `/mobile-app/src/screens/ProviderSettingsScreen.tsx`
- Accessible via settings icon in tab navigation header
- Allows users to change provider selections after initial setup
- Enforces at least one provider must be selected
- Save button to persist changes

### 4. Provider Service
- **File**: `/mobile-app/src/services/ProviderService.ts`
- Centralized provider data management
- Methods:
  - `getAllProviders()` - Get all providers
  - `getActiveProviders()` - Get only active providers
  - `getSelectedProviders()` - Get user's selected providers
  - `saveSelectedProviderIds()` - Save provider selections
  - `hasMultipleProviders()` - Check if multiple providers available
  - `convertBackendProvider()` - Transform backend data to app format
  - `updateFromBackendSync()` - Update providers from backend sync

### 5. Updated Navigation Flow
- **File**: `/mobile-app/App.tsx`
- Checks for multiple providers after backend sync
- Shows ProviderSelectionScreen before dashboard if needed
- Adds ProviderSettingsScreen to navigation stack
- Settings icon in tab header to access provider settings

## User Flow

### Initial Login with Multiple Providers:
1. User logs in
2. App syncs data from backend
3. If multiple providers detected → Shows ProviderSelectionScreen
4. User selects which providers to show
5. Selections saved to AsyncStorage
6. User proceeds to dashboard

### Initial Login with Single Provider:
1. User logs in
2. App syncs data from backend
3. Single provider detected → Goes directly to dashboard
4. No provider selection needed

### Managing Providers Later:
1. User taps settings icon in tab header
2. Opens ProviderSettingsScreen
3. User can check/uncheck providers
4. Must keep at least one provider selected
5. Save Changes button persists selections

### Using Provider Dropdown:
1. In Live/Movies/Series screens
2. If multiple providers selected → Dropdown appears at top
3. User can tap dropdown to filter by specific provider
4. Select "All Providers" to see content from all selected providers

## Data Storage

### AsyncStorage Keys:
- `app_providers` - Array of all provider objects
- `selected_providers` - Array of selected provider IDs
- `stalker_provider_config` - Legacy single provider config (for backward compatibility)

### Provider Data Structure:
```typescript
interface Provider {
  id: string;
  name: string;
  type?: string; // e.g., 'stalker', 'xtream'
  serverUrl: string;
  macAddress: string;
  token?: string;
  serialNumber?: string;
  isActive: boolean;
  createdAt: number;
  lastSyncedAt?: number;
}
```

## Backend Integration

### StalkerSyncService Updates:
- `initializeFromBackend()` now calls `ProviderService.updateFromBackendSync()`
- Saves all providers from backend response
- Maintains backward compatibility with single provider setup

### Expected Backend Response:
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "uuid",
        "name": "Stream4K",
        "type": "stalker",
        "server_url": "http://tv.stream4k.cc",
        "mac_address": "00:1a:79:17:f4:f5",
        "token": "bearer_token",
        "is_active": true
      }
    ],
    "categories": [...],
    "channels": [...]
  }
}
```

## UI Components

### Provider Card Design:
- Provider name (large, bold)
- Provider type badge (small, blue)
- Server URL (small, gray)
- Checkbox indicator (checkmark icon when selected)
- Selected state: blue border and background tint

### Color Scheme:
- Primary: `#0a84ff` (iOS blue)
- Background: `#000` (black)
- Card background: `#1c1c1e` (dark gray)
- Text: `#fff` (white)
- Muted text: `#8e8e93` (gray)

## Future Enhancements (Not Yet Implemented)

### Task 4: Repository Filters
- Add `providerId` parameter to `CategoryRepository.getLiveCategories()`
- Add `providerId` parameter to `ChannelRepository` methods
- Filter database queries based on selected provider
- This would require database schema updates to link categories/channels to providers

### Currently:
- Provider dropdown is UI-only
- No actual filtering happens yet
- All content is shown regardless of provider selection
- Repository methods need to be updated to accept and use `providerId` parameter

## Testing Recommendations

1. **Test with Single Provider:**
   - Verify no provider selection screen appears
   - Verify no dropdown appears in content screens

2. **Test with Multiple Providers:**
   - Verify provider selection screen appears after login/sync
   - Verify dropdown appears in Live/Movies/Series screens
   - Test selecting different providers in dropdown

3. **Test Provider Settings:**
   - Change selections and verify they persist
   - Try to deselect all providers (should be prevented)
   - Verify logout button still works

4. **Test Data Persistence:**
   - Make selections, close app, reopen
   - Verify selections are remembered

## Files Modified

### New Files:
- `/mobile-app/src/screens/ProviderSelectionScreen.tsx`
- `/mobile-app/src/screens/ProviderSettingsScreen.tsx`
- `/mobile-app/src/components/ProviderDropdown.tsx`
- `/mobile-app/src/services/ProviderService.ts`

### Modified Files:
- `/mobile-app/App.tsx` - Added navigation and provider check logic
- `/mobile-app/src/types/Provider.ts` - Added `type` property
- `/mobile-app/src/screens/LiveTVScreen.tsx` - Added provider dropdown
- `/mobile-app/src/screens/MoviesScreen.tsx` - Added provider dropdown
- `/mobile-app/src/screens/SeriesScreen.tsx` - Added provider dropdown
- `/mobile-app/src/services/StalkerSyncService.ts` - Added ProviderService integration

## Notes

- Provider filtering in repositories is not yet implemented (Task 4)
- The dropdown currently doesn't filter actual content, only shows UI
- Backend must provide multiple providers in sync response for feature to activate
- Settings icon placement may need adjustment based on design preferences
