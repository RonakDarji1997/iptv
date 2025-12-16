'use client';

import { useEffect, useState } from 'react';
import { X, Play, Star, Calendar, Clock, Globe, Film, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/config/constants';
import { authService } from '@/services/authService';
import toast from 'react-hot-toast';

interface ContentInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: {
    id: string;
    name?: string;
    title?: string;
    description?: string;
    logo?: string;
    screenshot_uri?: string;
    imageUrl?: string;
    is_series?: number;
    cmd?: string;
    tmdb?: {
      id: number;
      posterUrl: string | null;
      backdropUrl: string | null;
      rating: number;
      voteCount: number;
      overview: string;
      releaseDate?: string;
      genres?: string[];
      imdbId?: string;
    };
  };
  type: 'movie' | 'series' | 'live';
}

export default function ContentInfoModal({ isOpen, onClose, content, type }: ContentInfoModalProps) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);

  useEffect(() => {
    if (isOpen && type === 'series') {
      loadSeasons();
    }
  }, [isOpen, content.id, type]);

  const loadSeasons = async () => {
    try {
      setLoadingSeasons(true);
      const token = authService.getToken();
      const response = await fetch(
        `${API_URL}/stalker-proxy/series-seasons/${content.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setSeasons(data.seasons || []);
      }
    } catch (error) {
      console.error('Failed to load seasons:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const handlePlay = async () => {
    if (type === 'series') {
      // Navigate to series seasons page
      router.push(`/browse/series/${content.id}`);
    } else if (type === 'movie') {
      // Get stream URL and play
      try {
        const token = authService.getToken();
        const response = await fetch(`${API_URL}/stalker-proxy/create-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cmd: content.cmd,
            forced_storage: 'undefined',
            disable_ad: '0',
            download: '0',
          }),
        });

        const data = await response.json();
        if (data.success && data.link?.cmd) {
          const streamUrl = encodeURIComponent(data.link.cmd);
          const title = encodeURIComponent(content.name || content.title || 'Movie');
          router.push(`/player/vod?url=${streamUrl}&title=${title}`);
        } else {
          toast.error('Failed to get stream URL');
        }
      } catch (error) {
        console.error('Failed to play movie:', error);
        toast.error('Failed to play movie');
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const displayTitle = content.name || content.title || 'Untitled';
  const backdropUrl = content.tmdb?.backdropUrl || content.screenshot_uri || content.imageUrl;
  const posterUrl = content.tmdb?.posterUrl || content.logo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-gray-900 rounded-lg shadow-2xl overflow-hidden my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* Backdrop Image */}
        <div className="relative h-[400px] bg-gray-800">
          {backdropUrl && (
            <>
              <img
                src={backdropUrl.startsWith('http') ? backdropUrl : `${backdropUrl}`}
                alt={displayTitle}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
            </>
          )}

          {/* Content Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex gap-6">
              {/* Poster */}
              {posterUrl && (
                <div className="flex-shrink-0 w-40 h-60 rounded-lg overflow-hidden shadow-2xl hidden sm:block">
                  <img
                    src={posterUrl.startsWith('http') ? posterUrl : `${posterUrl}`}
                    alt={displayTitle}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Title and Meta */}
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-white mb-4">{displayTitle}</h1>

                {/* Meta Info */}
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  {content.tmdb?.rating && content.tmdb.rating > 0 && (
                    <div className="flex items-center gap-2 bg-yellow-500/20 px-3 py-1 rounded-full">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="text-white font-bold">{content.tmdb.rating.toFixed(1)}</span>
                      <span className="text-gray-300 text-sm">
                        ({content.tmdb.voteCount.toLocaleString()} votes)
                      </span>
                    </div>
                  )}

                  {content.tmdb?.releaseDate && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(content.tmdb.releaseDate).getFullYear()}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-300">
                    {type === 'series' ? (
                      <>
                        <Tv className="w-4 h-4" />
                        <span>TV Series</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4" />
                        <span>Movie</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Genres */}
                {content.tmdb?.genres && content.tmdb.genres.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {content.tmdb.genres.map((genre, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-700/80 text-gray-200 rounded-full text-sm"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {/* Play Button */}
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-2 px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{type === 'series' ? 'View Episodes' : 'Play Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Details Section */}
        <div className="p-8">
          {/* Overview */}
          {(content.tmdb?.overview || content.description) && (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-3">Overview</h2>
              <p className="text-gray-300 leading-relaxed">
                {content.tmdb?.overview || content.description}
              </p>
            </div>
          )}

          {/* Additional Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {content.tmdb?.imdbId && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">IMDb</h3>
                <a
                  href={`https://www.imdb.com/title/${content.tmdb.imdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-500 hover:text-yellow-400 transition-colors"
                >
                  {content.tmdb.imdbId}
                </a>
              </div>
            )}

            {type === 'series' && seasons.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Seasons</h3>
                <p className="text-white">{seasons.length} Season{seasons.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          {/* Seasons Preview (for series) */}
          {type === 'series' && seasons.length > 0 && (
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-xl font-bold text-white mb-4">Seasons</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {seasons.slice(0, 6).map((season) => (
                  <div
                    key={season.id}
                    className="bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer"
                    onClick={handlePlay}
                  >
                    <div className="text-center">
                      <div className="text-yellow-500 font-bold text-2xl mb-1">
                        {season.season_number || season.name}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {season.episode_count || 0} Episodes
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {seasons.length > 6 && (
                <button
                  onClick={handlePlay}
                  className="mt-4 text-yellow-500 hover:text-yellow-400 text-sm font-semibold transition-colors"
                >
                  View All Seasons →
                </button>
              )}
            </div>
          )}

          {loadingSeasons && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
