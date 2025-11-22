# Testing Focus Behavior

## Current State

The native Android TV app is **running on your emulator** with working focus tracking.

## How to Test

### 1. Focus Navigation (UP/DOWN)

Press the **UP** or **DOWN** buttons on your emulator remote:

- The tab should highlight with a **white background** and **black text**
- The debug display will update to show: `Hover: [Tab Name]`
- This proves `setOnFocusChangeListener` is working!

### 2. Selection (CENTER/SELECT)

Press the **CENTER** button (select/OK):

- The tab should change to a **grey background** with a **blue border**
- The debug display will update to show: `Selected: [Tab Name]`
- This is the active/selected state

### 3. Navigate Between Tabs

- Press **DOWN** → Focus moves to "Movies" (white background)
- Press **DOWN** → Focus moves to "Shows" (white background)
- Press **UP** → Focus moves back to "Movies"
- Press **UP** → Focus moves back to "TV"

### 4. Select + Navigate

- Press **CENTER** on "TV" → Grey + blue border (selected)
- Press **DOWN** → "Movies" gets white background (focused), "TV" keeps grey + blue (still selected)
- Press **CENTER** on "Movies" → Now "Movies" is grey + blue, "TV" returns to normal

## Visual State Summary

| User Action | Visual Result | Debug Display |
|-------------|---------------|---------------|
| Press UP/DOWN | **White bg + black text** | `Hover: [Tab]` |
| Press CENTER | **Grey bg + blue border** | `Selected: [Tab]` |
| Navigate away from selected | Selected keeps grey + blue | Both Hover and Selected shown |

## Why This Is Different from React Native

In the React Native TV app:
- ❌ UP/DOWN didn't trigger `onFocus` callbacks
- ❌ Couldn't track which item was focused
- ❌ No way to show white background on hover

In the native Android app:
- ✅ `setOnFocusChangeListener` fires on every focus change
- ✅ We know exactly which tab is focused vs selected
- ✅ Visual feedback works perfectly

## Checking Logs

If you want to see what's happening under the hood:

```bash
# View all app logs
adb logcat | grep IPTV

# You'll see:
# - "🎮 Button pressed: [KEY_NAME]" for every button
# - "Tab [NAME] selected" when you press CENTER
# - Focus change events
```

## Current Limitations

This is just the navigation sidebar. Next we need to implement:
- Content area (right side of the screen)
- Categories row (Action, Drama, Comedy, etc.)
- Content grid with channel/movie cards
- Video player

But the **hardest part - focus tracking - is now solved!** 🎉

## Quick Commands

```bash
# Restart the app
adb shell am force-stop com.ronika.iptvnative
adb shell am start -n com.ronika.iptvnative/.MainActivity

# Rebuild and reinstall
cd /Users/ronika/Desktop/iptv/android-tv-native
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.ronika.iptvnative/.MainActivity
```

## Test Checklist

- [ ] Press UP/DOWN - tabs show white background
- [ ] Press CENTER - tab shows grey + blue border
- [ ] Debug display updates correctly
- [ ] Can navigate between all three tabs
- [ ] Previously selected tab keeps grey + blue when navigating away
- [ ] Focus (white) and selection (grey + blue) are clearly different

**If all these work, we've successfully solved the focus tracking problem!** ✅
