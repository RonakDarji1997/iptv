import { Movie } from '../types';

const movieTitles = [
  'The Dark Knight', 'Inception', 'Interstellar', 'Pulp Fiction', 'Fight Club',
  'The Matrix', 'Goodfellas', 'The Godfather', 'Forrest Gump', 'The Shawshank Redemption',
  'Gladiator', 'Braveheart', 'The Departed', 'Se7en', 'The Silence of the Lambs',
  'Saving Private Ryan', 'Schindler\'s List', 'The Green Mile', 'The Prestige', 'Memento',
  'The Social Network', 'Whiplash', 'La La Land', 'Parasite', 'Joker',
  'Avengers: Endgame', 'Spider-Man', 'Iron Man', 'Black Panther', 'Wonder Woman',
];

const generateMovies = (categoryId: string, count: number): Movie[] => {
  const movies: Movie[] = [];
  
  for (let i = 0; i < count; i++) {
    const title = movieTitles[i % movieTitles.length];
    movies.push({
      id: `movie_${categoryId}_${i}`,
      name: `${title} ${i > 29 ? i : ''}`.trim(),
      oName: title,
      description: `An epic tale of ${title.toLowerCase()} that captivates audiences with stunning visuals and compelling storytelling. This masterpiece has received critical acclaim worldwide.`,
      pic: `https://via.placeholder.com/300x450?text=${encodeURIComponent(title)}`,
      screensaverPic: `https://via.placeholder.com/1920x1080?text=${encodeURIComponent(title)}`,
      added: new Date(2020 + Math.floor(i / 10), i % 12, 1).toISOString(),
      year: `${2018 + (i % 6)}`,
      country: ['USA', 'UK', 'France', 'Germany', 'Japan'][i % 5],
      director: ['Christopher Nolan', 'Quentin Tarantino', 'Martin Scorsese', 'Steven Spielberg'][i % 4],
      actors: 'Leonardo DiCaprio, Brad Pitt, Morgan Freeman, Tom Hanks',
      genres: ['Action', 'Thriller', 'Drama', 'Sci-Fi'][i % 4],
      rating: `${(7 + Math.random() * 2).toFixed(1)}`,
      ratingMpaa: ['PG-13', 'R', 'PG'][i % 3],
      duration: `${90 + Math.floor(Math.random() * 60)}`,
      cmd: `ffmpeg https://example.com/movie${i}.m3u8`,
      series: '',
      categoryId: categoryId,
    });
  }
  
  return movies;
};

export const DUMMY_MOVIES = {
  '10': generateMovies('10', 30), // Action
  '11': generateMovies('11', 25), // Comedy
  '12': generateMovies('12', 30), // Drama
  '13': generateMovies('13', 20), // Horror
  '14': generateMovies('14', 25), // Sci-Fi
  '15': generateMovies('15', 22), // Thriller
  '16': generateMovies('16', 18), // Romance
  '17': generateMovies('17', 15), // Documentary
};

export const getDummyMoviesByCategory = (categoryId: string): Movie[] => {
  return DUMMY_MOVIES[categoryId as keyof typeof DUMMY_MOVIES] || [];
};
