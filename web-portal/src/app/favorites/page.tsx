'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Trash2, Film, Tv, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import Image from 'next/image';

interface Favorite {
  id: number;
  content_type: 'movie' | 'series' | 'episode';
  content_id: string;
  content_name: string;
  content_poster: string | null;
  created_at: string;
}

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'series'>('all');

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const queryParam = activeTab === 'all' ? '' : `?contentType=${activeTab}`;
      
      const response = await fetch(`${apiUrl}/favorites${queryParam}`, {
        headers: authService.getAuthHeader(),
      });
      
      if (response.ok) {
        const data = await response.json();
        setFavorites(data.favorites || []);
      }
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      toast.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const removeFavorite = async (id: number) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/favorites/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeader(),
      });

      if (response.ok) {
        setFavorites(favorites.filter(f => f.id !== id));
        toast.success('Removed from favorites');
      } else {
        toast.error('Failed to remove favorite');
      }
    } catch (error) {
      console.error('Failed to remove favorite:', error);
      toast.error('Failed to remove favorite');
    }
  };

  const openContent = (favorite: Favorite) => {
    // Navigate to content detail page
    if (favorite.content_type === 'movie') {
      // Extract category from somewhere or use a default
      router.push(`/browse/movies/1/${favorite.content_id}`);
    } else if (favorite.content_type === 'series') {
      router.push(`/browse/series/2/${favorite.content_id}`);
    }
  };

  // Filter favorites based on active tab (client-side filtering as fallback)
  const filteredFavorites = activeTab === 'all' 
    ? favorites 
    : favorites.filter(f => f.content_type.toLowerCase() === activeTab.toLowerCase());

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
              <Heart className="w-8 h-8 text-red-500 fill-red-500" />
              <h1 className="text-3xl font-bold text-white">My Favorites</h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-6 py-2 rounded-full transition-all ${
                activeTab === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('movie')}
              className={`px-6 py-2 rounded-full transition-all flex items-center gap-2 ${
                activeTab === 'movie'
                  ? 'bg-red-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <Film className="w-4 h-4" />
              Movies
            </button>
            <button
              onClick={() => setActiveTab('series')}
              className={`px-6 py-2 rounded-full transition-all flex items-center gap-2 ${
                activeTab === 'series'
                  ? 'bg-red-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <Tv className="w-4 h-4" />
              Series
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-white text-center py-12">Loading...</div>
        ) : filteredFavorites.length === 0 ? (
          <div className="text-center py-12">
            <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No favorites yet</p>
            <p className="text-gray-500 mt-2">
              Click the heart icon on movies or series to add them here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredFavorites.map((favorite) => (
              <div
                key={favorite.id}
                onClick={() => openContent(favorite)}
                className="group relative bg-gray-800/50 rounded-lg overflow-hidden hover:ring-2 hover:ring-red-500 transition-all cursor-pointer"
              >
                <div className="aspect-[2/3] relative">
                  {favorite.content_poster ? (
                    <Image
                      src={favorite.content_poster}
                      alt={favorite.content_name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      {favorite.content_type === 'movie' ? (
                        <Film className="w-12 h-12 text-gray-500" />
                      ) : (
                        <Tv className="w-12 h-12 text-gray-500" />
                      )}
                    </div>
                  )}
                  
                  {/* Delete button - top right */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(favorite.id);
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100"
                    title="Remove from favorites"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                  
                  {/* Content type badge */}
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-md">
                    <span className="text-white text-xs font-semibold uppercase">
                      {favorite.content_type}
                    </span>
                  </div>
                  
                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="p-4 bg-red-600 rounded-full">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <h3 className="text-white text-sm font-medium truncate">
                    {favorite.content_name}
                  </h3>
                  <p className="text-gray-400 text-xs mt-1 capitalize">
                    {favorite.content_type}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(favorite.created_at).toLocaleDateString()}
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
