import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const categories = await client.getSeriesCategories();
    
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Get series categories error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch series categories' },
      { status: 500 }
    );
  }
}
