import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

/**
 * GET /api/profiles/:id
 * Get a single profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const profile = await prisma.profile.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...profile,
      pin: profile.pin ? decrypt(profile.pin) : null,
      allowedCategories: profile.allowedCategories
        ? JSON.parse(profile.allowedCategories)
        : [],
      blockedCategories: profile.blockedCategories
        ? JSON.parse(profile.blockedCategories)
        : [],
      allowedChannels: profile.allowedChannels
        ? JSON.parse(profile.allowedChannels)
        : [],
      blockedChannels: profile.blockedChannels
        ? JSON.parse(profile.blockedChannels)
        : [],
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profiles/:id
 * Update a profile
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    console.log('[PATCH /api/profiles/:id] Updating profile:', id);
    console.log('[PATCH /api/profiles/:id] Request body:', JSON.stringify(body, null, 2));

    const profile = await prisma.profile.findUnique({
      where: { id },
    });

    if (!profile) {
      console.error('[PATCH /api/profiles/:id] Profile not found:', id);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const {
      name,
      avatar,
      type,
      pin,
      ageRating,
      allowedCategories,
      blockedCategories,
      allowedChannels,
      blockedChannels,
    } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (type !== undefined) {
      if (!['ADMIN', 'KID', 'GUEST'].includes(type)) {
        return NextResponse.json(
          { error: 'type must be ADMIN, KID, or GUEST' },
          { status: 400 }
        );
      }
      updateData.type = type;
    }
    if (pin !== undefined) updateData.pin = pin ? encrypt(pin) : null;
    if (ageRating !== undefined) updateData.ageRating = ageRating;
    if (allowedCategories !== undefined)
      updateData.allowedCategories = JSON.stringify(allowedCategories);
    if (blockedCategories !== undefined)
      updateData.blockedCategories = JSON.stringify(blockedCategories);
    if (allowedChannels !== undefined)
      updateData.allowedChannels = JSON.stringify(allowedChannels);
    if (blockedChannels !== undefined)
      updateData.blockedChannels = JSON.stringify(blockedChannels);

    console.log('[PATCH /api/profiles/:id] Update data:', JSON.stringify(updateData, null, 2));

    const updatedProfile = await prisma.profile.update({
      where: { id },
      data: updateData,
    });

    console.log('[PATCH /api/profiles/:id] Profile updated successfully');

    const responseProfile = {
      ...updatedProfile,
      pin: updatedProfile.pin ? decrypt(updatedProfile.pin) : null,
      allowedCategories: updatedProfile.allowedCategories
        ? JSON.parse(updatedProfile.allowedCategories)
        : [],
      blockedCategories: updatedProfile.blockedCategories
        ? JSON.parse(updatedProfile.blockedCategories)
        : [],
      allowedChannels: updatedProfile.allowedChannels
        ? JSON.parse(updatedProfile.allowedChannels)
        : [],
      blockedChannels: updatedProfile.blockedChannels
        ? JSON.parse(updatedProfile.blockedChannels)
        : [],
    };

    return NextResponse.json({
      success: true,
      profile: responseProfile,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('[PATCH /api/profiles/:id] Error updating profile:', error);
    console.error('[PATCH /api/profiles/:id] Error details:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to update profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/profiles/:id
 * Delete a profile
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const profile = await prisma.profile.findUnique({
      where: { id },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Don't allow deleting the last profile
    const profileCount = await prisma.profile.count({
      where: { userId: profile.userId, providerId: profile.providerId },
    });

    if (profileCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last profile' },
        { status: 400 }
      );
    }

    // If deleting active profile, activate another one
    if (profile.isActive) {
      const anotherProfile = await prisma.profile.findFirst({
        where: {
          userId: profile.userId,
          providerId: profile.providerId,
          id: { not: id },
        },
      });

      if (anotherProfile) {
        await prisma.profile.update({
          where: { id: anotherProfile.id },
          data: { isActive: true },
        });
      }
    }

    await prisma.profile.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Profile deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
}
