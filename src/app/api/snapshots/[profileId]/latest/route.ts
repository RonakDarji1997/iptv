import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import pako from 'pako';

/**
 * GET /api/snapshots/:profileId/latest
 * Get the latest snapshot for a profile (for TV apps)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { profileId: string } }
) {
  try {
    const { profileId } = params;

    // Get latest snapshot
    const snapshot = await prisma.snapshot.findFirst({
      where: { profileId },
      orderBy: { version: 'desc' },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: 'No snapshot found for this profile' },
        { status: 404 }
      );
    }

    // Decompress snapshot data
    const compressed = Buffer.from(snapshot.data, 'base64');
    const decompressed = pako.ungzip(compressed, { to: 'string' });
    const snapshotData = JSON.parse(decompressed);

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        createdAt: snapshot.createdAt,
        profile: snapshot.profile,
        data: snapshotData,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshot', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
