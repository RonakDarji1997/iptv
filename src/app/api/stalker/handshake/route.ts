import { NextRequest, NextResponse } from 'next/server';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(request: NextRequest) {
  try {
    // Accept empty body — fall back to env vars when mac/url aren't provided in the request
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const mac = body.mac || process.env.STALKER_MAC || process.env.NEXT_PUBLIC_STALKER_MAC;
    const url = body.url || process.env.STALKER_URL || process.env.NEXT_PUBLIC_STALKER_URL;

    if (!mac || !url) {
      return NextResponse.json({ error: 'MAC address and portal URL are required (body or env)' }, { status: 400 });
    }

    const client = new StalkerClient({ mac, url });
    // client.handshake sets client.token — we return the token for convenience
    await client.handshake();

    return NextResponse.json({ token: (client as any).token });
  } catch (error) {
    console.error('Stalker handshake error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Handshake failed' },
      { status: 500 }
    );
  }
}
