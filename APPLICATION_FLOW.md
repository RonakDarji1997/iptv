# IPTV Platform - Application Flow

## 🎯 Current Application Structure

The application has **TWO SEPARATE INTERFACES**:

### 1. **User-Facing IPTV App** (Main App)
- **Entry Point**: `/` (root page)
- **Purpose**: Watch channels, movies, series
- **Authentication**: Password-based login

### 2. **Admin Dashboard** (Management Interface)
- **Entry Point**: `/dashboard`
- **Purpose**: Manage providers, profiles, devices
- **Authentication**: None (hardcoded user-1)

---

## 📺 USER APP FLOW (Main IPTV Viewer)

### **Route**: `http://localhost:2005/`

```
┌─────────────────────────────────────────────────────────────┐
│                     LANDING PAGE (/)                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           LOGIN FORM (LoginForm.tsx)                  │ │
│  │                                                       │ │
│  │   🔒 Ronika's IPTV                                   │ │
│  │   Enter password to continue                         │ │
│  │                                                       │ │
│  │   Password: [_______________] 👁                     │ │
│  │                                                       │ │
│  │            [Sign In]                                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    User enters password
                           ↓
              verifyPassword() checks .env.local
                           ↓
                    ┌──────┴──────┐
                    │             │
              ✅ Valid      ❌ Invalid
                    │             │
                    ↓             ↓
            Set isLoggedIn   Show error
                    ↓
            Auto-authenticate
              (from .env)
                    ↓
    ┌───────────────────────────────────────────────────────┐
    │          MAIN IPTV INTERFACE (page.tsx)               │
    │                                                       │
    │  ┌─────────────────────────────────────────────────┐ │
    │  │  🔍 Search  |  Channels  Movies  Series       │ │
    │  └─────────────────────────────────────────────────┘ │
    │                                                       │
    │  ┌─────────────────────────────────────────────────┐ │
    │  │                                                 │ │
    │  │           VIDEO PLAYER                          │ │
    │  │      (Playing selected channel)                 │ │
    │  │                                                 │ │
    │  └─────────────────────────────────────────────────┘ │
    │                                                       │
    │  ┌─────────────────────────────────────────────────┐ │
    │  │  Category: [All Categories ▼]                   │ │
    │  └─────────────────────────────────────────────────┘ │
    │                                                       │
    │  📺 Channel 1    📺 Channel 2    📺 Channel 3      │
    │  📺 Channel 4    📺 Channel 5    📺 Channel 6      │
    │                                                       │
    └───────────────────────────────────────────────────────┘
```

### **User App Features:**

#### After Login:
1. **Video Player** - Large video player at top
2. **Tab Navigation** - Switch between Channels/Movies/Series
3. **Category Filter** - Dropdown to filter by category
4. **Search Bar** - Search across content
5. **Content Grid** - Cards showing available content
6. **Click to Play** - Click any content to play in video player

#### Data Source:
- Uses credentials from `.env.local`:
  ```
  STALKER_MAC=00:1A:79:17:F4:F5
  STALKER_URL=http://tv.stream4k.cc/stalker_portal/
  STALKER_BEARER=...
  STALKER_ADID=...
  ```
- Fetches content directly from Stalker portal
- No database connection (standalone mode)

---

## 🛠️ ADMIN DASHBOARD FLOW

### **Route**: `http://localhost:2005/dashboard`

```
┌─────────────────────────────────────────────────────────────┐
│                  DASHBOARD HOME                             │
│                  /dashboard                                 │
│                                                             │
│  Welcome to IPTV Platform                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │📡       │ │👤       │ │📱       │ │🔄       │        │
│  │Providers│ │Profiles │ │Devices  │ │Last Sync│        │
│  │   -     │ │   -     │ │   -     │ │   -     │        │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────────────────────┘
            │
            ├─────────────────────────────────────────────┐
            │                                             │
            ↓                                             ↓
┌───────────────────────┐                    ┌───────────────────────┐
│  PROVIDERS PAGE       │                    │  PROFILES PAGE        │
│  /dashboard/providers │                    │  /dashboard/profiles  │
│                       │                    │                       │
│  [+ Add Provider]     │                    │  [+ Add Profile]      │
│                       │                    │                       │
│  📡 Stream4K          │                    │  👤 Admin Profile     │
│  ├─ URL: http://...   │                    │  ├─ Type: ADMIN       │
│  ├─ MAC: 00:1A:79...  │                    │  ├─ Age Rating: -     │
│  ├─ Status: Active    │                    │  └─ [Delete]          │
│  ├─ [🔄 Sync]        │                    │                       │
│  └─ [🗑️ Delete]      │                    │  👤 Kids Profile      │
│                       │                    │  ├─ Type: KID         │
│  📡 Provider 2        │                    │  ├─ Age Rating: 13+   │
│  └─ ...               │                    │  └─ [Delete]          │
└───────────────────────┘                    └───────────────────────┘
            │                                             │
            ↓                                             ↓
┌───────────────────────┐                    ┌───────────────────────┐
│  DEVICES PAGE         │                    │  SYNC STATUS PAGE     │
│  /dashboard/devices   │                    │  /dashboard/sync      │
│                       │                    │                       │
│  [+ Register Device]  │                    │  [🔄 Sync All]        │
│                       │                    │                       │
│  📱 Living Room TV    │                    │  📡 Stream4K          │
│  ├─ MAC: 00:1A:79...  │                    │  ├─ Last: 10 min ago │
│  ├─ Provider: Stream4K│                    │  ├─ Status: Active    │
│  ├─ Last Active: Now  │                    │  └─ [🔄 Sync Now]    │
│  └─ Registered: Today │                    │                       │
│                       │                    │  📡 Provider 2        │
│  📱 Bedroom TV        │                    │  └─ [🔄 Sync Now]    │
│  └─ ...               │                    │                       │
└───────────────────────┘                    └───────────────────────┘
```

