import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt, safeDecrypt } from '@/lib/crypto';
import { generateMAC, isValidMAC, normalizeMAC } from '@/lib/mac-generator';
import { StalkerClient } from '@/lib/stalker-client';

/**
 * GET /api/providers
 * List all providers for a user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const providers = await prisma.provider.findMany({
      where: { userId },
      include: {
        devices: {
          select: {
            id: true,
            deviceName: true,
            mac: true,
            lastActive: true,
          },
        },
        profiles: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Decrypt sensitive fields for response (use safeDecrypt for backward compatibility)
    const decryptedProviders = providers.map((provider: any) => ({
      ...provider,
      stalkerBearer: provider.stalkerBearer ? safeDecrypt(provider.stalkerBearer) : null,
      stalkerToken: provider.stalkerToken ? safeDecrypt(provider.stalkerToken) : null,
      xtreamUsername: provider.xtreamUsername ? safeDecrypt(provider.xtreamUsername) : null,
      xtreamPassword: provider.xtreamPassword ? safeDecrypt(provider.xtreamPassword) : null,
    }));

    return NextResponse.json({ providers: decryptedProviders });
  } catch (error: unknown) {
    console.error('Error fetching providers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch providers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/providers
 * Add a new provider with auto-handshake
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      type,
      name,
      url,
      // Stalker fields
      stalkerMac,
      stalkerBearer,
      stalkerAdid,
      // Xtream fields
      xtreamUsername,
      xtreamPassword,
      // M3U fields
      m3uUrl,
    } = body;

    // Validation
    if (!userId || !type || !name || !url) {
      return NextResponse.json(
        { error: 'userId, type, name, and url are required' },
        { status: 400 }
      );
    }

    if (!['STALKER', 'XTREAM', 'M3U'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be STALKER, XTREAM, or M3U' },
        { status: 400 }
      );
    }

    // Generate or validate MAC for Stalker
    let finalMac = stalkerMac;
    if (type === 'STALKER') {
      if (!stalkerBearer) {
        return NextResponse.json({ error: 'stalkerBearer is required for Stalker providers' }, { status: 400 });
      }

      if (finalMac) {
        if (!isValidMAC(finalMac)) {
          return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
        }
        finalMac = normalizeMAC(finalMac);
      } else {
        // Generate MAG-style MAC
        finalMac = generateMAC();
      }
    }

    // Perform handshake for Stalker to get token
    let token = null;
    let stbId = null;
    if (type === 'STALKER') {
      try {
        const client = new StalkerClient(url, stalkerBearer, stalkerAdid || '');
        await client.handshake(finalMac!);
        token = client.getToken();
        
        // Get profile to extract stb_id
        const profile = await client.getProfile(finalMac!);
        stbId = profile.stb_id || null;
      } catch (error: unknown) {
        console.error('Handshake failed:', error);
        return NextResponse.json(
          { error: 'Failed to handshake with provider', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }

    // Validate Xtream credentials
    if (type === 'XTREAM') {
      if (!xtreamUsername || !xtreamPassword) {
        return NextResponse.json(
          { error: 'xtreamUsername and xtreamPassword are required for Xtream providers' },
          { status: 400 }
        );
      }
    }

    // Create provider in database
    const provider = await prisma.provider.create({
      data: {
        userId,
        type,
        name,
        url,
        stalkerMac: finalMac,
        stalkerBearer: stalkerBearer ? encrypt(stalkerBearer) : null,
        stalkerToken: token ? encrypt(token) : null,
        stalkerAdid: stalkerAdid || null,
        stalkerStbId: stbId,
        xtreamUsername: xtreamUsername ? encrypt(xtreamUsername) : null,
        xtreamPassword: xtreamPassword ? encrypt(xtreamPassword) : null,
        m3uUrl,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      provider: {
        ...provider,
        stalkerBearer: stalkerBearer,
        stalkerToken: token,
        xtreamUsername,
        xtreamPassword,
      },
      message: 'Provider added successfully. Token obtained and stored.',
    });
  } catch (error: unknown) {
    console.error('Error creating provider:', error);
    return NextResponse.json(
      { error: 'Failed to create provider', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
