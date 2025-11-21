import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, category, page = 1, sortBy = 'added', type = 'vod' } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const items = type === 'vod' 
      ? await client.getMovies(category || '', page)
      : await client.getSeries(category || '', page);
    
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Get VOD error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch VOD content' },
      { status: 500 }
    );
  }
}
