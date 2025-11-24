import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * DELETE /api/providers/[id]/sync
 * Stops/cancels an active sync job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: providerId } = await params;

    console.log(`[Sync] Stopping sync for provider ${providerId}`);

    // Find and cancel active sync job
    const activeJob = await prisma.syncJob.findFirst({
      where: { providerId, status: 'processing' },
    });

    if (!activeJob) {
      return NextResponse.json({ error: 'No active sync job found' }, { status: 404 });
    }

    // Mark as cancelled
    await prisma.syncJob.update({
      where: { id: activeJob.id },
      data: {
        status: 'failed',
        error: 'Cancelled by user',
        completedAt: new Date(),
      },
    });

    console.log(`[Sync] ✅ Cancelled sync job: ${activeJob.id}`);

    return NextResponse.json({
      message: 'Sync cancelled successfully',
      jobId: activeJob.id,
    });
  } catch (error) {
    console.error('[Sync] ❌ Error cancelling sync:', error);
    return NextResponse.json(
      { error: 'Failed to cancel sync', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
