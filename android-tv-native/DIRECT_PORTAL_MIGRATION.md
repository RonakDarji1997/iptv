# Direct Portal API Migration

## Problem
- App was routing all API calls through backend server (100.68.86.22:2005)
- Backend had stale portal URL cached (192.168.2.69:8082 - unreachable)
- Connection refused errors when trying to load Live TV

## Solution
- Bypass backend entirely
- Call Stalker portal directly from Android app
- TiviMate-style architecture: direct portal communication

## Changes Required
1. Create `StalkerPortalClient` - direct Stalker API client
2. Update `LiveTVManager` to use direct portal calls
3. Remove backend API dependency for Live TV

## Status
- ✅ Root cause identified
- 🔄 Implementing direct portal client
