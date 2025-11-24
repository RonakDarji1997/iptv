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
    const profile = await client.getProfile();

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}
