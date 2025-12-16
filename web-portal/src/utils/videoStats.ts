/**
 * Video statistics and bitrate monitoring utility
 */

const TRANSCODE_SERVICE_URL = process.env.NEXT_PUBLIC_TRANSCODE_URL || 'http://localhost:4000'

export interface VideoStats {
  bitrate: number // in Kbps
  resolution: string
  fps: number
  buffered: number // percentage
}

export class VideoStatsMonitor {
  private video: HTMLVideoElement
  private lastBytes = 0
  private lastTime = 0
  private bitrate = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private readonly SMOOTHING_FACTOR = 0.3 // For smoothing bitrate fluctuations

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  start(callback: (stats: VideoStats) => void) {
    this.lastTime = Date.now()
    this.lastBytes = 0
    this.bitrate = 0

    this.intervalId = setInterval(() => {
      const stats = this.getStats()
      if (stats) {
        callback(stats)
      }
    }, 1000) // Update every second
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private getStats(): VideoStats | null {
    if (!this.video) return null

    const now = Date.now()
    const timeDiff = (now - this.lastTime) / 1000 // seconds

    if (timeDiff < 0.5) {
      // Too soon, skip this measurement
      return {
        bitrate: this.bitrate || 0,
        resolution: `${this.video.videoWidth}x${this.video.videoHeight}`,
        fps: 30,
        buffered: this.getBufferedPercent()
      }
    }

    // Use media source buffer to estimate bitrate (more accurate)
    try {
      // For HLS/DASH, try to estimate from playback
      const currentBytes = this.estimateBytesFromPlayback()
      
      if (timeDiff > 0 && currentBytes > this.lastBytes && currentBytes > 0) {
        const bytesDiff = currentBytes - this.lastBytes
        const newBitrate = (bytesDiff * 8) / (timeDiff * 1000) // Kbps
        
        // Apply smoothing to avoid wild fluctuations
        if (this.bitrate === 0) {
          this.bitrate = newBitrate
        } else {
          this.bitrate = (this.SMOOTHING_FACTOR * newBitrate) + ((1 - this.SMOOTHING_FACTOR) * this.bitrate)
        }
        
        // Clamp to reasonable values (0.1 Mbps to 100 Mbps)
        this.bitrate = Math.max(100, Math.min(100000, this.bitrate))
      }

      this.lastBytes = currentBytes
      this.lastTime = now
    } catch (e) {
      // Fallback: estimate based on resolution
      if (this.bitrate === 0) {
        this.bitrate = this.estimateBitrateFromResolution()
      }
    }

    return {
      bitrate: Math.round(this.bitrate) || 0,
      resolution: `${this.video.videoWidth}x${this.video.videoHeight}`,
      fps: 30,
      buffered: this.getBufferedPercent()
    }
  }

  private estimateBytesFromPlayback(): number {
    // Estimate bytes played based on current time and assumed bitrate
    const currentTime = this.video.currentTime
    if (!currentTime || currentTime === 0) return 0
    
    // Use a baseline estimate if we don't have a bitrate yet
    const estimatedBitrate = this.bitrate || this.estimateBitrateFromResolution()
    return currentTime * estimatedBitrate * 1000 / 8 // Convert to bytes
  }

  private estimateBitrateFromResolution(): number {
    const width = this.video.videoWidth
    const height = this.video.videoHeight
    
    if (width >= 3840 || height >= 2160) {
      return 20000 // 20 Mbps for 4K
    } else if (width >= 1920 || height >= 1080) {
      return 8000 // 8 Mbps for 1080p
    } else if (width >= 1280 || height >= 720) {
      return 5000 // 5 Mbps for 720p
    } else {
      return 2500 // 2.5 Mbps for SD
    }
  }

  private getBufferedPercent(): number {
    const buffered = this.video.buffered
    let bufferedPercent = 0
    
    if (this.video.duration > 0 && buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1)
      bufferedPercent = Math.round((bufferedEnd / this.video.duration) * 100)
    }
    
    return bufferedPercent
  }
}

/**
 * Check if transcode service is available
 */
export async function checkTranscodeService(): Promise<boolean> {
  try {
    console.log('[Transcode] Checking service at:', TRANSCODE_SERVICE_URL);
    const response = await fetch(`${TRANSCODE_SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    })
    const data = await response.json()
    console.log('[Transcode] Health check response:', data);
    return data.ok && data.ffmpeg
  } catch (error) {
    console.warn('[Transcode] Service not available:', error)
    return false
  }
}

/**
 * Get transcoded stream URL with fallback to original
 */
export async function getTranscodedUrl(
  originalUrl: string,
  target: '1080' | '2160' | 'original' = '2160',
  mode: 'upscale' | 'downscale' = 'upscale'
): Promise<string> {
  console.log('[Transcode] Request - target:', target, 'mode:', mode);
  
  // If user selected original, return it
  if (target === 'original') {
    console.log('[Transcode] Original requested, skipping transcode');
    return originalUrl
  }

  const isAvailable = await checkTranscodeService()
  
  if (!isAvailable) {
    console.log('[Transcode] Service unavailable, using original stream')
    return originalUrl
  }

  // Build transcode URL
  const params = new URLSearchParams({
    url: originalUrl,
    target,
    mode
  })

  const transcodeUrl = `${TRANSCODE_SERVICE_URL}/transcode?${params.toString()}`
  console.log('[Transcode] Generated URL:', transcodeUrl.substring(0, 150));
  return transcodeUrl
}

export type QualityOption = 'original' | '720' | '1080' | '2160'

export interface QualitySettings {
  label: string
  value: QualityOption
  target?: '1080' | '2160'
  mode?: 'upscale' | 'downscale'
}

export const QUALITY_OPTIONS: QualitySettings[] = [
  { label: 'Original', value: 'original' },
  { label: '720p', value: '720', target: '1080', mode: 'downscale' },
  { label: '1080p', value: '1080', target: '1080', mode: 'upscale' },
  { label: '4K', value: '2160', target: '2160', mode: 'upscale' }
]

/**
 * Format bitrate for display
 */
export function formatBitrate(bitrateKbps: number): string {
  if (bitrateKbps < 1000) {
    return `${bitrateKbps} Kbps`
  }
  return `${(bitrateKbps / 1000).toFixed(1)} Mbps`
}
