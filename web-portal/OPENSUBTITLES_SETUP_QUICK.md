# OpenSubtitles API Setup - 2 Minutes ⚡

## Why You Need This

The subtitle feature requires an OpenSubtitles.com API key. **It's 100% FREE** and takes 2 minutes to set up.

## Quick Setup (2 Steps)

### Step 1: Get Your FREE API Key (1 minute)

1. Go to: **https://www.opensubtitles.com/en/consumers**
2. Click "Create New App"
3. Fill in:
   - **App name:** StreamHub (or any name)
   - **Contact email:** Your email
   - **Use case:** Personal streaming project
4. Click "Create"
5. **Copy your API key** (looks like: `AbCdEf1234567890...`)

### Step 2: Add to .env.local (30 seconds)

Open `/web-portal/.env.local` and add your key:

```bash
NEXT_PUBLIC_OPENSUBTITLES_API_KEY=paste_your_key_here
```

Save the file and restart your dev server:

```bash
# Stop the server (Ctrl+C)
npm run dev
```

## That's It! 🎉

Now play any movie and you'll see subtitles load automatically!

## What You Get (FREE Tier)

✅ **40 subtitle downloads per day**
✅ **Unlimited searches**
✅ **All languages**
✅ **All quality levels**
✅ **No credit card required**

## Want More? (Optional)

If you need 200 downloads/day instead of 40:

1. Register account at: https://www.opensubtitles.com/en/users/sign_up
2. Add to `.env.local`:
```bash
NEXT_PUBLIC_OPENSUBTITLES_USERNAME=your_username
NEXT_PUBLIC_OPENSUBTITLES_PASSWORD=your_password
```

## Troubleshooting

### "No subtitles available"?

Check browser console (F12) for error messages:
- `API key not configured` → Add key to .env.local
- `401 Unauthorized` → API key is invalid
- `429 Too Many Requests` → You hit the 40/day limit

### Still not working?

1. Make sure `.env.local` has the key
2. Restart dev server (`npm run dev`)
3. Clear browser cache (Ctrl+Shift+R)
4. Check console for `[SubtitleService]` logs

---

**Time to setup:** 2 minutes  
**Cost:** $0  
**Downloads/day:** 40 (free) or 200 (with account)
