/**
 * useSubtitles Hook
 * 
 * React hook for managing subtitle generation and synchronization
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  subtitleService,
  type Subtitle,
  type SubtitleProgress,
  type SubtitleCapability
} from '../services/SubtitleService';

interface UseSubtitlesOptions {
  streamUrl: string;
  videoId: string;
  autoStart?: boolean;
  language?: string;
  model?: 'tiny' | 'base' | 'small' | 'medium';
}

interface UseSubtitlesReturn {
  // State
  subtitles: Subtitle[];
  currentSubtitle: Subtitle | null;
  loading: boolean;
  progress: SubtitleProgress | null;
  error: string | null;
  capability: SubtitleCapability | null;
  isGenerating: boolean;
  
  // Actions
  startGeneration: (startPosition?: number) => Promise<void>;
  cancelGeneration: () => Promise<void>;
  getCurrentSubtitle: (currentTime: number) => Subtitle | null;
  checkCapability: () => Promise<void>;
}

export function useSubtitles({
  streamUrl,
  videoId,
  autoStart = false,
  language = 'auto',
  model = 'tiny'
}: UseSubtitlesOptions): UseSubtitlesReturn {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<Subtitle | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SubtitleProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capability, setCapability] = useState<SubtitleCapability | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const subtitlesRef = useRef<Subtitle[]>([]);

  // Check server capability on mount
  const checkCapability = useCallback(async () => {
    try {
      const cap = await subtitleService.checkCapability();
      setCapability(cap);
      
      if (!cap.available) {
        setError('Subtitle service is not available');
      }
    } catch (err) {
      console.log('Failed to check capability:', err);
      setError('Failed to connect to subtitle service');
    }
  }, []);

  // Start subtitle generation
  const startGeneration = useCallback(async (startPosition: number = 0) => {
    console.log('🚀 [useSubtitles] startGeneration called');
    console.log('  - streamUrl:', streamUrl?.substring(0, 100) + '...');
    console.log('  - videoId:', videoId);
    console.log('  - language:', language);
    console.log('  - model:', model);
    console.log('  - startPosition:', startPosition + 's');
    
    if (!streamUrl || !videoId) {
      console.error('❌ [useSubtitles] Missing required params:', { streamUrl: !!streamUrl, videoId: !!videoId });
      setError('Missing stream URL or video ID');
      return;
    }

    try {
      console.log('📝 [useSubtitles] Setting initial state...');
      setLoading(true);
      setError(null);
      setSubtitles([]);
      setProgress(null);
      setIsGenerating(true);
      subtitlesRef.current = [];
      console.log('✅ [useSubtitles] Initial state set');

      // Setup event listeners
      const handleConnected = () => {
        console.log('🎬 [useSubtitles] handleConnected triggered');
        setLoading(false);
      };

      const handleProgress = (prog: SubtitleProgress) => {
        console.log('📊 [useSubtitles] Progress update:');
        console.log('  - percent:', prog.percent.toFixed(1) + '%');
        console.log('  - processed:', prog.processedSeconds + 's');
        console.log('  - total:', prog.totalDuration + 's');
        console.log('  - estimated time:', prog.estimatedTime + 's');
        console.log('  - message:', prog.message);
        setProgress(prog);
      };

      const handleSubtitle = (subtitle: Subtitle) => {
        console.log('📝 [useSubtitles] New subtitle received:');
        console.log('  - index:', subtitle.index);
        console.log('  - startTime:', subtitle.startTime + 's');
        console.log('  - endTime:', subtitle.endTime + 's');
        console.log('  - text:', subtitle.text);
        console.log('  - current subtitle count:', subtitlesRef.current.length);
        
        subtitlesRef.current.push(subtitle);
        setSubtitles([...subtitlesRef.current]);
        console.log('✅ [useSubtitles] Subtitle added, new count:', subtitlesRef.current.length);
      };

      const handleComplete = () => {
        console.log('✅ [useSubtitles] Generation complete!');
        console.log('  - total subtitles:', subtitlesRef.current.length);
        setIsGenerating(false);
        setProgress(null);
      };

      const handleError = (err: { message: string }) => {
        console.error('❌ [useSubtitles] Error event:', err.message);
        setError(err.message);
        setIsGenerating(false);
        setLoading(false);
      };

      // Attach listeners
      console.log('🔌 [useSubtitles] Attaching event listeners...');
      subtitleService.on('connected', handleConnected);
      subtitleService.on('progress', handleProgress);
      subtitleService.on('subtitle', handleSubtitle);
      subtitleService.on('complete', handleComplete);
      subtitleService.on('error', handleError);
      console.log('✅ [useSubtitles] Event listeners attached');

      // Start generation
      console.log('🎬 [useSubtitles] Calling subtitleService.startGeneration...');
      await subtitleService.startGeneration(streamUrl, videoId, { language, model, startPosition });
      console.log('✅ [useSubtitles] startGeneration call completed');

    } catch (err) {
      console.error('\u274c [useSubtitles] Failed to start subtitle generation:', err);
      console.error('Error type:', (err as Error)?.constructor?.name);
      console.error('Error message:', (err as Error)?.message);
      console.error('Error stack:', (err as Error)?.stack);
      setError('Failed to start subtitle generation');
      setLoading(false);
      setIsGenerating(false);
    }
  }, [streamUrl, videoId, language, model]);

  // Cancel subtitle generation
  const cancelGeneration = useCallback(async () => {
    console.log('🛑 [useSubtitles] Cancelling generation for:', videoId);
    try {
      await subtitleService.cancelGeneration(videoId);
      console.log('✅ [useSubtitles] Cancel successful');
      setIsGenerating(false);
      setProgress(null);
      subtitleService.close();
    } catch (err) {
      console.error('❌ [useSubtitles] Failed to cancel generation:', err);
    }
  }, [videoId]);

  // Get subtitle for specific time
  const getCurrentSubtitle = useCallback((currentTime: number): Subtitle | null => {
    const subtitle = subtitles.find(
      sub => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
    
    if (subtitle !== currentSubtitle) {
      if (subtitle) {
        console.log('🎯 [useSubtitles] Subtitle sync - showing subtitle:', subtitle.index);
        console.log('  - currentTime:', currentTime.toFixed(2) + 's');
        console.log('  - subtitle time:', subtitle.startTime + 's -', subtitle.endTime + 's');
        console.log('  - text:', subtitle.text);
      } else if (currentSubtitle) {
        console.log('👁️ [useSubtitles] Subtitle sync - hiding subtitle');
        console.log('  - currentTime:', currentTime.toFixed(2) + 's');
      }
      setCurrentSubtitle(subtitle || null);
    }
    
    return subtitle || null;
  }, [subtitles, currentSubtitle]);

  // Check capability on mount
  useEffect(() => {
    void checkCapability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && capability?.available && !isGenerating) {
      void startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, capability?.available, isGenerating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subtitleService.close();
    };
  }, []);

  return {
    subtitles,
    currentSubtitle,
    loading,
    progress,
    error,
    capability,
    isGenerating,
    startGeneration,
    cancelGeneration,
    getCurrentSubtitle,
    checkCapability
  };
}

export default useSubtitles;
