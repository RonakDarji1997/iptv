import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { StalkerClient } from '@/lib/stalker-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { channelIds } = await request.json();

    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      return NextResponse.json(
        { error: 'Channel IDs array is required' },
        { status: 400 }
      );
    }

    // Limit to prevent abuse
    if (channelIds.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 channels per request' },
        { status: 400 }
      );
    }

    // Get provider with credentials
    const provider = await prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
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

    if (!provider.stalkerMac || !provider.url) {
      return NextResponse.json(
        { error: 'Provider credentials not configured' },
        { status: 400 }
      );
    }

    // Look up all channels
    const channels = await prisma.channel.findMany({
      where: {
        id: { in: channelIds },
        providerId: id,
      },
      select: {
        id: true,
        externalId: true,
        name: true,
      },
    });

    if (channels.length === 0) {
      return NextResponse.json(
        { error: 'No valid channels found' },
        { status: 404 }
      );
    }

    console.log(`[EPG Bulk] Loading EPG for ${channels.length} channels from provider ${id}`);

    // Initialize Stalker client
    const stalkerClient = new StalkerClient({
      mac: provider.stalkerMac!,
      url: provider.url,
    });

    const epgResults: { [channelId: string]: any } = {};

    // Fetch EPG for all channels in parallel (with concurrency limit)
    const CONCURRENT_LIMIT = 10;
    for (let i = 0; i < channels.length; i += CONCURRENT_LIMIT) {
      const batch = channels.slice(i, i + CONCURRENT_LIMIT);
      console.log(`[EPG Bulk] Processing batch ${i / CONCURRENT_LIMIT + 1}, channels: ${batch.map(c => c.name).join(', ')}`);
      
      await Promise.all(
        batch.map(async (channel) => {
          try {
            if (!channel.externalId) {
              console.warn(`[EPG Bulk] Channel ${channel.name} has no externalId`);
              return;
            }

            // Get EPG for 3 days
            const epgData = await stalkerClient.getEpg(channel.externalId, 3);
            
            // Handle response format - EPG data is wrapped in { data: { channelId: programs[] } }
            let epgPrograms: Array<any> = [];
            
            if (Array.isArray(epgData)) {
              epgPrograms = epgData;
            } else if (typeof epgData === 'object' && epgData !== null) {
              const dataWrapper = epgData as { data?: Record<string, unknown> };
              const actualData = dataWrapper.data || epgData;
              const epgDict = actualData as Record<string, Array<any>>;
              epgPrograms = epgDict[channel.externalId] || [];
            }
            
            if (epgPrograms.length > 0) {
              // Extract current and next program
              const now = Math.floor(Date.now() / 1000);
              let currentProgram = null;
              let nextProgram = null;

              for (let i = 0; i < epgPrograms.length; i++) {
                const program = epgPrograms[i];
                const startTime = parseInt(program.time || program.start_timestamp || '0');
                const endTime = parseInt(program.time_to || program.stop_timestamp || '0');

                if (startTime <= now && now < endTime) {
                  currentProgram = program;
                  nextProgram = epgPrograms[i + 1] || null;
                  break;
                }
              }

              epgResults[channel.id] = {
                programs: epgPrograms,
                current_program: currentProgram,
                next_program: nextProgram,
              };
            }
          } catch (err) {
            console.error(`[EPG Bulk] Failed to load EPG for channel ${channel.name}:`, err);
            // Don't fail the entire request, just skip this channel
          }
        })
      );
    }

    console.log(`[EPG Bulk] Successfully loaded EPG for ${Object.keys(epgResults).length}/${channels.length} channels`);

    return NextResponse.json({
      success: true,
      epg: epgResults,
      channelsLoaded: Object.keys(epgResults).length,
    });
  } catch (error) {
    console.error('Bulk EPG error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch EPG data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
