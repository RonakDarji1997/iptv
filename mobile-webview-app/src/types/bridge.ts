/**
 * WebView Message Bridge Types
 * Communication between WebView (web-portal) and Native App
 */

// Messages FROM WebView TO Native
export type WebToNativeMessage =
  | {
      type: 'PLAY_LIVE_TV';
      data: {
        url: string;
        title: string;
        channelNum?: string;
        cmd: string;
      };
    }
  | {
      type: 'PLAY_VOD';
      data: {
        url: string;
        title: string;
        contentId: string;
        contentType?: 'movie' | 'episode';
        savedPosition?: number;
        subtitles?: Subtitle[];
        selectedSubtitle?: Subtitle | null;
        isSeries?: boolean;
        seriesId?: string;
        seasonNumber?: string;
        episodeNumber?: string;
        imdbId?: string;
      };
    }
  | {
      type: 'CLOSE_PLAYER';
      data: {};
    }
  | {
      type: 'LOG';
      data: { level: string; message: string };
    };

// Messages FROM Native TO WebView
export type NativeToWebMessage =
  | {
      type: 'VIDEO_PROGRESS';
      data: {
        contentId: string;
        currentTime: number;
        duration: number;
        buffered?: number;
      };
    }
  | {
      type: 'VIDEO_ENDED';
      data: {
        contentId: string;
        duration: number;
      };
    }
  | {
      type: 'VIDEO_CLOSED';
      data: {};
    }
  | {
      type: 'VIDEO_ERROR';
      data: {
        error: string;
        code?: number;
      };
    }
  | {
      type: 'SUBTITLE_CHANGED';
      data: {
        subtitle: Subtitle | null;
      };
    }
  | {
      type: 'QUALITY_CHANGED';
      data: {
        quality: string;
      };
    };

// Subtitle definition (matching web-portal)
export interface Subtitle {
  id: string;
  language: string;
  languageName: string;
  fileName: string;
  downloadCount?: number;
  rating?: number;
  uploader?: string;
  releaseInfo?: string;
  fileId?: number;
  isCustom?: boolean;
  customUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

// Video player state
export interface VideoPlayerData {
  url: string;
  title: string;
  contentId?: string;
  savedPosition?: number;
  subtitles?: Subtitle[];
  selectedSubtitle?: Subtitle | null;
}

// Live TV specific data
export interface LiveTVData extends VideoPlayerData {
  channelNum?: string;
  cmd: string;
}

// VOD specific data
export interface VODData extends VideoPlayerData {
  contentType?: 'movie' | 'episode';
  isSeries?: boolean;
  seriesId?: string;
  seasonNumber?: string;
  episodeNumber?: string;
  imdbId?: string;
}
