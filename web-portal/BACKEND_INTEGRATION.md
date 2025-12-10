# Web Portal Backend Integration - Complete

## Summary
Updated the web portal to match the exact authentication and API flow used by the `iptv-sync-backend` service.

## Backend Information
- **Location**: `/Users/ronika/Desktop/iptv/iptv-sync-backend`
- **Port**: 3000
- **Base URL**: `http://localhost:3000`

## Authentication Flow Changes

### Backend Auth Structure (iptv-sync-backend)
The backend uses a **unified auth endpoint** that handles both registration and login:

```typescript
POST /auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "deviceId": "optional-device-id", // For TV apps
  "deviceName": "optional-device-name"
}

Response:
{
  "success": true,
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "userId": "user-uuid",
  "deviceId": "device-id",
  "isNewUser": true/false  // true if account was just created
}
```

### Key Backend Features
1. **Single Endpoint**: `/auth/register` handles both new users and existing users
2. **Auto-Login**: If user exists, validates password and logs them in
3. **JWT Tokens**: Uses both access token (7 days) and refresh token (30 days)
4. **bcrypt**: Password hashing with salt rounds
5. **PostgreSQL**: Database with users, devices, providers, categories tables
6. **Bearer Auth**: All authenticated endpoints use `Authorization: Bearer <token>`

## Web Portal Updates

### 1. Authentication Service (`src/services/authService.ts`)
**Changes:**
- ✅ Removed `username` field (backend only uses email + password)
- ✅ Updated endpoints: `/api/auth/register` → `/auth/register`
- ✅ Both `register()` and `login()` now call `/auth/register`
- ✅ Store both `accessToken` and `refreshToken`
- ✅ Updated response interface to match backend structure

**Before:**
```typescript
register({ username, email, password })  // POST /api/auth/register
login(email, password)                    // POST /api/auth/login
```

**After:**
```typescript
register({ email, password })  // POST /auth/register
login(email, password)         // POST /auth/register (same endpoint!)
```

### 2. Provider Service (`src/services/providerService.ts`)
**Changes:**
- ✅ Updated all endpoints to use `/sync/*` routes
- ✅ Use `/sync/pull` to get all user data (providers, categories, channels)
- ✅ Use `/sync/providers` to create/update providers
- ✅ Match backend's expected data format (snake_case fields)

**Endpoint Mapping:**
```
GET  /api/providers                      → GET  /sync/pull
POST /api/providers                      → POST /sync/providers
GET  /api/providers/:id/categories       → GET  /sync/pull (filter locally)
POST /api/providers/:id/categories       → POST /sync/categories
```

### 3. Pairing Service (`src/services/pairingService.ts`) - NEW
**Created new service for device pairing:**
```typescript
POST /devices/pairing/create       // Create pairing session
GET  /devices/pairing/status/:code // Check pairing status
```

### 4. Register Page (`src/app/auth/register/page.tsx`)
**Changes:**
- ✅ Removed username input field (not needed by backend)
- ✅ Handle `isNewUser` response to show appropriate message
- ✅ Show "Account created" for new users, "Welcome back" for existing users

### 5. Device Pairing Component (`src/components/DevicePairing.tsx`)
**Changes:**
- ✅ Use `pairingService` instead of mock code generation
- ✅ Poll backend for pairing status every 3 seconds
- ✅ Show device name when paired

## Backend API Routes

### Auth Routes (`/auth/*`)
```typescript
POST /auth/register    // Register OR login user
POST /auth/refresh     // Refresh access token
```

### Sync Routes (`/sync/*`)
```typescript
GET  /sync/pull            // Get all user data (providers, categories, channels, settings)
POST /sync/providers       // Upsert provider
POST /sync/categories      // Upsert categories
POST /sync/channels        // Upsert channels
POST /sync/settings        // Sync settings
POST /sync/progress        // Sync watch progress
```

### Device Routes (`/devices/*`)
```typescript
GET  /devices/list                    // List user's devices
POST /devices/pairing/create          // Create pairing session
GET  /devices/pairing/status/:code    // Check pairing status
POST /devices/pairing/complete        // Complete pairing
```

### Stream Routes (`/stream/*`)
```typescript
POST /stream/start      // Start streaming session
POST /stream/heartbeat  // Update streaming heartbeat
```

## Environment Variables

### Web Portal (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Backend (`.env`)
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iptv_sync
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

