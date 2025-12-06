import { Series, Season, Episode } from '../types';

const seriesTitles = [
  'Breaking Bad', 'Game of Thrones', 'The Sopranos', 'The Wire', 'Mad Men',
  'Stranger Things', 'The Crown', 'Westworld', 'Black Mirror', 'The Mandalorian',
  'House of Cards', 'Ozark', 'Narcos', 'Peaky Blinders', 'Sherlock',
  'The Witcher', 'The Boys', 'Money Heist', 'Dark', 'Chernobyl',
];

const generateSeries = (categoryId: string, count: number): Series[] => {
  const series: Series[] = [];
  
  for (let i = 0; i < count; i++) {
    const title = seriesTitles[i % seriesTitles.length];
    const seasons = Math.floor(Math.random() * 8) + 1;
    
    series.push({
      id: `series_${categoryId}_${i}`,
      name: `${title} ${i >= 20 ? i : ''}`.trim(),
      oName: title,
      description: `${title} is a critically acclaimed series that has captivated audiences worldwide. Experience the journey through multiple seasons of gripping drama.`,
      pic: `https://via.placeholder.com/300x450?text=${encodeURIComponent(title)}`,
      screensaverPic: `https://via.placeholder.com/1920x1080?text=${encodeURIComponent(title)}`,
      added: new Date(2015 + Math.floor(i / 5), i % 12, 1).toISOString(),
      year: `${2015 + (i % 8)}`,
      country: ['USA', 'UK', 'Spain', 'Germany'][i % 4],
      director: ['Vince Gilligan', 'David Benioff', 'Peter Morgan'][i % 3],
      actors: 'Bryan Cranston, Emilia Clarke, Claire Foy, Tom Hardy',
      genres: ['Drama', 'Thriller', 'Crime', 'Fantasy'][i % 4],
      rating: `${(7.5 + Math.random() * 2).toFixed(1)}`,
      ratingMpaa: 'TV-MA',
      lastSeason: `${seasons}`,
      cmd: `ffmpeg https://example.com/series${i}.m3u8`,
      series: 'series',
      categoryId: categoryId,
    });
  }
  
  return series;
};

export const DUMMY_SERIES = {
  '20': generateSeries('20', 20), // Popular TV Shows
  '21': generateSeries('21', 15), // Crime
  '22': generateSeries('22', 18), // Comedy Series
  '23': generateSeries('23', 20), // Drama Series
  '24': generateSeries('24', 12), // Sci-Fi & Fantasy
  '25': generateSeries('25', 10), // Reality TV
};

export const getDummySeriesByCategory = (categoryId: string): Series[] => {
  return DUMMY_SERIES[categoryId as keyof typeof DUMMY_SERIES] || [];
};

// Generate seasons for a series
export const generateDummySeasons = (seriesId: string, count: number): Season[] => {
  const seasons: Season[] = [];
  
  for (let i = 1; i <= count; i++) {
    seasons.push({
      id: `season_${seriesId}_${i}`,
      seriesId: seriesId,
      name: `Season ${i}`,
      seasonNumber: `${i}`,
      episodeCount: Math.floor(Math.random() * 15) + 6,
    });
  }
  
  return seasons;
};

// Generate episodes for a season
export const generateDummyEpisodes = (seriesId: string, seasonId: string, count: number): Episode[] => {
  const episodes: Episode[] = [];
  
  for (let i = 1; i <= count; i++) {
    episodes.push({
      id: `episode_${seasonId}_${i}`,
      seriesId: seriesId,
      seasonId: seasonId,
      name: `Episode ${i}: The ${['Beginning', 'Journey', 'Discovery', 'Truth', 'Revelation', 'End'][i % 6]}`,
      episodeNumber: `${i}`,
      duration: `${35 + Math.floor(Math.random() * 25)}`,
      cmd: `ffmpeg https://example.com/episode${i}.m3u8`,
      added: new Date(2020, i % 12, i).toISOString(),
      description: `In this thrilling episode, our protagonists face unexpected challenges that will change everything. Don't miss the exciting developments in Episode ${i}.`,
      watched: false,
      watchProgress: 0,
    });
  }
  
  return episodes;
};