### **Admin Dashboard Features:**

#### Sidebar Navigation:
- 📊 Dashboard - Overview
- 📡 Providers - Manage IPTV providers
- 👤 Profiles - User profiles with parental controls
- 📱 Devices - TV device registration
- 🔄 Sync Status - Content synchronization

#### Current Limitations:
- **No Authentication** - Anyone can access `/dashboard`
- **Hardcoded User** - Uses `user-1` for all operations
- **No User Management** - Single user mode

---

## 🔄 COMPLETE FLOW COMPARISON

### **User App Flow** (Watching Content)
```
1. Visit http://localhost:2005
2. See Login Form
3. Enter password → Verify
4. Auto-authenticate with .env credentials
5. Fetch categories from Stalker portal
6. Display channels/movies/series
7. Click content → Stream directly
```

### **Admin Dashboard Flow** (Managing System)
```
1. Visit http://localhost:2005/dashboard
2. See Dashboard Home (no auth required)
3. Add Provider:
   - Enter Stalker credentials
   - Backend performs handshake
   - Token stored in database
4. Sync Provider:
   - Fetch all content metadata
   - Store in PostgreSQL
   - Generate snapshots per profile
5. Create Profiles:
   - Admin/Kid/Guest types
   - Set age ratings
6. Register Devices:
   - Link device to provider
   - Store MAC + token
```

---

## 🎯 KEY DIFFERENCES

| Feature | User App (/) | Admin Dashboard (/dashboard) |
|---------|-------------|----------------------------|
| **Purpose** | Watch content | Manage system |
| **Auth** | Password login | None (hardcoded user) |
| **Data Source** | Direct Stalker API | PostgreSQL database |
| **User** | End viewer | Administrator |
| **Content** | Live streaming | Metadata management |
| **Database** | Not used | Full CRUD operations |

---

## 🚨 CURRENT ISSUES

### 1. **Disconnected Systems**
- User app doesn't use the database
- Admin dashboard doesn't affect user app
- No integration between the two

### 2. **Missing Authentication**
- User app: Basic password only
- Admin dashboard: No authentication at all

### 3. **No User Management**
- Can't create/manage users
- No profile selection for user app
- Hardcoded credentials

---

## 🎯 RECOMMENDED UNIFIED FLOW

Here's how it **SHOULD** work:

```
┌─────────────────────────────────────────────────────────────┐
│                     LOGIN PAGE                              │
│                    (Unified Auth)                           │
│                                                             │
│  Username: [___________]                                   │
│  Password: [___________]                                   │
│  [Sign In]                                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    Authenticate User
                           ↓
              ┌────────────┴────────────┐
              │                         │
        User Role                  Admin Role
              │                         │
              ↓                         ↓
    ┌─────────────────┐      ┌─────────────────┐
    │  PROFILE SELECT │      │  ADMIN DASHBOARD│
    │                 │      │                 │
    │  👤 Admin      │      │  📡 Providers  │
    │  👤 Kids       │      │  👤 Profiles   │
    │  👤 Guest      │      │  📱 Devices    │
    └─────────────────┘      │  🔄 Sync       │
              │               └─────────────────┘
              ↓
    ┌─────────────────┐
    │  WATCH CONTENT  │
    │                 │
    │  (Uses snapshot │
    │   from profile) │
    └─────────────────┘
```

### **Unified Flow Steps:**

1. **User/Admin Login** → JWT authentication
2. **Profile Selection** (for users) or **Dashboard Access** (for admin)
3. **User App** → Downloads snapshot from `/api/snapshots/:profileId/latest`
4. **Content Browsing** → Uses pre-filtered snapshot data
5. **Streaming** → Requests URL via `/api/stream/link` with device token

---

## 📝 TO ACHIEVE UNIFIED FLOW

### Need to Implement:

1. **User Authentication System**
   - POST `/api/auth/register` - Create users
   - POST `/api/auth/login` - Login with JWT
   - GET `/api/auth/me` - Get current user
   - Protected routes with middleware

2. **User App Integration**
   - Replace .env credentials with user's provider
   - Load snapshot instead of direct API calls
   - Add profile selection screen
   - Use `/api/stream/link` for playback

3. **Admin Protection**
   - Require admin role for `/dashboard`
   - Check JWT token in middleware
   - Show current admin user in header

4. **TV App Flow** (Future)
   - Device registration with MAC
   - Profile selection
   - Snapshot download
   - Lazy episode loading
   - Stream URL requests

---

## 🎬 SUMMARY

**Current State:**
- ✅ User app works (standalone with .env credentials)
- ✅ Admin dashboard works (manages database)
- ❌ They don't connect to each other
- ❌ No proper authentication
- ❌ No user/profile integration

**Next Steps:**
1. Implement JWT authentication
2. Connect user app to database
3. Add profile selection to user app
4. Protect admin dashboard
5. Replace direct API calls with snapshot system

Would you like me to implement the unified authentication system to connect these two parts?
