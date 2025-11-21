/**
 * Debug Logger for Series/Episode Flow
 * Logs everything to help debug the series episode playback issue
 */

const LOG_PREFIX = '[DEBUG]';

// In-memory log storage
let logHistory: Array<{ timestamp: string; category: string; message: string; data: unknown }> = [];
const MAX_LOGS = 1000; // Keep last 1000 logs

export class DebugLogger {
  private static saveThrottle: ReturnType<typeof setTimeout> | null = null;

  static log(category: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, category, message, data: data || '' };
    
    // Add to in-memory storage
    logHistory.push(logEntry);
    if (logHistory.length > MAX_LOGS) {
      logHistory = logHistory.slice(-MAX_LOGS); // Keep only last MAX_LOGS
    }
    
    console.log(`${LOG_PREFIX} [${timestamp}] [${category}] ${message}`, data || '');
    
    // Auto-save to localStorage (throttled to avoid performance issues)
    if (this.saveThrottle) {
      clearTimeout(this.saveThrottle);
    }
    this.saveThrottle = setTimeout(() => {
      this.autoSaveLogs();
    }, 1000); // Save after 1 second of inactivity
  }

  // Export logs to file - works on web
  static exportLogs() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log(`${LOG_PREFIX} Export only works on web`);
      return;
    }

    const logsText = logHistory.map(log => 
      `[${log.timestamp}] [${log.category}] ${log.message}\n${JSON.stringify(log.data, null, 2)}\n\n`
    ).join('================================================================================\n\n');

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`${LOG_PREFIX} ✅ Logs exported to file (${logHistory.length} entries)`);
  }

  // Auto-save logs periodically to localStorage
  static autoSaveLogs() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const logsJson = JSON.stringify(logHistory);
        localStorage.setItem('debug-logs', logsJson);
        console.log(`${LOG_PREFIX} Logs auto-saved (${logHistory.length} entries)`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to save logs:`, error);
      }
    }
  }

  // Load logs from localStorage
  static loadSavedLogs() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('debug-logs');
        if (saved) {
          logHistory = JSON.parse(saved);
          console.log(`${LOG_PREFIX} Loaded ${logHistory.length} saved log entries`);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to load logs:`, error);
      }
    }
  }

  // Get logs as string
  static getLogsAsString(): string {
    return logHistory.map(log => 
      `[${log.timestamp}] [${log.category}] ${log.message}\n${JSON.stringify(log.data, null, 2)}`
    ).join('\n\n---\n\n');
  }

  // Clear logs
  static clearLogs() {
    logHistory = [];
    console.log(`${LOG_PREFIX} Logs cleared`);
  }

  // Get log count
  static getLogCount(): number {
    return logHistory.length;
  }

  // Series Detail Screen Logs
  static seriesOpened(seriesId: string, seriesName: string) {
    this.log('SERIES_DETAIL', `Series opened: ${seriesName}`, { seriesId });
  }

  static seasonsLoading(seriesId: string) {
    this.log('SERIES_DETAIL', 'Loading seasons...', { seriesId });
  }

  static seasonsLoaded(seasons: Array<Record<string, unknown>>) {
    this.log('SERIES_DETAIL', `Seasons loaded: ${seasons.length} seasons`, {
      seasons: seasons.map(s => ({ id: s.id, name: s.name || s.series_name, number: s.season_number }))
    });
  }

  static seasonsError(error: unknown) {
    this.log('SERIES_DETAIL', 'Error loading seasons', { error: error instanceof Error ? error.message : String(error) });
  }

  static seasonSelected(seasonId: string, seasonName: string, seasonNumber: string) {
    this.log('SERIES_DETAIL', `Season selected: ${seasonName} (${seasonNumber})`, { seasonId });
  }

  static episodesLoading(seriesId: string, seasonId: string) {
    this.log('SERIES_DETAIL', 'Loading episodes...', { seriesId, seasonId });
  }

  static episodesLoaded(episodes: Array<Record<string, unknown>>, seasonId: string) {
    this.log('SERIES_DETAIL', `Episodes loaded: ${episodes.length} episodes`, {
      seasonId,
      episodes: episodes.map(e => ({
        id: e.id,
        number: e.series_number,
        name: e.name,
        date: e.date_add
      }))
    });
  }

  static episodesError(error: unknown) {
    this.log('SERIES_DETAIL', 'Error loading episodes', { error: error instanceof Error ? error.message : String(error) });
  }

  static episodeClicked(episode: Record<string, unknown>, seasonId: string) {
    this.log('SERIES_DETAIL', `Episode clicked: #${episode.series_number} - ${episode.name}`, {
      episodeId: episode.id,
      episodeNumber: episode.series_number,
      episodeName: episode.name,
      seasonId,
      hasProgress: episode.hasProgress
    });
  }

  static navigatingToWatch(params: Record<string, unknown>) {
    this.log('SERIES_DETAIL', 'Navigating to watch screen', {
      seriesId: params.id,
      episodeId: params.episodeId,
      episodeNumber: params.episodeNumber,
      seasonId: params.seasonId,
      type: params.type,
      resumeFrom: params.resumeFrom
    });
  }

  // Watch Screen Logs
  static watchScreenOpened(params: Record<string, unknown>) {
    this.log('WATCH_SCREEN', 'Watch screen opened', {
      seriesId: params.id,
      episodeId: params.episodeId,
      episodeNumber: params.episodeNumber,
      seasonId: params.seasonId,
      type: params.type,
      resumeFrom: params.resumeFrom
    });
  }

  static loadingStream(contentType: string, episodeId?: string) {
    this.log('WATCH_SCREEN', `Loading stream for ${contentType}`, { episodeId });
  }

  static constructingCmd(episodeId: string, cmd: string) {
    this.log('WATCH_SCREEN', 'Constructing cmd from episodeId', { episodeId, cmd });
  }

  static callingCreateLink(cmd: string, type: string) {
    this.log('WATCH_SCREEN', 'Calling create_link API', { cmd, type });
  }

  static streamUrlReceived(url: string) {
    this.log('WATCH_SCREEN', 'Stream URL received', { 
      url: url.substring(0, 100) + '...',
      fullLength: url.length 
    });
  }

  static streamError(error: unknown) {
    this.log('WATCH_SCREEN', 'Stream loading error', { error: error instanceof Error ? error.message : String(error) });
  }

  static loadingNextEpisode(seriesId: string, seasonId: string, currentEpisodeNumber: string) {
    this.log('WATCH_SCREEN', 'Loading next/prev episode data', {
      seriesId,
      seasonId,
      currentEpisodeNumber
    });
  }

  static nextEpisodeFound(nextEpisode: Record<string, unknown>) {
    this.log('WATCH_SCREEN', 'Next episode found', {
      episodeId: nextEpisode.id,
      episodeNumber: nextEpisode.series_number,
      episodeName: nextEpisode.name
    });
  }

  static prevEpisodeFound(prevEpisode: Record<string, unknown>) {
    this.log('WATCH_SCREEN', 'Previous episode found', {
      episodeId: prevEpisode.id,
      episodeNumber: prevEpisode.series_number,
      episodeName: prevEpisode.name
    });
  }

  static navigatingToNextEpisode(episodeId: string, episodeNumber: string) {
    this.log('WATCH_SCREEN', 'Navigating to next episode', { episodeId, episodeNumber });
  }

  static navigatingToPrevEpisode(episodeId: string, episodeNumber: string) {
    this.log('WATCH_SCREEN', 'Navigating to previous episode', { episodeId, episodeNumber });
  }

  // API Call Logs
  static apiCall(action: string, params: Record<string, unknown>) {
    this.log('API', `🔵 API CALL: ${action}`, {
      action,
      params,
      timestamp: new Date().toISOString()
    });
  }

  static apiResponse(action: string, response: unknown) {
    const data = response && typeof response === 'object' && 'js' in response ? (response as Record<string, unknown>).js : response;
    const isArray = Array.isArray(data);
    
    this.log('API', `🟢 API RESPONSE: ${action}`, {
      action,
      responseType: isArray ? 'array' : typeof data,
      itemCount: isArray ? data.length : 'N/A',
      totalItems: response && typeof response === 'object' && 'js' in response && (response as Record<string, unknown>).js && typeof (response as Record<string, unknown>).js === 'object' && 'total_items' in ((response as Record<string, unknown>).js as Record<string, unknown>) ? ((response as Record<string, unknown>).js as Record<string, unknown>).total_items : 'N/A',
      firstItem: isArray && data.length > 0 ? data[0] : null,
      fullResponse: response,
      timestamp: new Date().toISOString()
    });
  }

  static apiError(action: string, error: unknown) {
    this.log('API', `🔴 API ERROR: ${action}`, { 
      action,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }

  // Proxy/Network Logs
  static proxyCall(url: string, params: Record<string, unknown>) {
    this.log('PROXY', `📡 PROXY CALL`, {
      url,
      params,
      fullUrl: url + '?' + new URLSearchParams(params as Record<string, string>).toString(),
      timestamp: new Date().toISOString()
    });
  }

  static proxyResponse(url: string, status: number, data: unknown) {
    this.log('PROXY', `📥 PROXY RESPONSE`, {
      url,
      status,
      data,
      timestamp: new Date().toISOString()
    });
  }

  static proxyError(url: string, error: unknown) {
    this.log('PROXY', `❌ PROXY ERROR`, {
      url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

// Expose DebugLogger to global window for console access
if (typeof window !== 'undefined') {
  (window as typeof window & { DebugLogger: typeof DebugLogger }).DebugLogger = DebugLogger;
  console.log(`${LOG_PREFIX} DebugLogger exposed to window. Use: DebugLogger.exportLogs()`);
}
