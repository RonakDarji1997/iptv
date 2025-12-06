export interface Channel {
  id: string;
  name: string;
  number?: string;
  logo?: string;
  cmd: string;
  tvGenreId?: string;
  useHttpTmpLink?: string;
  useLoadBalancing?: string;
  epgChannelId?: string;
  currentShow?: EPGProgram;
}

export interface ChannelsResponse {
  channels: Channel[];
  total: number;
  hasMore: boolean;
}

export interface EPGProgram {
  id: string;
  channelId: string;
  name: string;
  startTime: number;
  endTime: number;
  description?: string;
  category?: string;
}
