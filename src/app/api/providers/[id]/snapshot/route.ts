import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

interface Category {
  id: string;
  externalId: string;
  name: string;
  type: string;
}

interface ContentItem {
  id: string;
  categoryId?: string | null;
  [key: string]: unknown;
}

/**
 * Filter content based on profile restrictions
 */
function filterByProfile(
  data: {
    categories: Category[];
    movies: ContentItem[];
    series: ContentItem[];
    channels: ContentItem[];
    moviesByCategory?: Record<string, ContentItem[]>;
    seriesByCategory?: Record<string, ContentItem[]>;
    channelsByCategory?: Record<string, ContentItem[]>;
    stats?: {
      totalMovies: number;
      totalSeries: number;
      totalChannels: number;
      totalCategories: number;
    };
  },
  profile: {
    allowedCategories: string[];
    blockedCategories: string[];
    allowedChannels: string[];
    blockedChannels: string[];
  }
): typeof data {
  const hasAllowedCategories = profile.allowedCategories.length > 0;
  const hasBlockedCategories = profile.blockedCategories.length > 0;
  const hasAllowedChannels = profile.allowedChannels.length > 0;
  const hasBlockedChannels = profile.blockedChannels.length > 0;

  // If no restrictions, return as-is
  if (!hasAllowedCategories && !hasBlockedCategories && !hasAllowedChannels && !hasBlockedChannels) {
    return data;
  }

  // Filter categories
  let filteredCategories = [...data.categories];
  if (hasAllowedCategories) {
    filteredCategories = filteredCategories.filter((cat) =>
      profile.allowedCategories.includes(cat.id) ||
      profile.allowedCategories.includes(cat.externalId)
    );
  }
  if (hasBlockedCategories) {
    filteredCategories = filteredCategories.filter(
      (cat) =>
        !profile.blockedCategories.includes(cat.id) &&
        !profile.blockedCategories.includes(cat.externalId)
    );
  }

  const allowedCategoryIds = new Set(filteredCategories.map((c) => c.id));
  const allowedExternalIds = new Set(filteredCategories.map((c) => c.externalId));

  // Filter content by allowed categories
  const filterContent = (items: ContentItem[]): ContentItem[] => {
    return items.filter((item) => {
      if (!item.categoryId) return true; // Keep items without category
      return allowedCategoryIds.has(item.categoryId) || allowedExternalIds.has(item.categoryId);
    });
  };

  let filteredMovies = filterContent(data.movies);
  let filteredSeries = filterContent(data.series);
  let filteredChannels = filterContent(data.channels);

  // Additional channel filtering by ID
  if (hasAllowedChannels) {
    filteredChannels = filteredChannels.filter((ch) =>
      profile.allowedChannels.includes(ch.id)
    );
  }
  if (hasBlockedChannels) {
    filteredChannels = filteredChannels.filter(
      (ch) => !profile.blockedChannels.includes(ch.id)
    );
  }

  // Rebuild category mappings
  const moviesByCategory: Record<string, ContentItem[]> = {};
  const seriesByCategory: Record<string, ContentItem[]> = {};
  const channelsByCategory: Record<string, ContentItem[]> = {};

  filteredMovies.forEach((movie) => {
    if (movie.categoryId) {
      if (!moviesByCategory[movie.categoryId]) moviesByCategory[movie.categoryId] = [];
      moviesByCategory[movie.categoryId].push(movie);
    }
  });

  filteredSeries.forEach((s) => {
    if (s.categoryId) {
      if (!seriesByCategory[s.categoryId]) seriesByCategory[s.categoryId] = [];
      seriesByCategory[s.categoryId].push(s);
    }
  });

  filteredChannels.forEach((ch) => {
    if (ch.categoryId) {
      if (!channelsByCategory[ch.categoryId]) channelsByCategory[ch.categoryId] = [];
      channelsByCategory[ch.categoryId].push(ch);
    }
  });

  return {
    ...data,
    categories: filteredCategories,
    movies: filteredMovies,
    series: filteredSeries,
    channels: filteredChannels,
    moviesByCategory,
    seriesByCategory,
    channelsByCategory,
    stats: {
      totalMovies: filteredMovies.length,
      totalSeries: filteredSeries.length,
      totalChannels: filteredChannels.length,
      totalCategories: filteredCategories.length,
    },
  };
}

/**
 * GET /api/providers/[id]/snapshot
 * Get latest VOD snapshot for fast UI rendering
 * Supports compression via Accept-Encoding: gzip header
 * Filters content based on active profile if profileId is provided
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: providerId } = await params;
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');

    // Get active profile for filtering
    let activeProfile = null;
    if (profileId) {
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
      });
      if (profile) {
        activeProfile = {
          allowedCategories: profile.allowedCategories
            ? JSON.parse(profile.allowedCategories)
            : [],
          blockedCategories: profile.blockedCategories
            ? JSON.parse(profile.blockedCategories)
            : [],
          allowedChannels: profile.allowedChannels
            ? JSON.parse(profile.allowedChannels)
            : [],
          blockedChannels: profile.blockedChannels
            ? JSON.parse(profile.blockedChannels)
            : [],
        };
      }
    }

    // Get latest snapshot
    const snapshot = await prisma.snapshot.findFirst({
      where: {
        providerId,
        type: 'vod_sync',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      // Return empty data structure instead of error
      return NextResponse.json({
        version: '1.0',
        generatedAt: new Date().toISOString(),
        stats: {
          totalMovies: 0,
          totalSeries: 0,
          totalChannels: 0,
          totalCategories: 0,
        },
        categories: [],
        movies: [],
        series: [],
        channels: [],
        moviesByCategory: {},
        seriesByCategory: {},
        channelsByCategory: {},
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // Parse snapshot data
    let data = JSON.parse(snapshot.data);
    
    // Apply profile filtering if active profile exists
    if (activeProfile) {
      data = filterByProfile(data, activeProfile);
    }
    
    // Check if client accepts gzip
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const supportsGzip = acceptEncoding.includes('gzip');
    
    // Get provider info for metadata
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true, url: true, type: true },
    });

    // Create response object
    const responseData = {
      snapshotId: snapshot.id,
      createdAt: snapshot.createdAt,
      profileFiltered: !!activeProfile,
      provider: provider ? {
        id: provider.id,
        name: provider.name,
        url: provider.url,
        type: provider.type,
      } : null,
      ...data,
    };

    // If client supports gzip, compress the response (reduces size by ~70%)
    if (supportsGzip) {
      const jsonString = JSON.stringify(responseData);
      const compressed = await gzipAsync(jsonString);
      
      return new NextResponse(compressed, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Cache-Control': activeProfile ? 'no-store' : 'public, max-age=3600',
        },
      });
    }

    // Return uncompressed
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': activeProfile ? 'no-store' : 'public, max-age=300',
        'ETag': `"${snapshot.id}-${snapshot.createdAt.getTime()}"`, // Cache busting
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching snapshot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch snapshot', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
