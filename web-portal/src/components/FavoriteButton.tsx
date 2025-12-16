'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface FavoriteButtonProps {
  contentType: 'MOVIE' | 'SERIES' | 'EPISODE' | 'CHANNEL';
  contentId: string;
  contentName: string;
  contentPoster?: string;
  providerId?: string;
  categoryId?: string;
  className?: string;
  showLabel?: boolean;
}

export default function FavoriteButton({
  contentType,
  contentId,
  contentName,
  contentPoster,
  providerId,
  categoryId,
  className = '',
  showLabel = false
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkFavoriteStatus();
  }, [contentId, contentType]);

  const checkFavoriteStatus = async () => {
    try {
      setChecking(true);
      const response = await fetch(
        `${API_URL}/favorites/check/${contentType}/${contentId}`,
        {
          headers: authService.getAuthHeader(),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setIsFavorite(data.isFavorite);
      }
    } catch (error) {
      console.error('Error checking favorite status:', error);
    } finally {
      setChecking(false);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    try {
      if (isFavorite) {
        // Remove from favorites
        const response = await fetch(
          `${API_URL}/favorites/by-content/${contentType}/${contentId}`,
          {
            method: 'DELETE',
            headers: authService.getAuthHeader(),
          }
        );

        if (response.ok) {
          setIsFavorite(false);
          toast.success('Removed from favorites');
        }
      } else {
        // Add to favorites
        const response = await fetch(`${API_URL}/favorites`, {
          method: 'POST',
          headers: {
            ...authService.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentType,
            contentId,
            contentName,
            contentPoster,
            providerId,
            categoryId,
          }),
        });

        if (response.ok) {
          setIsFavorite(true);
          toast.success('Added to favorites');
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorites');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return null; // Or a skeleton loader
  }

  return (
    <button
      onClick={toggleFavorite}
      disabled={loading}
      className={`group flex items-center gap-2 transition-all ${className}`}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={`transition-all ${
          isFavorite
            ? 'fill-red-500 text-red-500'
            : 'text-white group-hover:text-red-500'
        } ${loading ? 'opacity-50' : ''}`}
        size={24}
      />
      {showLabel && (
        <span className="text-white text-sm font-medium">
          {isFavorite ? 'Favorited' : 'Add to Favorites'}
        </span>
      )}
    </button>
  );
}
