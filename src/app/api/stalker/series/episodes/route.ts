import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, seriesId, seasonId, page = 1 } = await request.json();
    
    if (!mac || !url || !seriesId || !seasonId) {
      return NextResponse.json({ error: 'MAC address, portal URL, series ID, and season ID are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const episodes = await client.getSeriesEpisodes(seriesId, seasonId, page);
    
    return NextResponse.json(episodes);
  } catch (error) {
    console.error('Get series episodes error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch episodes' },
      { status: 500 }
    );
  }
}
