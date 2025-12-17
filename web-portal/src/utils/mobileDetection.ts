/**
 * Mobile App Detection and Bridge Interface
 * Detects if web-portal is running inside native mobile app WebView
 * Provides communication bridge between web and native code
 */

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    __IS_REACT_NATIVE_WEBVIEW__?: boolean;
  }
}

/**
 * Check if running inside React Native WebView
 */
export const isMobileApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Check flag set in injectedJavaScriptBeforeContentLoaded (available immediately)
  // or ReactNativeWebView object (available after content loads)
  return window.__IS_REACT_NATIVE_WEBVIEW__ === true || window.ReactNativeWebView !== undefined;
};

/**
 * Check if running in browser
 */
export const isWeb = (): boolean => {
  return !isMobileApp();
};

/**
 * Send message to native mobile app
 */
export const sendToNative = (type: string, data: any = {}): void => {
  if (!isMobileApp()) {
    console.warn('[Bridge] Cannot send to native - not in mobile app context');
    return;
  }

  try {
    const message = JSON.stringify({ type, data });
    console.log('[Bridge → Native]', type, data);
    window.ReactNativeWebView?.postMessage(message);
  } catch (error) {
    console.error('[Bridge] Failed to send message:', error);
  }
};

/**
 * Listen for messages from native app
 */
export const listenToNative = (
  callback: (type: string, data: any) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  console.log('[Mobile] Setting up message listener');

  const handler = (event: MessageEvent) => {
    console.log('[Mobile] Raw message event received:', event);
    try {
      const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      console.log('[Native → Bridge]', message.type, message.data);
      if (message && message.type) {
        callback(message.type, message.data);
      }
    } catch (error) {
      // Ignore non-JSON messages
      console.log('[Mobile] Ignored non-JSON message:', event.data);
    }
  };

  window.addEventListener('message', handler);
  console.log('[Mobile] Message listener attached');
  
  // Return cleanup function
  return () => {
    console.log('[Mobile] Removing message listener');
    window.removeEventListener('message', handler);
  };
};

/**
 * Log to console (visible in native app too)
 */
export const mobileLog = (level: 'log' | 'warn' | 'error', message: string, ...args: any[]): void => {
  console[level](message, ...args);
  
  if (isMobileApp()) {
    sendToNative('LOG', {
      level,
      message: `${message} ${args.map(a => JSON.stringify(a)).join(' ')}`,
    });
  }
};

/**
 * Play video in native player
 */
export const playVideoNative = (type: 'live' | 'vod', data: any): void => {
  if (!isMobileApp()) {
    console.warn('[Bridge] Not in mobile app - cannot use native player');
    return;
  }

  const messageType = type === 'live' ? 'PLAY_LIVE_TV' : 'PLAY_VOD';
  sendToNative(messageType, data);
};

/**
 * Close native player
 */
export const closeNativePlayer = (): void => {
  if (isMobileApp()) {
    sendToNative('CLOSE_PLAYER', {});
  }
};

export default {
  isMobileApp,
  isWeb,
  sendToNative,
  listenToNative,
  mobileLog,
  playVideoNative,
  closeNativePlayer,
};