## Database Schema (Relevant Tables)

### users
```sql
- id (UUID, primary key)
- email (VARCHAR, unique)
- password_hash (VARCHAR)
- subscription_plan_id (UUID)
- created_at, updated_at
```

### providers
```sql
- id (UUID, primary key)
- provider_id (VARCHAR) -- Client-side unique ID
- user_id (UUID, foreign key)
- name (VARCHAR)
- type (VARCHAR) -- 'STALKER', 'XTREAM', 'M3U'
- server_url, username, password, mac_address
- is_active, is_configured
- include_tv, include_vod
- created_at, updated_at
- UNIQUE (user_id, provider_id)
```

### categories
```sql
- id (UUID, primary key)
- category_id (VARCHAR) -- External category ID
- user_id (UUID, foreign key)
- provider_id (UUID, foreign key)
- name (VARCHAR)
- type (VARCHAR) -- 'CHANNEL', 'MOVIE', 'SERIES'
- content_type (VARCHAR)
- is_enabled (BOOLEAN)
- censored (INTEGER)
- sort_order (INTEGER)
- UNIQUE (user_id, provider_id, category_id)
```

### devices
```sql
- id (UUID, primary key)
- device_id (VARCHAR) -- Client device ID
- user_id (UUID, foreign key)
- device_name (VARCHAR)
- device_type (VARCHAR) -- 'TV', 'MOBILE', 'WEB'
- platform (VARCHAR)
- last_active (TIMESTAMP)
- UNIQUE (user_id, device_id)
```

## Testing the Integration

### 1. Start Backend
```bash
cd /Users/ronika/Desktop/iptv/iptv-sync-backend
npm run dev
```
Expected: Server running on http://localhost:3000

### 2. Start Web Portal
```bash
cd /Users/ronika/Desktop/iptv/web-portal
npm run dev
```
Expected: Web UI running on http://localhost:2005

### 3. Test Authentication Flow
1. Visit http://localhost:2005
2. Click "Sign In" → "Create Account"
3. Enter email and password (no username needed)
4. Backend will create account and return tokens
5. Redirect to dashboard

### 4. Test Login with Existing Account
1. Use same email/password
2. Backend will recognize existing user
3. Validate password and return tokens
4. Show "Welcome back!" message

### 5. Test Provider Management
1. Click "Add Provider" in dashboard
2. Select provider type (Stalker/Xtream/M3U)
3. Backend stores in PostgreSQL
4. View/manage categories
5. Generate QR code for TV pairing

## Next Steps

1. **Backend Must Be Running**: Ensure `iptv-sync-backend` is running on port 3000
2. **Database Migration**: Backend needs PostgreSQL with proper schema
3. **TV App Integration**: Update Android TV app to:
   - Show QR code when no provider configured
   - Scan QR code or enter pairing code
   - Poll `/devices/pairing/status/:code`
   - Pull provider data via `/sync/pull`
4. **Testing**: End-to-end testing of register → add provider → pair TV → sync flow

## Files Modified
- `/Users/ronika/Desktop/iptv/web-portal/src/services/authService.ts`
- `/Users/ronika/Desktop/iptv/web-portal/src/services/providerService.ts`
- `/Users/ronika/Desktop/iptv/web-portal/src/services/pairingService.ts` (NEW)
- `/Users/ronika/Desktop/iptv/web-portal/src/app/auth/register/page.tsx`
- `/Users/ronika/Desktop/iptv/web-portal/src/components/DevicePairing.tsx`

## API Endpoint Summary

| Web Portal Call | Backend Endpoint | Method | Auth Required |
|----------------|------------------|--------|---------------|
| `authService.register()` | `/auth/register` | POST | No |
| `authService.login()` | `/auth/register` | POST | No |
| `providerService.getProviders()` | `/sync/pull` | GET | Yes |
| `providerService.addProvider()` | `/sync/providers` | POST | Yes |
| `providerService.getCategories()` | `/sync/pull` | GET | Yes |
| `providerService.updateCategory()` | `/sync/categories` | POST | Yes |
| `pairingService.createPairingSession()` | `/devices/pairing/create` | POST | Yes |
| `pairingService.checkPairingStatus()` | `/devices/pairing/status/:code` | GET | Yes |

---

**Status**: ✅ Web portal fully integrated with iptv-sync-backend authentication and API flow
**Backend Port**: 3000
**Web Portal Port**: 2005
