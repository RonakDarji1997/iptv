import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { StalkerClient } from '@/lib/stalker-client';
import { safeDecrypt } from '@/lib/crypto';

/**
 * GET /api/providers/[id]/series/[seriesId]/seasons/[seasonId]/episodes
 * Get episodes for a season using provider credentials from database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; seriesId: string; seasonId: string }> }
) {
  try {
    const { id: providerId, seriesId, seasonId } = await params;

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

    // Fetch provider with credentials
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
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

    if (provider.type !== 'STALKER') {
      return NextResponse.json(
        { error: 'Only Stalker providers are supported' },
        { status: 400 }
      );
    }

    // Decrypt credentials
    const bearer = provider.stalkerBearer ? safeDecrypt(provider.stalkerBearer) : '';
    const adid = provider.stalkerAdid || '';
    const mac = provider.stalkerMac;

    if (!mac) {
      return NextResponse.json(
        { error: 'Missing MAC address' },
        { status: 400 }
      );
    }

    // Initialize client with credentials
    const client = new StalkerClient(provider.url, bearer, adid);
    Object.assign(client, { token: '', mac });

    // Get episodes
    const result = await client.getSeriesEpisodes(seriesId, seasonId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error fetching series episodes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch episodes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
