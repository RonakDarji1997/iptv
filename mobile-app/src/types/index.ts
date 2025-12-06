// Re-export all types
export * from './Provider';
export * from './Category';
export * from './Channel';
export * from './Movie';
export * from './Series';
export * from './Search';
export * from './WatchProgress';
export * from './Auth';
export * from './Stream';

// Device info type
export interface DeviceInfo {
  type: 'mobile' | 'tablet';
  platform: 'ios' | 'android';
  screenWidth: number;
  screenHeight: number;
  isTablet: boolean;
}

// User settings
export interface UserSettings {
  autoPlay: boolean;
  autoPlayNextEpisode: boolean;
  videoQuality: 'auto' | 'high' | 'medium' | 'low';
  subtitlesEnabled: boolean;
  subtitlesSize: 'small' | 'medium' | 'large';
  parentalControlEnabled: boolean;
  parentalControlPin?: string;
  theme: 'dark' | 'light';
}
