import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url, cmd, type = 'itv' } = await request.json();
    
    if (!mac || !url || !cmd) {
      return NextResponse.json({ error: 'MAC address, portal URL, and cmd are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const url_result = await client.getStreamUrl(cmd, type);
    
    return NextResponse.json({ link: url_result });
  } catch (error) {
    console.error('Create link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create link' },
      { status: 500 }
    );
  }
}
