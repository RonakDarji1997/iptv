import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, genre, page = 1, sortBy = 'name' } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const channels = await client.getChannels(genre || '', page);
    
    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Get channels error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch channels' },
      { status: 500 }
    );
  }
}
