import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, channelId } = await request.json();
    
    if (!mac || !url || !channelId) {
      return NextResponse.json({ error: 'MAC address, portal URL, and channel ID are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const epg = await client.getShortEpg(channelId);
    
    return NextResponse.json({ epg });
  } catch (error) {
    console.error('Get EPG error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch EPG' },
      { status: 500 }
    );
  }
}
