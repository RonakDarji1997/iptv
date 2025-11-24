import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

/**
 * GET /api/devices
 * List all devices for a user/provider
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const providerId = searchParams.get('providerId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const where: { userId: string; providerId?: string } = { userId };
    if (providerId) {
      where.providerId = providerId;
    }

    const devices = await prisma.device.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { lastActive: 'desc' },
    });

    // Decrypt tokens
    const decryptedDevices = devices.map((device) => ({
      ...device,
      token: device.token ? decrypt(device.token) : null,
    }));

    return NextResponse.json({ devices: decryptedDevices });
  } catch (error: unknown) {
    console.error('Error fetching devices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch devices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/devices
 * Register a new device
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, providerId, deviceName, mac, token, stbId } = body;

    if (!userId || !providerId || !deviceName || !mac) {
      return NextResponse.json(
        { error: 'userId, providerId, deviceName, and mac are required' },
        { status: 400 }
      );
    }

    // Verify provider belongs to user
    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        userId,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found or does not belong to user' },
        { status: 404 }
      );
    }

    // Create device
    const device = await prisma.device.create({
      data: {
        userId,
        providerId,
        deviceName,
        mac,
        token: token ? encrypt(token) : null,
        stbId,
        lastActive: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      device: {
        ...device,
        token: token,
      },
      message: 'Device registered successfully',
    });
  } catch (error: unknown) {
    console.error('Error registering device:', error);
    return NextResponse.json(
      { error: 'Failed to register device', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
