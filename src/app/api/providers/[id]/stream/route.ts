import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { StalkerClient } from '@/lib/stalker-client';
import { verifyToken } from '@/lib/jwt';

/**
 * POST /api/providers/[id]/stream
 * Get stream URL for a channel/VOD using provider credentials from database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15+)
    const { id } = await params;

    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { cmd, contentType = 'itv', episodeNumber } = body;

    if (!cmd) {
      return NextResponse.json(
        { error: 'cmd is required' },
        { status: 400 }
      );
    }

    // Fetch provider with credentials
    const provider = await prisma.provider.findUnique({
      where: { id },
    });

    if (!provider || !provider.isActive) {
      return NextResponse.json(
        { error: 'Provider not found or inactive' },
        { status: 404 }
      );
    }

    // Verify user owns this provider
    if (provider.userId !== decoded.userId) {
      return NextResponse.json(
        { error: 'Unauthorized access to provider' },
        { status: 403 }
      );
    }

    let streamUrl: string;

    if (provider.type === 'STALKER') {
      // Try to decrypt credentials, fallback to plain text if decryption fails
      let bearer = '';
      let token = '';
      
      try {
        bearer = provider.stalkerBearer ? decrypt(provider.stalkerBearer) : '';
      } catch {
        // If decryption fails, assume it's plain text
        console.log('Using plain text bearer (not encrypted)');
        bearer = provider.stalkerBearer || '';
      }

      try {
        token = provider.stalkerToken ? decrypt(provider.stalkerToken) : '';
      } catch {
        // If decryption fails, assume it's plain text
        console.log('Using plain text token (not encrypted)');
        token = provider.stalkerToken || '';
      }

      const adid = provider.stalkerAdid || '';
      const sn = provider.stalkerSn || undefined;
      const mac = provider.stalkerMac;

      if (!mac) {
        return NextResponse.json(
          { error: 'Missing MAC address' },
          { status: 400 }
        );
      }

      // Log credentials for debugging
      console.log('[Stream] Provider credentials:', {
        url: provider.url,
        mac,
        hasBearer: !!bearer,
        hasToken: !!token,
        adid: adid || 'empty',
        sn: sn || 'default',
        cmd,
        contentType,
      });

      // Return a proxy URL that will regenerate fresh stream URL on each request
      // This avoids token expiration issues
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2005';
      const proxiedUrl = `${baseUrl}/api/providers/${id}/stream-proxy?cmd=${encodeURIComponent(cmd)}&type=${contentType}${episodeNumber ? `&episode=${episodeNumber}` : ''}`;
      console.log('[Stream] Returning proxied stream URL:', proxiedUrl);
      
      streamUrl = proxiedUrl;
    } else if (provider.type === 'XTREAM') {
      // TODO: Implement Xtream URL generation
      // For now, use cmd as direct URL
      streamUrl = cmd;
    } else {
      // M3U - direct URL
      streamUrl = cmd;
    }

    return NextResponse.json({
      success: true,
      streamUrl,
      contentType,
    });
  } catch (error: unknown) {
    console.error('Error generating stream URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate stream URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
