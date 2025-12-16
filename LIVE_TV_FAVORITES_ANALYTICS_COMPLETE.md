# Live TV Favorites & Analytics Implementation

## Summary
Implemented comprehensive favorites and analytics system for Live TV with database persistence, category favorites, channel play tracking, and mobile-responsive UI improvements.

## ✅ Completed Features

### 1. **Mobile UI Improvements**
- **Channel Name Positioning**: 
  - Mobile: Channel name displays ABOVE the preview player
  - Desktop: Channel name displays BELOW the preview player
  - Responsive layout using Tailwind `lg:` breakpoint

### 2. **Category Favorites**
- ⭐ Star button on each category row (shows on hover)
- Click to favorite/unfavorite categories
- Filled yellow star for favorited categories
- Saves to database with metadata (alias)
- Toast notifications for user feedback

### 3. **Channel Favorites** (Enhanced)
- ⭐ Star button next to channel name in preview
- Now saves to **database** instead of localStorage
- Stores metadata: logo, cmd, categoryName, channel number
- API integration with `/favorites` endpoint
- Supports both add and remove operations

### 4. **Channel Play Analytics**
- **Automatic tracking** when channel is selected
- Tracks in `channel_analytics` table:
  - `play_count` - Total times played
  - `total_watch_time` - Cumulative watch duration
  - `last_watched_at` - Most recent play timestamp
  - `first_watched_at` - Initial play timestamp
  - Channel metadata (name, logo, cmd, category info)
- API endpoint: `POST /channel-analytics/track`

### 5. **Future Dashboard Preparation**
- **User Settings Table**: `user_settings`
  - `auto_start_enabled` - Enable/disable auto-start
  - `auto_start_type` - CHANNEL | CATEGORY | MOST_PLAYED
  - `auto_start_channel_id` - Specific channel to auto-start
  - `auto_start_category_id` - Specific category to auto-start
  - `preferences` - JSON field for additional settings

## 🗄️ Database Changes

### New Migration: `005_add_channel_analytics_and_category_favorites.sql`

#### Tables Created:
1. **`channel_analytics`**
   - Tracks play count and watch time per user/channel
   - Indexes on user_id, channel_id, play_count, last_watched_at
   - Unique constraint: (user_id, provider_id, channel_id)

2. **`user_settings`**
   - Auto-start configuration per user
   - JSONB preferences field for extensibility
   - Unique constraint on user_id

#### Table Updates:
- **`favorites`**: 
  - Added support for `CATEGORY` content type
  - Added `metadata` JSONB field
  - Added `play_count` INTEGER field
  - Added `last_played_at` TIMESTAMP field

## 🔌 New API Endpoints

### Channel Analytics
- `POST /channel-analytics/track` - Track channel play
- `GET /channel-analytics/top?limit=10` - Get top played channels
- `GET /channel-analytics/recent?limit=10` - Get recently played channels
- `GET /channel-analytics/stats` - Get overall statistics
- `GET /channel-analytics/channel/:channelId` - Get specific channel analytics

### User Settings
- `GET /user-settings` - Get user settings (creates default if not exists)
- `PUT /user-settings` - Update user settings
- `PATCH /user-settings/auto-start` - Update auto-start settings specifically

### Favorites (Updated)
- Now supports `CATEGORY` content type
- Stores metadata as JSONB
- Updated to upsert (update on conflict)

## 📁 Files Modified

### Backend
1. `/iptv-sync-backend/packages/database/migrations/005_add_channel_analytics_and_category_favorites.sql` ✨ NEW
2. `/iptv-sync-backend/packages/api/src/routes/channel-analytics.ts` ✨ NEW
3. `/iptv-sync-backend/packages/api/src/routes/user-settings.ts` ✨ NEW
4. `/iptv-sync-backend/packages/api/src/routes/favorites.ts` - Updated to support categories & metadata
5. `/iptv-sync-backend/packages/api/src/index.ts` - Added new route imports and middleware

