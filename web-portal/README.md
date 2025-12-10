# IPTV Web Portal

Central provider management portal for IPTV streaming service. Allows users to manage their IPTV providers (Stalker, Xtream, M3U) from a web interface and pair with TV devices via QR code.

## Features

- ✨ **Beautiful Landing Page** - Modern, responsive design with APK download
- 🔐 **User Authentication** - Secure registration and login system
- 📺 **Provider Management** - Support for Stalker Portal, Xtream Codes, and M3U playlists
- 📋 **Category Management** - Select which Live TV, Movie, and Series categories to display
- 📱 **QR Code Pairing** - Instantly pair TV devices by scanning QR code
- 🔄 **Real-time Sync** - Changes sync immediately to all paired devices
- 🎨 **Responsive Design** - Works perfectly on desktop, tablet, and mobile

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Axios** - HTTP client
- **JWT** - Authentication tokens
- **QR Code** - Device pairing
- **React Hot Toast** - Notifications

## Setup

### 1. Install Dependencies

```bash
cd web-portal
npm install
```

### 2. Configure Environment

Copy `.env.local` and update values:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=IPTV Central
NEXT_PUBLIC_APK_DOWNLOAD_URL=/downloads/iptv-app.apk
```

### 3. Run Development Server

```bash
npm run dev
```

The portal will be available at `http://localhost:3001`

## Usage

### User Flow

1. **Landing Page** - User visits homepage
2. **Register/Login** - Create account or sign in
3. **Add Provider** - Connect Stalker, Xtream, or M3U provider
4. **Manage Categories** - Select which categories to show on TV
5. **Pair TV Device** - Scan QR code on TV app to pair

### Provider Setup

#### Stalker Portal
- Portal URL: `http://example.com/stalker_portal/`
- MAC Address: `00:1A:79:XX:XX:XX`
- ADID: (optional) Device identifier

#### Xtream Codes
- Server URL: `http://example.com:8080`
- Username: Your username
- Password: Your password

#### M3U Playlist
- Playlist URL: Direct M3U file URL

## API Integration

The portal connects to your existing Next.js backend API:

### Required Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/providers` - List user's providers
- `POST /api/providers` - Add new provider
- `DELETE /api/providers/:id` - Remove provider
- `GET /api/providers/:id/categories` - Get provider categories
- `PATCH /api/providers/:id/categories/:categoryId` - Update category
- `POST /api/providers/:id/sync` - Trigger provider sync
- `POST /api/pairing/create` - Create pairing session
- `GET /api/pairing/status/:code` - Check pairing status

## Device Pairing Flow

1. **Web Portal**: Generate unique pairing code
2. **TV App**: Display QR scanner or code input
3. **Scan/Enter**: TV scans QR or user enters code manually
4. **Backend**: Validates code and links device to user account
5. **Sync**: TV receives provider and category configuration
6. **Complete**: TV starts streaming with user's settings

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Environment Variables for Production

```bash
NEXT_PUBLIC_API_URL=https://your-api-domain.com
NEXT_PUBLIC_WS_URL=wss://your-api-domain.com
NEXT_PUBLIC_APK_DOWNLOAD_URL=https://your-cdn.com/iptv-app.apk
```

## Architecture

```
web-portal/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Landing page
│   │   ├── layout.tsx         # Root layout
│   │   ├── globals.css        # Global styles
│   │   ├── auth/              # Authentication pages
│   │   │   ├── login/
│   │   │   └── register/
│   │   └── dashboard/         # Main dashboard
│   ├── components/            # React components
│   │   ├── AddProviderModal.tsx
│   │   ├── CategoryManager.tsx
│   │   └── DevicePairing.tsx
│   └── services/              # API services
│       ├── authService.ts
│       └── providerService.ts
├── public/                    # Static assets
├── package.json
└── next.config.js
```

## Development

### Adding New Provider Types

1. Update `ProviderType` in `providerService.ts`
2. Add form fields in `AddProviderModal.tsx`
3. Implement backend handshake logic
4. Add category syncing logic

### Customizing Design

Edit Tailwind configuration in `tailwind.config.js` to change colors, fonts, etc.

## License

MIT
