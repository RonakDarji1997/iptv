# IPTV Platform - UI Dashboard

## Overview

Web-based admin dashboard for managing your IPTV platform. Built with Next.js 16, React 19, and Tailwind CSS.

---

## Features

### 📊 Dashboard Home
- Quick stats overview (providers, profiles, devices)
- Getting started guide
- Real-time status indicators

### 📡 Provider Management
- **Add Providers**: Stalker, Xtream, M3U support
- **Auto-handshake**: Automatic token generation for Stalker
- **MAC Generation**: Auto-generate MAG-style MAC addresses
- **Sync Control**: Manual sync trigger per provider
- **Status Tracking**: Active/Inactive, last sync timestamp
- **Quick Actions**: Edit, delete, sync providers

### 👤 Profile Management
- **Profile Types**: Admin, Kid, Guest
- **Parental Controls**: Age rating limits for Kid profiles
- **PIN Protection**: Optional 4-digit PIN lock
- **Multi-Provider**: Profiles linked to specific providers
- **Visual Indicators**: Color-coded profile type badges

### 📱 Device Management
- **Device Registration**: Register TV apps with MAC addresses
- **Provider Linking**: Each device linked to a provider
- **Activity Tracking**: Last active timestamps
- **Device Info**: MAC, STB ID, registration date

### 🔄 Sync Status
- **Manual Sync**: Trigger sync for individual providers
- **Bulk Sync**: Sync all providers at once
- **Real-time Status**: Visual feedback during sync
- **Sync History**: Last sync timestamps per provider
- **Info Panel**: Educational content about sync process

---

## Pages

```
/dashboard                  - Home page with overview
/dashboard/providers        - Provider management
/dashboard/profiles         - Profile management
/dashboard/devices          - Device management
/dashboard/sync             - Sync status and controls
```

---

## Components

### DashboardLayout
- Responsive sidebar navigation
- Header with toggle button
- Mobile-friendly design
- Consistent layout across all pages

### Custom Hooks

#### `useProviders(userId)`
```typescript
const {
  providers,          // Array of providers
  loading,            // Loading state
  error,              // Error message
  refresh,            // Reload providers
  addProvider,        // Add new provider
  updateProvider,     // Update provider
  deleteProvider,     // Delete provider
  syncProvider,       // Trigger sync
} = useProviders(userId);
```

#### `useProfiles(userId, providerId?)`
```typescript
const {
  profiles,           // Array of profiles
  loading,            // Loading state
  error,              // Error message
  refresh,            // Reload profiles
  addProfile,         // Add new profile
  updateProfile,      // Update profile
  deleteProfile,      // Delete profile
} = useProfiles(userId, providerId);
```

#### `useDevices(userId, providerId?)`
```typescript
const {
  devices,            // Array of devices
  loading,            // Loading state
  error,              // Error message
  refresh,            // Reload devices
  addDevice,          // Register new device
} = useDevices(userId, providerId);
```

---

## Usage

### 1. Start Development Server
```bash
npm run dev
```
Visit http://localhost:2005/dashboard

### 2. Add Your First Provider

1. Navigate to **Providers** page
2. Click **+ Add Provider**
3. Fill in the form:
   - **Type**: Stalker
   - **Name**: My IPTV Provider
   - **URL**: http://tv.stream4k.cc/stalker_portal/
   - **Bearer Token**: Your bearer token
   - **ADID**: Your ADID (optional)
   - **MAC**: Leave blank for auto-generation
4. Click **Add Provider**
5. Provider will be added and handshake performed automatically

### 3. Create Profiles

1. Navigate to **Profiles** page
2. Click **+ Add Profile**
3. Configure profile:
   - **Provider**: Select from dropdown
   - **Name**: Admin Profile
   - **Type**: Admin / Kid / Guest
   - **PIN**: Optional 4-digit PIN
   - **Age Rating**: For Kid profiles only
4. Click **Add Profile**

### 4. Sync Content

1. Navigate to **Sync Status** page
2. Click **🔄 Sync Now** for a provider
3. Wait for sync to complete
4. Content fetched and snapshots generated

### 5. Register Devices