### Frontend
1. `/web-portal/src/app/browse/live/page.tsx` - Major updates:
   - Added `favoriteCategories` state
   - Replaced localStorage with API calls for favorites
   - Added `toggleCategoryFavorite()` function
   - Updated `toggleFavorite()` to use API
   - Updated `updateChannelStats()` to use channel-analytics API
   - Responsive channel name positioning (mobile above, desktop below)
   - Category star buttons with hover effect
   - EPG hidden on mobile (existing feature)

## 🎯 User Experience

### Category Favorites
```typescript
// User hovers over category → star button appears
// Click star → saved to database
// Star turns yellow when favorited
// Click again → removed from favorites
```

### Channel Play Tracking
```typescript
// User clicks channel → updateChannelStats() called
// Data sent to backend:
{
  channelId, channelName, channelLogo,
  channelCmd, channelNumber,
  categoryId, categoryName,
  watchTime: 0 // Updated when user stops watching
}
// Backend increments play_count, updates timestamps
```

### Mobile Layout
```
┌─────────────────────────┐
│ Channel Name & ⭐       │ ← Above video
├─────────────────────────┤
│                         │
│   Video Preview Player  │
│                         │
└─────────────────────────┘
```

### Desktop Layout
```
┌─────────────────────────┐
│                         │
│   Video Preview Player  │
│                         │
├─────────────────────────┤
│ Channel Name & ⭐       │ ← Below video
├─────────────────────────┤
│   EPG Section           │
└─────────────────────────┘
```

## 🔮 Future Dashboard Capabilities

With this implementation, you can now build a dashboard that:

1. **Shows Most Played Channels**
   ```sql
   SELECT * FROM channel_analytics 
   WHERE user_id = $1 
   ORDER BY play_count DESC 
   LIMIT 10
   ```

2. **Auto-Start Most Watched Channel**
   ```typescript
   // User enables in settings
   await axios.patch('/user-settings/auto-start', {
     enabled: true,
     type: 'MOST_PLAYED'
   })
   
   // Dashboard loads most played channel
   const { data } = await axios.get('/channel-analytics/top?limit=1')
   autoStartChannel(data.channels[0])
   ```

3. **Track Watch Time**
   - Currently tracking play count
   - `total_watch_time` field ready for duration tracking
   - Can be updated when video ends or user navigates away

4. **User Preferences**
   - All stored in `user_settings.preferences` JSONB
   - Extensible for future features
   - No schema changes needed

## 🧪 Testing Checklist

- [x] Database migration runs successfully
- [x] Backend builds without errors
- [x] New API routes registered
- [x] Category favorites toggle works
- [x] Channel favorites save to database
- [x] Channel play tracking sends data
- [ ] Test mobile layout (channel name above video)
- [ ] Test desktop layout (channel name below video)
- [ ] Verify favorites persist across page refresh
- [ ] Check analytics data in database
- [ ] Test auto-start settings (future)

## 📊 Database Schema Reference

### channel_analytics
```sql
user_id UUID
provider_id UUID
channel_id VARCHAR(255)
channel_name VARCHAR(255)
channel_logo TEXT
category_id VARCHAR(255)
category_name VARCHAR(255)
play_count INTEGER DEFAULT 0
total_watch_time BIGINT DEFAULT 0
last_watched_at TIMESTAMP
first_watched_at TIMESTAMP
channel_cmd TEXT
channel_number INTEGER
```

### user_settings
```sql
user_id UUID UNIQUE
auto_start_enabled BOOLEAN
auto_start_type VARCHAR(50) -- CHANNEL | CATEGORY | MOST_PLAYED
auto_start_channel_id VARCHAR(255)
auto_start_category_id VARCHAR(255)
preferences JSONB
```

### favorites (updated)
```sql
content_type VARCHAR(50) -- CHANNEL | MOVIE | SERIES | EPISODE | CATEGORY
metadata JSONB -- logo, cmd, categoryName, etc.
play_count INTEGER
last_played_at TIMESTAMP
```

## 🚀 Deployment Notes

1. Run migration: `npm run db:migrate`
2. Build backend: `cd packages/api && npm run build`
3. Restart backend: `npm run dev`
4. Frontend auto-reloads (Next.js dev server)

---

**Implementation Date**: December 15, 2025  
**Backend**: iptv-sync-backend (PostgreSQL)  
**Frontend**: web-portal (Next.js)
