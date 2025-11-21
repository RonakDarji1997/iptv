import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const allCategories = await client.getMovieCategories();
    
    // Filter out series categories - only return movie-related categories
    const seriesKeywords = [
      'SERIES', 'SERIALS', 'WEB_SERIES', 'TV_SERIALS',
      'ANIME', 'DOCUMENTARY', 'DRAMA', 'SHOWS',
      'KOREAN', 'DUBB', 'CELEBRITY', 'EVENTS'
    ];
    
    const movieCategories = allCategories.filter((cat: any) => {
      const combinedText = `${cat.title || ''} ${cat.alias || ''}`.toUpperCase();
      return !seriesKeywords.some(keyword => combinedText.includes(keyword));
    });
    
    return NextResponse.json({ categories: movieCategories });
  } catch (error) {
    console.error('Get movie categories error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch movie categories' },
      { status: 500 }
    );
  }
}
