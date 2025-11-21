import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, seriesId, seasonId, episodeId } = await request.json();
    
    if (!mac || !url || !seriesId || !seasonId || !episodeId) {
      return NextResponse.json({ error: 'MAC address, portal URL, series ID, season ID, and episode ID are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const fileInfo = await client.getSeriesFileInfo(seriesId, seasonId, episodeId);
    
    return NextResponse.json({ fileInfo });
  } catch (error) {
    console.error('Get series file info error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch file info' },
      { status: 500 }
    );
  }
}