1. Navigate to **Devices** page
2. Click **+ Register Device**
3. Fill in:
   - **Provider**: Select provider
   - **Device Name**: Living Room TV
   - **MAC**: Provider's MAC address
4. Click **Register**

---

## UI Features

### Responsive Design
- Mobile-first approach
- Collapsible sidebar on mobile
- Responsive grid layouts
- Touch-friendly controls

### Real-time Feedback
- Loading states for async operations
- Success/error notifications
- Visual sync progress indicators
- Disabled states for invalid actions

### Visual Hierarchy
- Color-coded badges for status
- Icon-based navigation
- Card-based layouts
- Clear call-to-action buttons

### User Experience
- Modal forms for data entry
- Confirmation dialogs for destructive actions
- Inline validation
- Helpful placeholder text

---

## Styling

Built with **Tailwind CSS** utility classes:
- `bg-blue-600` - Primary action buttons
- `bg-red-600` - Destructive actions
- `bg-green-100` - Success states
- `bg-yellow-50` - Warning states
- `shadow` - Card shadows
- `rounded-lg` - Rounded corners
- `transition-colors` - Smooth transitions

---

## Current Limitations

1. **Hardcoded User ID**: Currently using `user-1` - will be replaced with auth
2. **No User Management**: Single user mode for now
3. **No Edit Modals**: Can only add/delete, not edit
4. **No Search/Filter**: All lists show full data
5. **No Pagination**: All items loaded at once

---

## Next Steps

### Authentication
- [ ] User login/register pages
- [ ] JWT token management
- [ ] Protected routes
- [ ] Session management

### Enhanced Features
- [ ] Edit modals for providers, profiles, devices
- [ ] Search and filter capabilities
- [ ] Pagination for large lists
- [ ] Sorting options
- [ ] Bulk actions (delete multiple)

### Content Management
- [ ] Browse channels/movies/series
- [ ] Category management
- [ ] Content search
- [ ] Favorites management

### Analytics
- [ ] Usage statistics
- [ ] Popular content
- [ ] Device activity graphs
- [ ] Sync history logs

### Settings
- [ ] User preferences
- [ ] Theme customization
- [ ] Notification settings
- [ ] API key management

---

## File Structure

```
src/
├── components/
│   └── dashboard/
│       └── DashboardLayout.tsx
├── hooks/
│   ├── useProviders.ts
│   ├── useProfiles.ts
│   └── useDevices.ts
└── app/
    └── dashboard/
        ├── page.tsx              # Home
        ├── providers/
        │   └── page.tsx          # Providers
        ├── profiles/
        │   └── page.tsx          # Profiles
        ├── devices/
        │   └── page.tsx          # Devices
        └── sync/
            └── page.tsx          # Sync Status
```

---

## Development Notes

### State Management
- React hooks for local state
- Custom hooks for API calls
- No global state library (yet)
- Component-level state management

### Error Handling
- Try-catch blocks in all API calls
- User-friendly error messages
- Console logging for debugging
- Graceful fallbacks

### Performance
- Client-side rendering
- On-demand data fetching
- Minimal re-renders
- Optimized hook dependencies

---

## Testing Checklist

- [ ] Add provider with auto-handshake
- [ ] Add provider with manual MAC
- [ ] Sync provider content
- [ ] Create Admin profile
- [ ] Create Kid profile with age rating
- [ ] Create profile with PIN
- [ ] Register device
- [ ] Delete provider (cascade delete)
- [ ] Delete profile
- [ ] Mobile responsive layout
- [ ] Sidebar toggle
- [ ] Modal forms
- [ ] Loading states
- [ ] Error states

---

## Screenshots

### Dashboard Home
![Dashboard](https://via.placeholder.com/800x400?text=Dashboard+Home)

### Providers Management
![Providers](https://via.placeholder.com/800x400?text=Providers+Management)

### Profile Creation
![Profiles](https://via.placeholder.com/800x400?text=Profile+Creation)

---

## Support

For issues or questions:
1. Check backend logs: `npm run dev` console
2. Check browser console for client errors
3. Verify API endpoints are responding
4. Ensure PostgreSQL is running
5. Check `.env.local` configuration

---

**Status**: ✅ Dashboard UI fully functional and ready for testing!
