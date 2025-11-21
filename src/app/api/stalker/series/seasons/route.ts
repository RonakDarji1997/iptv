import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, seriesId } = await request.json();
    
    if (!mac || !url || !seriesId) {
      return NextResponse.json({ error: 'MAC address, portal URL, and series ID are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const seasons = await client.getSeriesSeasons(seriesId);
    
    return NextResponse.json({ seasons });
  } catch (error) {
    console.error('Get series seasons error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch seasons' },
      { status: 500 }
    );
  }
}
