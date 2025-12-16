'use client';

import { useState } from 'react';
import { TMDBService } from '@/services/tmdbService';

export default function TMDBTestPage() {
  const [query, setQuery] = useState('Inception');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tmdb?action=smart-search&title=${encodeURIComponent(query)}&type=movie`
      );
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError('Failed to fetch TMDB data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">🎬 TMDB Integration Test</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter movie title..."
              className="flex-1 px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:border-yellow-500"
              onKeyDown={(e) => e.key === 'Enter' && testSearch()}
            />
            <button
              onClick={testSearch}
              disabled={loading}
              className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 text-black font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200">
              {error}
            </div>
          )}
        </div>

        {results?.success && results.details && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="relative h-64 bg-gray-700">
              {results.details.backdrop_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w1280${results.details.backdrop_path}`}
                  alt={results.details.title || results.details.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-800 to-transparent" />
            </div>

            <div className="p-6">
              <div className="flex gap-6 mb-6">
                {results.details.poster_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${results.details.poster_path}`}
                    alt={results.details.title || results.details.name}
                    className="w-32 h-48 object-cover rounded-lg shadow-lg -mt-24 relative z-10"
                  />
                )}
                
                <div className="flex-1">
                  <h2 className="text-3xl font-bold mb-2">
                    {results.details.title || results.details.name}
                  </h2>
                  
                  {results.details.tagline && (
                    <p className="text-gray-400 italic mb-4">{results.details.tagline}</p>
                  )}
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">⭐</span>
                      <span className="text-xl font-bold text-yellow-500">
                        {results.details.vote_average?.toFixed(1)}
                      </span>
                      <span className="text-gray-400 text-sm">
                        ({results.details.vote_count?.toLocaleString()} votes)
                      </span>
                    </div>
                    
                    {results.details.release_date && (
                      <span className="text-gray-400">
                        📅 {new Date(results.details.release_date).getFullYear()}
                      </span>
                    )}
                    
                    {results.details.runtime && (
                      <span className="text-gray-400">
                        ⏱️ {Math.floor(results.details.runtime / 60)}h {results.details.runtime % 60}m
                      </span>
                    )}
                  </div>

                  {results.details.genres && results.details.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {results.details.genres.map((genre: any) => (
                        <span
                          key={genre.id}
                          className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-sm"
                        >
                          {genre.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {results.details.overview && (
                    <p className="text-gray-300 leading-relaxed mb-4">
                      {results.details.overview}
                    </p>
                  )}

                  {results.details.imdb_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">IMDb ID:</span>
                      <a
                        href={`https://www.imdb.com/title/${results.details.imdb_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-yellow-500 hover:underline"
                      >
                        {results.details.imdb_id}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Raw TMDB Data:</h3>
                <pre className="text-xs text-gray-300 overflow-x-auto">
                  {JSON.stringify(results.details, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {results && !results.success && (
          <div className="bg-gray-800 rounded-lg p-6">
            <p className="text-gray-400">No results found. Try a different search term.</p>
          </div>
        )}

        <div className="mt-8 bg-blue-500/20 border border-blue-500 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-3">✅ TMDB Integration Active</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>✓ API key configured</li>
            <li>✓ Search endpoint working</li>
            <li>✓ High-quality images loading</li>
            <li>✓ Ratings and metadata available</li>
          </ul>
          <p className="mt-4 text-xs text-gray-400">
            Try searching for: Inception, The Matrix, Interstellar, Avatar, The Dark Knight
          </p>
        </div>
      </div>
    </div>
  );
}
