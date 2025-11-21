import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, cmd, type = 'itv', episodeNumber } = await request.json();
    
    if (!mac || !url || !cmd) {
      return NextResponse.json({ error: 'MAC address, portal URL, and cmd are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const streamUrl = await client.getStreamUrl(cmd, type, episodeNumber);
    
    return NextResponse.json({ url: streamUrl });
  } catch (error) {
    console.error('Get stream URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get stream URL' },
      { status: 500 }
    );
  }
}
