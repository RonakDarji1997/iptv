import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, query, page = 1 } = await request.json();
    
    if (!mac || !url || !query) {
      return NextResponse.json({ error: 'MAC address, portal URL, and search query are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const results = await client.searchContent(query, page);
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
