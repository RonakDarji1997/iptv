This is a [Next.js](https://nextjs.org) IPTV Player application with authentication and Stalker Portal integration.

## Getting Started

### 1. Environment Setup

First, create a `.env.local` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env.local
```

Then generate a password hash and edit `.env.local`:

**Generate Password Hash:**
```bash
node scripts/hash-password.js your_desired_password
```

This will output a bcrypt hash. Copy it to your `.env.local`:

```env
# Set your hashed password (generated using scripts/hash-password.js)
NEXT_PUBLIC_APP_PASSWORD_HASH=$2a$10$...your_hash_here...

# Stalker Portal Configuration
NEXT_PUBLIC_STALKER_MAC=your_mac_address
NEXT_PUBLIC_STALKER_URL=http://your-portal-url/stalker_portal/
NEXT_PUBLIC_STALKER_BEARER=your_bearer_token
NEXT_PUBLIC_STALKER_ADID=your_adid
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

**Note:** This project is configured to always start the dev server on port 3001 to avoid conflicts with other services.

### 4. Login

When you first access the application, you'll be prompted to enter a password. Use the **original password** (not the hash) that you used when generating the hash with `scripts/hash-password.js`.

## Features

- 🔐 **Password-protected access** - Secure login with configurable password
- 📺 **Channels** - Live TV channels with EPG information
- 🎬 **Movies** - VOD content with search and category filtering
- 📚 **Series** - TV series with season/episode navigation
- 🔍 **Search** - Real-time search across all VOD content
- 🎯 **Hover Details** - Rich information cards on thumbnail hover
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🎨 **Modern UI** - Netflix-inspired interface

## Configuration

All sensitive configuration is stored in `.env.local`:

- `NEXT_PUBLIC_APP_PASSWORD_HASH` - Bcrypt hash of your password (generate using `scripts/hash-password.js`)
- `NEXT_PUBLIC_STALKER_MAC` - MAC address for Stalker Portal authentication
- `NEXT_PUBLIC_STALKER_URL` - Base URL of your Stalker Portal
- `NEXT_PUBLIC_STALKER_BEARER` - Bearer token for API authentication
- `NEXT_PUBLIC_STALKER_ADID` - Advertisement ID (if required)

## Security

- 🔒 **Password Encryption** - Passwords are hashed using bcrypt (never stored in plain text)
- ⚠️ **Never commit `.env.local`** to version control
- The `.env.example` file is provided as a template
- Session is stored in browser sessionStorage and cleared on logout
- Use `scripts/hash-password.js` to generate secure password hashes

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
