import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { isValidMAC, normalizeMAC } from '@/lib/mac-generator';
import { StalkerClient } from '@/lib/stalker-client';

/**
 * GET /api/providers/:id
 * Get a single provider by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const provider = await prisma.provider.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        stalkerMac: true,
        isActive: true,
        lastSync: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      url: provider.url,
      mac: provider.stalkerMac,
      isActive: provider.isActive,
      lastSync: provider.lastSync,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching provider:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provider' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/providers/:id
 * Update provider details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const provider = await prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const {
      name,
      url,
      stalkerMac,
      stalkerBearer,
      stalkerAdid,
      xtreamUsername,
      xtreamPassword,
      m3uUrl,
      isActive,
    } = body;

    // Validate MAC if provided
    let finalMac = stalkerMac;
    if (stalkerMac && provider.type === 'STALKER') {
      if (!isValidMAC(stalkerMac)) {
        return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
      }
      finalMac = normalizeMAC(stalkerMac);
    }

    // Re-handshake if credentials changed for Stalker
    let newToken = null;
    let newStbId = null;
    if (
      provider.type === 'STALKER' &&
      (stalkerBearer || stalkerMac || url)
    ) {
      const updatedUrl = url || provider.url;
      const updatedBearer = stalkerBearer || (provider.stalkerBearer ? decrypt(provider.stalkerBearer) : '');
      const updatedMac = finalMac || provider.stalkerMac;
      const updatedAdid = stalkerAdid || provider.stalkerAdid || '';

      try {
        const client = new StalkerClient(updatedUrl, updatedBearer, updatedAdid);
        await client.handshake(updatedMac!);
        newToken = client.getToken();
        
        const profile = await client.getProfile(updatedMac!);
        newStbId = profile.stb_id || null;
      } catch (error: unknown) {
        console.error('Re-handshake failed:', error);
        return NextResponse.json(
          { error: 'Failed to re-handshake with provider', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }

    // Update provider
    const updatedProvider = await prisma.provider.update({
      where: { id },
      data: {
        name: name || provider.name,
        url: url || provider.url,
        stalkerMac: finalMac || provider.stalkerMac,
        stalkerBearer: stalkerBearer ? encrypt(stalkerBearer) : provider.stalkerBearer,
        stalkerToken: newToken ? encrypt(newToken) : provider.stalkerToken,
        stalkerAdid: stalkerAdid || provider.stalkerAdid,
        stalkerStbId: newStbId || provider.stalkerStbId,
        xtreamUsername: xtreamUsername ? encrypt(xtreamUsername) : provider.xtreamUsername,
        xtreamPassword: xtreamPassword ? encrypt(xtreamPassword) : provider.xtreamPassword,
        m3uUrl: m3uUrl || provider.m3uUrl,
        isActive: isActive !== undefined ? isActive : provider.isActive,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      provider: {
        ...updatedProvider,
        stalkerBearer: updatedProvider.stalkerBearer ? decrypt(updatedProvider.stalkerBearer) : null,
        stalkerToken: updatedProvider.stalkerToken ? decrypt(updatedProvider.stalkerToken) : null,
        xtreamUsername: updatedProvider.xtreamUsername ? decrypt(updatedProvider.xtreamUsername) : null,
        xtreamPassword: updatedProvider.xtreamPassword ? decrypt(updatedProvider.xtreamPassword) : null,
      },
      message: newToken ? 'Provider updated and re-handshaked successfully' : 'Provider updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating provider:', error);
    return NextResponse.json(
      { error: 'Failed to update provider', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/providers/:id
 * Delete a provider (cascade deletes devices, profiles, snapshots, content)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const provider = await prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    await prisma.provider.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Provider deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting provider:', error);
    return NextResponse.json(
      { error: 'Failed to delete provider', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
