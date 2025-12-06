export interface StreamUrlResponse {
  url: string;
  cmd?: string;
}

export interface StreamSession {
  sessionId: string;
  contentId: string;
  contentType: string;
  startedAt: number;
}

export interface StreamRequest {
  contentId: string;
  contentType: 'channel' | 'movie' | 'episode';
  title: string;
}
