import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { StalkerClient } from '@/lib/stalker-client';

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

    const { channelId } = await request.json();

    if (!channelId) {
      return NextResponse.json(
        { error: 'Channel ID is required' },
        { status: 400 }
      );
    }

    // Get provider with credentials
    const provider = await prisma.provider.findUnique({
      where: {
        id,
      },
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

    // Look up the channel to get its externalId (Stalker channel ID)
    const channel = await prisma.channel.findUnique({
      where: {
        id: channelId,
      },
      select: {
        externalId: true,
        name: true,
      },
    });

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    const stalkerChannelId = channel.externalId;
    console.log('[EPG API] Channel lookup:', {
      uuid: channelId,
      stalkerChannelId,
      name: channel.name,
    });

    // Create Stalker client and fetch EPG
    const client = new StalkerClient({
      mac: provider.stalkerMac,
      url: provider.url,
    });

    // Get EPG for 4 days (period=4) using the Stalker channel ID
    const epgData = await client.getEpg(stalkerChannelId, 4);

    console.log('[EPG API] ========== EPG DEBUG ==========');
    console.log('[EPG API] Stalker Channel ID:', stalkerChannelId);
    console.log('[EPG API] Raw EPG data type:', typeof epgData);
    console.log('[EPG API] Is array?', Array.isArray(epgData));
    
    // Handle response format - EPG data is wrapped in { data: { channelId: programs[] } }
    let epgPrograms: Array<{
      id: string;
      time: string;
      time_to: string;
      name: string;
      descr?: string;
      duration?: string;
      category?: string;
    }> = [];
    
    if (Array.isArray(epgData)) {
      // If it's already an array, use it directly
      epgPrograms = epgData;
      console.log('[EPG API] Using array format, programs:', epgPrograms.length);
    } else if (typeof epgData === 'object' && epgData !== null) {
      // Check if data is wrapped in a 'data' key
      const dataWrapper = epgData as { data?: Record<string, unknown> };
      const actualData = dataWrapper.data || epgData;
      
      // Now get programs for the specific channel
      const epgDict = actualData as Record<string, typeof epgPrograms>;
      epgPrograms = epgDict[stalkerChannelId] || [];
      console.log('[EPG API] Extracted programs for Stalker channel ID', stalkerChannelId, ':', epgPrograms.length);
      
      if (epgPrograms.length > 0) {
        console.log('[EPG API] First program:', JSON.stringify(epgPrograms[0], null, 2));
      } else {
        // Debug: show what keys exist
        const availableKeys = Object.keys(actualData);
        console.log('[EPG API] Available channel IDs in response:', availableKeys.slice(0, 10));
      }
    }
    console.log('[EPG API] ===================================');

    // Extract current and next program from the full EPG list
    const now = Math.floor(Date.now() / 1000);
    let currentProgram = null;
    let nextProgram = null;

    console.log('[EPG API] Current timestamp:', now, new Date(now * 1000).toISOString());

    for (let i = 0; i < epgPrograms.length; i++) {
      const program = epgPrograms[i] as typeof epgPrograms[0] & {
        start_timestamp?: string;
        stop_timestamp?: string;
        actor?: string;
        director?: string;
      };
      
      // Use start_timestamp and stop_timestamp fields if available, otherwise parse time strings
      let startTime: number;
      let endTime: number;
      
      if (program.start_timestamp && program.stop_timestamp) {
        startTime = parseInt(program.start_timestamp);
        endTime = parseInt(program.stop_timestamp);
      } else {
        // Fallback to parsing time strings
        startTime = parseInt(program.time);
        endTime = parseInt(program.time_to);
      }

      console.log(`[EPG API] Program ${i}: ${program.name}, start: ${startTime}, end: ${endTime}, isCurrent: ${startTime <= now && now < endTime}`);

      // Current program: now is between start and end time
      if (startTime <= now && now < endTime) {
        currentProgram = program;
        // Next program is the one after current
        if (i + 1 < epgPrograms.length) {
          nextProgram = epgPrograms[i + 1];
        }
        console.log('[EPG API] ✓ Found current program:', program.name);
        break;
      }
      // If we haven't found current yet and this program is in the future
      if (startTime > now && !nextProgram) {
        nextProgram = program;
        console.log('[EPG API] ✓ Found next program:', program.name);
        break;
      }
    }

    const epg = {
      current_program: currentProgram,
      next_program: nextProgram,
      programs: epgPrograms, // Include full program list for timeline display
    };

    console.log('[EPG API] Returning EPG:', {
      hasCurrent: !!currentProgram,
      hasNext: !!nextProgram,
      currentName: currentProgram?.name,
      nextName: nextProgram?.name,
      totalPrograms: epgPrograms.length,
    });

    return NextResponse.json({ epg });
  } catch (error) {
    console.error('Get EPG error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch EPG' },
      { status: 500 }
    );
  }
}
