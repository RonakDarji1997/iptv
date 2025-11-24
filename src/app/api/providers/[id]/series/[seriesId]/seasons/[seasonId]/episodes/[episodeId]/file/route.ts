import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/providers/[id]/series/[seriesId]/seasons/[seasonId]/episodes/[episodeId]/file
 * Get file info for a series episode from database (simplified - no API call needed)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; seriesId: string; seasonId: string; episodeId: string }> }
) {
  try {
    const { id: providerId, episodeId } = await params;

    // Fetch episode from database
    const episode = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        season: {
          series: {
            providerId: providerId,
          },
        },
      },
      select: {
        id: true,
        externalId: true,
        episodeNumber: true,
        name: true,
        cmd: true,
      },
    });

    if (!episode) {
      return NextResponse.json(
        { error: 'Episode not found' },
        { status: 404 }
      );
    }

    // Extract file_id from cmd if available, otherwise use externalId as fallback
    let fileId = episode.externalId;
    if (episode.cmd) {
      // Extract file_id from cmd like "/media/file_3055341.mpg"
      const match = episode.cmd.match(/file_(\d+)\.mpg/);
      if (match && match[1]) {
        fileId = match[1];
      }
    }

    // Return file info with the cmd from database (which has correct file_id)
    const fileInfo = {
      id: fileId, // Use extracted file_id, not episode externalId
      episodeNumber: episode.episodeNumber,
      name: episode.name,
      cmd: episode.cmd || `/media/file_${episode.externalId}.mpg`,
    };

    return NextResponse.json(fileInfo);
  } catch (error: unknown) {
    console.error('Error fetching series file info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch file info', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
