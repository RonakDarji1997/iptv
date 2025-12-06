/**
 * Subtitle Service
 * 
 * Handles real-time subtitle generation via SSE (Server-Sent Events)
 */

import { API_CONFIG } from '../constants';

export interface Subtitle {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface SubtitleProgress {
  percent: number;
  processedSeconds: number;
  totalDuration: number;
  estimatedTime: number;
  message: string;
}

export interface SubtitleCapability {
  available: boolean;
  model: string;
  averageSpeed: number;
  maxConcurrent: number;
  currentLoad: number;
  estimatedWaitTime: number;
  supportedLanguages: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SubtitleEventCallback = (event: any) => void;

class SubtitleService {
  private baseUrl: string;
  private eventSource: any = null;
  private listeners: Map<string, SubtitleEventCallback[]> = new Map();

  constructor(baseUrl: string = API_CONFIG.SUBTITLE_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if subtitle generation is available
   */
  async checkCapability(): Promise<SubtitleCapability> {
    console.log('🔍 [SubtitleService] Checking capability at:', this.baseUrl);
    try {
      const response = await fetch(`${this.baseUrl}/api/subtitles/capability`);
      console.log('📡 [SubtitleService] Capability response status:', response.status);
      const data = await response.json();
      console.log('✅ [SubtitleService] Capability data:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      console.log('\u274c [SubtitleService] Capability check failed:', error);
      console.log('Error type:', (error as Error)?.constructor?.name);
      console.log('Error message:', (error as Error)?.message);
      return {
        available: false,
        model: 'unknown',
        averageSpeed: 0,
        maxConcurrent: 0,
        currentLoad: 0,
        estimatedWaitTime: 0,
        supportedLanguages: []
      };
    }
  }

  /**
   * Start subtitle generation with SSE streaming
   */
  async startGeneration(
    streamUrl: string,
    videoId: string,
    options: {
      language?: string;
      model?: string;
      startPosition?: number;
    } = {}
  ): Promise<void> {
    const { language = 'auto', model = 'tiny', startPosition = 0 } = options;

    console.log('🎬 [SubtitleService] Starting generation with params:');
    console.log('  - videoId:', videoId);
    console.log('  - streamUrl:', streamUrl.substring(0, 100) + '...');
    console.log('  - language:', language);
    console.log('  - model:', model);
    console.log('  - startPosition:', startPosition + 's');

    // Use react-native-sse for SSE support
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RNEventSource = require('react-native-sse');
      console.log('✅ [SubtitleService] RNEventSource module loaded:', typeof RNEventSource);
      console.log('✅ [SubtitleService] RNEventSource.default:', typeof RNEventSource.default);
      console.log('✅ [SubtitleService] RNEventSource keys:', Object.keys(RNEventSource));

      // Handle both default and named exports
      const EventSource = RNEventSource.default || RNEventSource;
      console.log('✅ [SubtitleService] EventSource constructor:', typeof EventSource);

      const url = `${this.baseUrl}/api/subtitles/generate-stream?` +
                  `streamUrl=${encodeURIComponent(streamUrl)}` +
                  `&videoId=${encodeURIComponent(videoId)}` +
                  `&language=${language}` +
                  `&model=${model}` +
                  `&startPosition=${startPosition}`;

      console.log('🌐 [SubtitleService] SSE URL:', url.substring(0, 150) + '...');

      this.eventSource = new EventSource(url);
      console.log('✅ [SubtitleService] EventSource created successfully');
    } catch (error) {
      console.error('❌ [SubtitleService] Failed to create EventSource:', error);
      console.error('Error type:', (error as Error)?.constructor?.name);
      console.error('Error message:', (error as Error)?.message);
      console.error('Error stack:', (error as Error)?.stack);
      throw error;
    }

    this.eventSource.addEventListener('open', () => {
      console.log('✅ [SubtitleService] SSE connection opened');
      console.log('  - videoId:', videoId);
      this.emit('connected', { videoId });
    });

    this.eventSource.addEventListener('message', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            this.emit('connected', data);
            break;
          case 'progress':
            this.emit('progress', data as SubtitleProgress);
            break;
          case 'subtitle':
            this.emit('subtitle', data as Subtitle);
            break;
          case 'complete':
            console.log('✅ [Subtitles] Generation complete!');
            this.emit('complete', data);
            this.close();
            break;
          case 'error':
            console.error('❌ [Subtitles] Error:', data.message);
            this.emit('error', data);
            this.close();
            break;
        }
      } catch (error) {
        console.error('❌ [Subtitles] Failed to parse message:', error);
      }
    });

    this.eventSource.addEventListener('error', (error: any) => {
      console.error('❌ [SubtitleService] SSE connection error:', error);
      console.error('Error type:', error?.constructor?.name);
      console.error('Error details:', JSON.stringify(error, null, 2));
      this.emit('error', { message: 'Connection lost', canRetry: true });
      this.close();
    });
  }

  /**
   * Cancel ongoing subtitle generation
   */
  async cancelGeneration(videoId: string): Promise<boolean> {
    console.log('🛑 [SubtitleService] Cancelling generation:');
    console.log('  - videoId:', videoId);
    console.log('  - url:', `${this.baseUrl}/api/subtitles/generate/${videoId}`);
    try {
      const response = await fetch(
        `${this.baseUrl}/api/subtitles/generate/${videoId}`,
        { method: 'DELETE' }
      );
      console.log('📡 [SubtitleService] Cancel response status:', response.status);
      const data = await response.json();
      console.log('✅ [SubtitleService] Cancel response:', JSON.stringify(data));
      this.close();
      return data.success;
    } catch (error) {
      console.error('❌ [SubtitleService] Cancel failed:', error);
      return false;
    }
  }

  /**
   * Get VTT subtitle file URL
   */
  getVTTUrl(videoId: string): string {
    return `${this.baseUrl}/api/subtitles/download/${videoId}.vtt`;
  }

  /**
   * Close SSE connection
   */
  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }

  /**
   * Event listener management
   */
  on(event: string, callback: SubtitleEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: SubtitleEventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

// Singleton instance
export const subtitleService = new SubtitleService();

export default SubtitleService;
