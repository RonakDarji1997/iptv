import { NextRequest, NextResponse } from 'next/server';
import { syncProvider } from '@/lib/sync-service';

/**
 * POST /api/sync/:providerId
 * Trigger manual sync for a provider
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { providerId: string } }
) {
  try {
    const { providerId } = params;

    console.log(`[SyncAPI] Starting sync for provider ${providerId}...`);

    const result = await syncProvider(providerId);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Sync failed', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
      message: 'Sync completed successfully',
    });
  } catch (error: unknown) {
    console.error('Error syncing provider:', error);
    return NextResponse.json(
      { error: 'Failed to sync provider', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
