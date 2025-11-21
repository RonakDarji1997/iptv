import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, movieId } = await request.json();
    
    if (!mac || !url || !movieId) {
      return NextResponse.json({ error: 'MAC address, portal URL, and movie ID are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const fileInfo = await client.getMovieInfo(movieId);
    
    return NextResponse.json({ fileInfo });
  } catch (error) {
    console.error('Get movie info error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch movie info' },
      { status: 500 }
    );
  }
}
