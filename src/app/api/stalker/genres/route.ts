import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const genres = await client.getCategories();
    
    return NextResponse.json({ genres });
  } catch (error) {
    console.error('Get genres error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch genres' },
      { status: 500 }
    );
  }
}
