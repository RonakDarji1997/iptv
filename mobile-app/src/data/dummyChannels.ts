import { Channel } from '../types';

// Generate dummy channels for testing
const generateChannels = (categoryId: string, count: number): Channel[] => {
  const channels: Channel[] = [];
  const categories = ['Sports', 'News', 'Entertainment', 'Movies', 'Kids'];
  
  for (let i = 1; i <= count; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    channels.push({
      id: `ch_${categoryId}_${i}`,
      name: `${category} Channel ${i}`,
      number: `${i}`,
      logo: `https://via.placeholder.com/150?text=CH${i}`,
      cmd: `ffmpeg https://example.com/channel${i}.m3u8`,
      tvGenreId: categoryId,
      epgChannelId: `epg_${i}`,
      currentShow: {
        id: `show_${i}`,
        channelId: `ch_${categoryId}_${i}`,
        name: `Current Show ${i}`,
        startTime: Date.now() - 30 * 60 * 1000, // Started 30 mins ago
        endTime: Date.now() + 30 * 60 * 1000, // Ends in 30 mins
        description: `Description for show ${i}`,
        category: category,
      },
    });
  }
  
  return channels;
};

export const DUMMY_CHANNELS = {
  '1': generateChannels('1', 50), // All Channels
  '2': generateChannels('2', 15), // Sports
  '3': generateChannels('3', 20), // News
  '4': generateChannels('4', 25), // Entertainment
  '5': generateChannels('5', 30), // Movies
  '6': generateChannels('6', 18), // Kids
  '7': generateChannels('7', 12), // Music
  '8': generateChannels('8', 10), // Documentary
};

// Get channels by category ID
export const getDummyChannelsByCategory = (categoryId: string): Channel[] => {
  return DUMMY_CHANNELS[categoryId as keyof typeof DUMMY_CHANNELS] || [];
};
