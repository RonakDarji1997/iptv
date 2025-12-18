'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Film, Tv, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import Image from 'next/image';
import ProgressBar from '@/components/ProgressBar';

interface WatchProgress {
  id: number;
  content_type: string;
  content_id: string;
  current_position: number;
  duration: number;
  last_watched_at: string;
  // Optional metadata we might fetch
  title?: string;
  poster?: string;
  series_id?: string;
  season_number?: number;
  episode_number?: number;
}

export default function ContinueWatchingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'MOVIE' | 'EPISODE'>('all');

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      // Get all progress entries
      const response = await fetch(`${apiUrl}/progress`, {
        headers: authService.getAuthHeader(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }
      
      const data = await response.json();
      console.log('[Continue Watching] Raw progress data:', data.progress);
      
      // Filter to only show items between 0% and 95% watched
      const inProgress = (data.progress || []).filter((p: WatchProgress) => {
        const percentage = (p.current_position / p.duration) * 100;
        return percentage > 0 && percentage < 95;
      });
      
      // Group episodes by series_id
      const groupedBySeries = new Map<string, WatchProgress>();
      
      inProgress.forEach((item: any) => {
        const contentType = item.content_type?.toUpperCase();
        
        if (contentType === 'EPISODE' && item.series_id) {
          // For episodes, keep only the most recent one per series
          const existing = groupedBySeries.get(item.series_id);
          if (!existing || new Date(item.last_watched_at) > new Date(existing.last_watched_at)) {
            groupedBySeries.set(item.series_id, {
              ...item,
              // Use series_id as the unique identifier for navigation
              display_id: item.series_id,
              is_series_progress: true,
            });
          }
        } else if (contentType === 'MOVIE') {
          // For movies, use content_id as key
          groupedBySeries.set(`movie_${item.content_id}`, item);
        }
      });
      
      // Convert map back to array and map database fields
      const progressWithMetadata = Array.from(groupedBySeries.values()).map((item: any) => ({
        ...item,
        title: item.content_name || item.content_id,
        poster: item.content_poster || null,
      }));
      
      console.log('[Continue Watching] Processed progress:', progressWithMetadata.map(p => ({
        title: p.title,
        poster: p.poster,
        type: p.content_type,
        seriesId: p.series_id
      })));
      
      // Sort by last_watched_at descending
      progressWithMetadata.sort((a: any, b: any) => 
        new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
      );
      
      setProgress(progressWithMetadata);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
      toast.error('Failed to load continue watching');
    } finally {
      setLoading(false);
    }
  };

  const resumeContent = async (item: WatchProgress) => {
    const contentType = item.content_type?.toUpperCase();
    if (contentType === 'MOVIE') {
      try {
        // First verify the movie exists by fetching its info
        const token = authService.getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/stalker-proxy/vod-info/${item.content_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.info) {
            // Movie exists, use its category_id from the response
            const categoryId = data.info.category_id || '1';
            console.log('[Continue Watching] Navigating to movie:', {
              movieId: item.content_id,
              categoryId,
              url: `/browse/movies/${categoryId}/${item.content_id}`
            });
            router.push(`/browse/movies/${categoryId}/${item.content_id}`);
          } else {
            toast.error('Movie no longer available');
          }
        } else {
          toast.error('Failed to load movie');
        }
      } catch (error) {
        console.error('Failed to verify movie:', error);
        toast.error('Failed to load movie');
      }
    } else if (contentType === 'EPISODE') {
      // For episodes, always navigate to series page
      const seriesId = (item as any).series_id || (item as any).display_id;
      if (seriesId) {
        router.push(`/browse/series/2/${seriesId}`);
      }
    }
  };

  const getProgress = (item: WatchProgress) => {
    return Math.floor((item.current_position / item.duration) * 100);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getTimeRemaining = (item: WatchProgress) => {
    const remaining = item.duration - item.current_position;
    return formatTime(remaining);
  };

  const filteredProgress = activeTab === 'all' 
    ? progress 
    : progress.filter(p => {
        const type = p.content_type?.toUpperCase();
        if (activeTab === 'MOVIE') return type === 'MOVIE';
        if (activeTab === 'EPISODE') return type === 'EPISODE';
        return true;
      });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-yellow-500" />
              <h1 className="text-3xl font-bold text-white">Continue Watching</h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-6 py-2 rounded-full transition-all ${
                activeTab === 'all'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('MOVIE')}
              className={`px-6 py-2 rounded-full transition-all flex items-center gap-2 ${
                activeTab === 'MOVIE'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <Film className="w-4 h-4" />
              Movies
            </button>
            <button
              onClick={() => setActiveTab('EPISODE')}
              className={`px-6 py-2 rounded-full transition-all flex items-center gap-2 ${
                activeTab === 'EPISODE'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <Tv className="w-4 h-4" />
              Episodes
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-white text-center py-12">Loading...</div>
        ) : filteredProgress.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Nothing to continue watching</p>
            <p className="text-gray-500 mt-2">
              Start watching movies or series to see them here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredProgress.map((item) => (
              <div
                key={item.id}
                className="group relative bg-gray-800/50 rounded-lg overflow-hidden hover:ring-2 hover:ring-yellow-500 transition-all cursor-pointer"
                onClick={() => resumeContent(item)}
              >
                <div className="aspect-[2/3] relative">
                  {item.poster ? (
                    <Image
                      src={item.poster}
                      alt={item.title || 'Content'}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      {item.content_type === 'MOVIE' ? (
                        <Film className="w-12 h-12 text-gray-500" />
                      ) : (
                        <Tv className="w-12 h-12 text-gray-500" />
                      )}
                    </div>
                  )}

                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="p-4 bg-yellow-600 rounded-full">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>

                  {/* Progress bar at bottom */}
                  <div className="absolute bottom-0 left-0 right-0">
                    <ProgressBar percentage={getProgress(item)} height="h-1.5" showLabel={false} />
                  </div>

                  {/* Progress percentage badge */}
                  <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-md">
                    <span className="text-yellow-500 text-xs font-bold">
                      {getProgress(item)}%
                    </span>
                  </div>

                  {/* Content type badge */}
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-md">
                    <span className="text-white text-xs font-semibold uppercase">
                      {item.content_type === 'EPISODE' ? 'Series' : item.content_type}
                    </span>
                  </div>
                </div>

                <div className="p-3">
                  <h3 className="text-white text-sm font-medium truncate">
                    {item.title || `${item.content_type} ${item.content_id}`}
                  </h3>

                  {item.content_type === 'EPISODE' && item.season_number && item.episode_number && (
                    <p className="text-gray-400 text-xs mt-1">
                      S{item.season_number} E{item.episode_number}
                    </p>
                  )}

                  <p className="text-gray-400 text-xs mt-1 capitalize">
                    {item.content_type.toLowerCase()}
                  </p>

                  <p className="text-gray-500 text-xs mt-1">
                    {getTimeRemaining(item)} left
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
