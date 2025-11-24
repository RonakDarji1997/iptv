import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { StalkerClient } from '@/lib/stalker-client';

/**
 * POST /api/stream/link
 * Generate streaming URL for content with token/MAC validation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, contentType, contentId, cmd, episodeNumber } = body;

    if (!deviceId || !contentType || !cmd) {
      return NextResponse.json(
        { error: 'deviceId, contentType, and cmd are required' },
        { status: 400 }
      );
    }

    // Fetch device with provider info
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        provider: true,
      },
    });

    if (!device || !device.provider.isActive) {
      return NextResponse.json(
        { error: 'Device or provider not found or inactive' },
        { status: 404 }
      );
    }

    // Update device last active
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastActive: new Date() },
    });

    // Generate stream link based on provider type
    let streamUrl: string;

    if (device.provider.type === 'STALKER') {
      // Decrypt credentials
      const bearer = device.provider.stalkerBearer ? decrypt(device.provider.stalkerBearer) : '';
      const token = device.token ? decrypt(device.token) : '';
      const adid = device.provider.stalkerAdid || '';

      if (!bearer || !token) {
        return NextResponse.json(
          { error: 'Missing Stalker credentials' },
          { status: 400 }
        );
      }

      // Initialize client with token
      const client = new StalkerClient(device.provider.url, bearer, adid);
      (client as any).token = token;
      (client as any).mac = device.mac;

      // Get stream URL
      streamUrl = await client.getStreamUrl(cmd, contentType, episodeNumber);
    } else if (device.provider.type === 'XTREAM') {
      // TODO: Implement Xtream URL generation
      streamUrl = cmd;
    } else {
      // M3U - direct URL
      streamUrl = cmd;
    }

    return NextResponse.json({
      success: true,
      streamUrl,
      contentType,
      contentId,
    });
  } catch (error: unknown) {
    console.error('Error generating stream link:', error);
    return NextResponse.json(
      { error: 'Failed to generate stream link', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
