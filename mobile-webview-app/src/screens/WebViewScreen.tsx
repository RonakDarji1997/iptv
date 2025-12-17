/**
 * WebView Screen - Main container for web-portal
 * Handles message passing and player state management
 */

import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, BackHandler, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import NativeLiveTVPlayer from '../components/NativeLiveTVPlayer';
import NativeVODPlayer from '../components/NativeVODPlayer';
import type { WebToNativeMessage, NativeToWebMessage, LiveTVData, VODData } from '../types/bridge';

// WEB PORTAL URL - Change this based on environment
const WEB_PORTAL_URL = __DEV__ 
  ? 'http://localhost:3001' // Development: Local Next.js server
  : 'file:///android_asset/web/index.html'; // Production: Bundled static build

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [playerType, setPlayerType] = useState<'live' | 'vod' | null>(null);
  const [liveTVData, setLiveTVData] = useState<LiveTVData | null>(null);
  const [vodData, setVODData] = useState<VODData | null>(null);

  // Send message TO WebView
  const sendToWebView = useCallback((message: NativeToWebMessage) => {
    console.log('[Bridge → WebView]', message.type, message.data);
    webViewRef.current?.postMessage(JSON.stringify(message));
  }, []);

  // Handle messages FROM WebView
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message: WebToNativeMessage = JSON.parse(event.nativeEvent.data);
      console.log('[WebView → Bridge]', message.type, message.data);

      switch (message.type) {
        case 'PLAY_LIVE_TV':
          console.log('[Player] Opening Live TV:', message.data.title);
          setPlayerType('live');
          setLiveTVData(message.data as LiveTVData);
          break;

        case 'PLAY_VOD':
          console.log('[Player] Opening VOD:', message.data.title);
          setPlayerType('vod');
          setVODData(message.data as VODData);
          break;

        case 'CLOSE_PLAYER':
          handlePlayerClose();
          break;

        case 'LOG':
          console.log(`[WebView Log - ${message.data.level}]`, message.data.message);
          break;

        default:
          console.warn('[Bridge] Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('[Bridge] Message parse error:', error);
    }
  }, []);

  // Handle player close
  const handlePlayerClose = useCallback(() => {
    console.log('[Player] Closing');
    setPlayerType(null);
    setLiveTVData(null);
    setVODData(null);
    sendToWebView({ type: 'VIDEO_CLOSED', data: {} });
  }, [sendToWebView]);

  // Handle video progress updates
  const handleProgress = useCallback((contentId: string, currentTime: number, duration: number, buffered?: number) => {
    // Send progress to WebView every 5 seconds to update backend
    if (Math.floor(currentTime) % 5 === 0) {
      sendToWebView({
        type: 'VIDEO_PROGRESS',
        data: { contentId, currentTime, duration, buffered },
      });
    }
  }, [sendToWebView]);

  // Handle video ended
  const handleEnded = useCallback((contentId: string, duration: number) => {
    console.log('[Player] Video ended:', contentId);
    sendToWebView({
      type: 'VIDEO_ENDED',
      data: { contentId, duration },
    });
    // Auto-close player after 2 seconds
    setTimeout(handlePlayerClose, 2000);
  }, [sendToWebView, handlePlayerClose]);

  // Handle video errors
  const handleError = useCallback((error: string, code?: number) => {
    console.error('[Player] Error:', error, code);
    sendToWebView({
      type: 'VIDEO_ERROR',
      data: { error, code },
    });
    Alert.alert('Playback Error', error, [
      { text: 'Close', onPress: handlePlayerClose },
    ]);
  }, [sendToWebView, handlePlayerClose]);

  // Handle hardware back button
  React.useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playerType) {
        handlePlayerClose();
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior
    });

    return () => backHandler.remove();
  }, [playerType, handlePlayerClose]);

  // Render native players when active
  if (playerType === 'live' && liveTVData) {
    return (
      <NativeLiveTVPlayer
        data={liveTVData}
        onClose={handlePlayerClose}
        onProgress={handleProgress}
        onError={handleError}
      />
    );
  }

  if (playerType === 'vod' && vodData) {
    return (
      <NativeVODPlayer
        data={vodData}
        onClose={handlePlayerClose}
        onProgress={handleProgress}
        onEnded={handleEnded}
        onError={handleError}
        onSubtitleChanged={(subtitle) => {
          sendToWebView({ type: 'SUBTITLE_CHANGED', data: { subtitle } });
        }}
        onQualityChanged={(quality) => {
          sendToWebView({ type: 'QUALITY_CHANGED', data: { quality } });
        }}
      />
    );
  }

  // Default: Show WebView with web-portal
  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_PORTAL_URL }}
        onMessage={handleMessage}
        // Video configuration
        allowsInlineMediaPlayback={false} // Force native playback
        mediaPlaybackRequiresUserAction={false}
        // JavaScript & Storage
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        cacheEnabled={true}
        // UI
        startInLoadingState={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // Performance
        androidLayerType="hardware"
        // Debugging
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[WebView] Error:', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[WebView] HTTP Error:', nativeEvent.statusCode, nativeEvent.url);
        }}
        onContentProcessDidTerminate={() => {
          console.warn('[WebView] Content process terminated, reloading...');
          webViewRef.current?.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
