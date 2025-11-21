import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    const { mac, url } = await request.json();
    
    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    const result = await client.handshake();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Stalker handshake error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Handshake failed' },
      { status: 500 }
    );
  }
}
