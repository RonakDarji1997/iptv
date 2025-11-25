import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt, safeDecrypt } from '@/lib/crypto';
import { generateMAC, isValidMAC, normalizeMAC } from '@/lib/mac-generator';
import { StalkerClient, discoverPortalUrl } from '@/lib/stalker-client';

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
    let finalBearer = stalkerBearer;
    
    if (type === 'STALKER') {
      if (finalMac) {
        if (!isValidMAC(finalMac)) {
          return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
        }
        // Keep original MAC case - don't normalize
        console.log('[Provider] Using MAC address:', finalMac);
      } else {
        // Generate MAG-style MAC
        finalMac = generateMAC();
        console.log('[Provider] Generated MAC address:', finalMac);
      }
      
      // If no Bearer provided, use MAC as Bearer (standard Stalker portals)
      if (!finalBearer) {
        console.log('[Provider] No Bearer provided, using MAC as Bearer (standard Stalker)');
        finalBearer = finalMac;
      }
    }

    // Perform handshake for Stalker to get token
    let token = null;
    let stbId = null;
    let finalUrl = url;
    
    if (type === 'STALKER') {
      // Discover actual portal URL (follow redirects)
      console.log('[Provider] Discovering actual portal URL...');
      const actualUrl = await discoverPortalUrl(url);
      if (actualUrl !== url) {
        console.log(`[Provider] 🔀 URL changed after redirect: ${url} → ${actualUrl}`);
        finalUrl = actualUrl; // Use the redirected URL for all requests
      } else {
        console.log('[Provider] ✅ No redirect, using original URL');
        finalUrl = url;
      }
      
      console.log('[Provider] Starting handshake:', { url: finalUrl, mac: finalMac, adid: stalkerAdid });
      const client = new StalkerClient(finalUrl, finalBearer, stalkerAdid || '');
      
      try {
        await client.handshake(finalMac!);
        token = client.getToken();
        
        if (!token) {
          throw new Error('Handshake succeeded but no token received');
        }
        
        console.log('[Provider] ✅ Handshake successful! Token:', token);
        
        // Use the handshake token as the permanent bearer token
        // This token will be stored in DB and used for all future requests
        finalBearer = token;
        console.log('[Provider] Using handshake token as permanent bearer token');
      } catch (error: unknown) {
        console.error('[Provider] ❌ Handshake failed:', error);
        return NextResponse.json(
          { error: 'Failed to handshake with provider', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        );
      }
      
      // Get profile (main info) - optional, some portals don't support this
      try {
        const profile = await client.getProfile(finalMac!);
        console.log('[Provider] ✅ Profile retrieved:', profile);
      } catch (profileError) {
        console.warn('[Provider] ⚠️ Profile retrieval failed (portal may not support account_info endpoint):', 
          profileError instanceof Error ? profileError.message : 'Unknown error');
        // Don't fail provider creation - profile is optional
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

    // Create provider in database (only after successful handshake for Stalker)
    const provider = await prisma.provider.create({
      data: {
        userId,
        type,
        name,
        url: finalUrl, // Use the discovered URL (after redirects)
        stalkerMac: finalMac,
        stalkerBearer: finalBearer || null,
        stalkerToken: token || null,
        stalkerAdid: stalkerAdid || null,
        stalkerStbId: stbId,
        xtreamUsername: xtreamUsername || null,
        xtreamPassword: xtreamPassword || null,
        m3uUrl,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      provider: {
        ...provider,
        stalkerBearer: finalBearer,
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
