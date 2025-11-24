import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/profiles/:id/switch
 * Switch to a different profile (set as active)
 */
export async function POST(
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

    // Deactivate all other profiles for this user/provider
    await prisma.profile.updateMany({
      where: {
        userId: profile.userId,
        providerId: profile.providerId,
        id: { not: id },
      },
      data: { isActive: false },
    });

    // Activate the selected profile
    const updatedProfile = await prisma.profile.update({
      where: { id },
      data: { isActive: true },
    });

    return NextResponse.json({
      success: true,
      profile: {
        ...updatedProfile,
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
      },
      message: 'Profile switched successfully',
    });
  } catch (error) {
    console.error('Error switching profile:', error);
    return NextResponse.json(
      { error: 'Failed to switch profile' },
      { status: 500 }
    );
  }
}
