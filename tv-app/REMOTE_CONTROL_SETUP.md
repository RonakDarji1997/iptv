# Android TV Remote Control Setup

## Issue: Remote Control Not Working

The extended controls remote might not be properly configured. Here are solutions:

### Option 1: Use Hardware Keyboard for D-pad (Recommended)
Instead of using the extended controls remote, use your keyboard:
- **Arrow Keys** → D-pad navigation (↑ ↓ ← →)
- **Enter/Return** → OK/Select button
- **Escape** → Back button
- **Tab** → Navigate between focusable elements

### Option 2: Enable Hardware Keyboard Events in Emulator
1. With the emulator open, press `Cmd + K` (or go to Settings)
2. Make sure "Send keyboard input to device" is enabled

### Option 3: Use ADB to Send Remote Events
You can manually test remote buttons via ADB:

```bash
# D-pad navigation
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_DPAD_UP
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_DPAD_DOWN
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_DPAD_LEFT
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_DPAD_RIGHT

# OK/Select button
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_DPAD_CENTER

# Back button
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_BACK

# Play/Pause
~/Library/Android/sdk/platform-tools/adb shell input keyevent KEYCODE_MEDIA_PLAY_PAUSE
```

### Option 4: Fix Extended Controls Remote
1. Close the extended controls panel
2. Re-open it (click the three dots on emulator)
3. Click on the D-pad center button to ensure it's activated
4. Try navigating with the D-pad arrows

### Testing Focus
Run this command to monitor focus events while testing:
```bash
~/Library/Android/sdk/platform-tools/adb logcat | grep -E "MainScreen|focused|pressed"
```

Then try pressing arrow keys or using ADB commands above.

## Expected Behavior
- Arrow keys should navigate between menu items
- TV tab should have red border when focused
- Enter/OK should activate the focused item
- Grid items should scale up when focused
