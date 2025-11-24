import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * DELETE /api/providers/[id]/clean
 * Deletes all VOD data (movies, series, categories, sync jobs, snapshots) for a provider
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: providerId } = await params;

    console.log(`[Clean] Starting cleanup for provider ${providerId}`);

    // Delete in correct order (respecting foreign keys)
    const [snapshots, syncJobs, movies, series, categories, channels] = await Promise.all([
      prisma.snapshot.deleteMany({ where: { providerId } }),
      prisma.syncJob.deleteMany({ where: { providerId } }),
      prisma.movie.deleteMany({ where: { providerId } }),
      prisma.series.deleteMany({ where: { providerId } }),
      prisma.category.deleteMany({ where: { providerId } }),
      prisma.channel.deleteMany({ where: { providerId } }),
    ]);

    console.log(`[Clean] ✅ Deleted: ${snapshots.count} snapshots, ${syncJobs.count} sync jobs, ${movies.count} movies, ${series.count} series, ${categories.count} categories, ${channels.count} channels`);

    return NextResponse.json({
      message: 'Database cleaned successfully',
      deleted: {
        snapshots: snapshots.count,
        syncJobs: syncJobs.count,
        movies: movies.count,
        series: series.count,
        categories: categories.count,
        channels: channels.count,
      },
    });
  } catch (error) {
    console.error('[Clean] ❌ Error:', error);
    return NextResponse.json(
      { error: 'Failed to clean database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
