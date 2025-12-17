'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { isMobileApp, listenToNative, playVideoNative, sendToNative } from '@/utils/mobileDetection'
import { contentService } from '@/services/contentService'

/**
 * Global navigation provider for mobile app
 * Pushes Next.js route changes to browser history so WebView can track navigation
 * Also handles channel navigation for Live TV
 */
export default function MobileNavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const lastUrlRef = useRef<string>('')
  const isFirstRender = useRef(true)
  const channelListRef = useRef<any[]>([])
  const currentChannelCmdRef = useRef<string>('')

  // Log immediately to see if component renders
  if (typeof window !== 'undefined') {
    console.log('[Mobile Nav] Component rendering, window exists')
    console.log('[Mobile Nav] __IS_REACT_NATIVE_WEBVIEW__:', window.__IS_REACT_NATIVE_WEBVIEW__)
    console.log('[Mobile Nav] ReactNativeWebView:', typeof window.ReactNativeWebView)
    console.log('[Mobile Nav] isMobileApp():', isMobileApp())
  } else {
    console.log('[Mobile Nav] Component rendering, NO window (SSR)')
  }

  // Define channel change handler
  const handleChannelChange = async (direction: 'next' | 'prev') => {
    try {
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Channel change: ${direction}` })
      
      let channels = channelListRef.current
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Channel list length: ${channels.length}` })
      
      // Reload if empty
      if (channels.length === 0) {
        sendToNative('LOG', { level: 'log', message: '[Mobile Nav] Reloading channel list...' })
        channels = await contentService.getAllChannels()
        channelListRef.current = channels
        sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Loaded ${channels.length} channels` })
      }
      
      if (channels.length === 0) {
        sendToNative('LOG', { level: 'error', message: '[Mobile Nav] No channels available' })
        return
      }
      
      const currentCmd = currentChannelCmdRef.current
      const currentIndex = channels.findIndex((ch: any) => ch.cmd === currentCmd)
      
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Current cmd: ${currentCmd}, index: ${currentIndex}` })
      
      if (currentIndex === -1) {
        sendToNative('LOG', { level: 'error', message: '[Mobile Nav] Current channel not found in list' })
        return
      }
      
      // Calculate next/prev with wrapping
      let newIndex
      if (direction === 'next') {
        newIndex = (currentIndex + 1) % channels.length
      } else {
        newIndex = currentIndex - 1 < 0 ? channels.length - 1 : currentIndex - 1
      }
      
      const nextChannel = channels[newIndex]
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Switching to: ${nextChannel.name}, index: ${newIndex}` })
      
      // Update current cmd
      currentChannelCmdRef.current = nextChannel.cmd
      
      // Send new channel to native player
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Calling playVideoNative with cmd: ${nextChannel.cmd}` })
      playVideoNative('live', {
        url: '', // Will be fetched
        title: nextChannel.name || 'Channel',
        channelNum: nextChannel.number,
        cmd: nextChannel.cmd,
      })
      
      // Update URL
      const params = new URLSearchParams({
        cmd: nextChannel.cmd,
        name: encodeURIComponent(nextChannel.name || 'Channel'),
      })
      
      if (nextChannel.number) {
        params.append('num', nextChannel.number)
      }
      
      sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Updating URL to: /player/live?${params.toString()}` })
      router.replace(`/player/live?${params.toString()}`)
    } catch (error) {
      sendToNative('LOG', { level: 'error', message: `[Mobile Nav] Error: ${error}` })
    }
  }

  useEffect(() => {
    console.log('[Mobile Nav] useEffect triggered, pathname:', pathname)
    console.log('[Mobile Nav] window.__IS_REACT_NATIVE_WEBVIEW__:', typeof window !== 'undefined' ? window.__IS_REACT_NATIVE_WEBVIEW__ : 'undefined')
    console.log('[Mobile Nav] window.ReactNativeWebView:', typeof window !== 'undefined' ? typeof window.ReactNativeWebView : 'undefined')
    
    const isMobile = isMobileApp()
    console.log('[Mobile Nav] Provider mounted, isMobileApp:', isMobile)
    
    if (!isMobile) {
      console.log('[Mobile Nav] Not a mobile app, exiting')
      return
    }

    // Build current URL (pathname only, no search params to avoid Suspense issues)
    const url = pathname
    
    // Only push if URL actually changed
    if (url === lastUrlRef.current) {
      console.log('[Mobile Nav] URL unchanged, skipping:', url)
      return
    }
    
    console.log('[Mobile Nav] Route changed from', lastUrlRef.current, 'to', url)
    lastUrlRef.current = url
    
    // Use replaceState for first render, pushState for subsequent navigations
    if (isFirstRender.current) {
      console.log('[Mobile Nav] First render - using replaceState')
      window.history.replaceState({ url, timestamp: Date.now() }, '', url)
      isFirstRender.current = false
    } else {
      console.log('[Mobile Nav] Subsequent navigation - using pushState')
      window.history.pushState({ url, timestamp: Date.now() }, '', url)
    }
    
    console.log('[Mobile Nav] History length:', window.history.length)
  }, [pathname])

  // Listen for channel navigation messages from mobile app
  useEffect(() => {
    if (!isMobileApp()) {
      console.log('[Mobile Nav] Skipping channel nav setup - not mobile app')
      return
    }

    console.log('[Mobile Nav] Setting up channel navigation listener')

    // Load channel list on mount
    const loadChannels = async () => {
      try {
        const channels = await contentService.getAllChannels()
        channelListRef.current = channels
        console.log('[Mobile Nav] Loaded', channels.length, 'channels')
      } catch (error) {
        console.error('[Mobile Nav] Failed to load channels:', error)
      }
    }

    loadChannels()

    console.log('[Mobile Nav] About to call listenToNative...')
    const cleanup = listenToNative((type, data) => {
      console.log('[Mobile Nav] ===== CALLBACK TRIGGERED =====')
      console.log('[Mobile Nav] Message type:', type)
      console.log('[Mobile Nav] Message data:', data)
      
      // Log to native app
      sendToNative('LOG', { 
        level: 'log', 
        message: `[Mobile Nav Web] Received message: ${type}` 
      })
      
      if (type === 'NEXT_CHANNEL' || type === 'PREV_CHANNEL') {
        console.log('[Mobile Nav] Received channel navigation message:', type)
        sendToNative('LOG', { 
          level: 'log', 
          message: `[Mobile Nav Web] Processing ${type}` 
        })
        handleChannelChange(type === 'NEXT_CHANNEL' ? 'next' : 'prev')
      } else {
        console.log('[Mobile Nav] Ignoring message type:', type)
      }
    })
    console.log('[Mobile Nav] listenToNative cleanup function:', typeof cleanup)

    return () => {
      console.log('[Mobile Nav] Cleaning up channel navigation listener')
      cleanup()
    }
  }, [handleChannelChange])

  // Track current channel when on live player page
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Extract cmd from URL when on live player page
    if (pathname === '/player/live') {
      const params = new URLSearchParams(window.location.search)
      const cmd = params.get('cmd')
      if (cmd) {
        const decodedCmd = decodeURIComponent(cmd)
        currentChannelCmdRef.current = decodedCmd
        sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Current channel cmd set to: ${decodedCmd}` })
      } else {
        sendToNative('LOG', { level: 'warn', message: '[Mobile Nav] No cmd in URL!' })
      }
    }
  }, [pathname])

  // Also listen for LIVE_TV_OPENED messages to track cmd immediately
  useEffect(() => {
    if (!isMobileApp()) return

    const cleanup = listenToNative((type, data) => {
      if (type === 'LIVE_TV_OPENED') {
        if (data.cmd) {
          currentChannelCmdRef.current = data.cmd
          sendToNative('LOG', { level: 'log', message: `[Mobile Nav] Channel cmd from LIVE_TV_OPENED: ${data.cmd}` })
        }
      } else if (type === 'NAVIGATE_BACK') {
        // Navigate to specified path (e.g., /browse/live)
        if (data.to) {
          console.log('[Mobile Nav] Navigating to:', data.to)
          router.push(data.to)
        }
      }
    })

    return cleanup
  }, [])

  return <>{children}</>
}
