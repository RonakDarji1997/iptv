import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

const MAX_PROFILES = 5;

/**
 * GET /api/profiles
 * List all profiles for a user/provider
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

    const profiles = await prisma.profile.findMany({
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
      orderBy: { createdAt: 'asc' },
    });

    // Parse JSON fields and decrypt PIN
    const parsedProfiles = profiles.map((profile) => ({
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
    }));

    return NextResponse.json({ profiles: parsedProfiles });
  } catch (error: unknown) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profiles', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profiles
 * Create a new profile
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      providerId,
      name,
      avatar = '👤',
      type = 'GUEST',
      pin,
      ageRating,
      allowedCategories = [],
      blockedCategories = [],
      allowedChannels = [],
      blockedChannels = [],
    } = body;

    // Validation
    if (!userId || !name) {
      return NextResponse.json(
        { error: 'userId and name are required' },
        { status: 400 }
      );
    }

    if (!['ADMIN', 'KID', 'GUEST'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be ADMIN, KID, or GUEST' },
        { status: 400 }
      );
    }

    // Check profile limit (max 5)
    const existingCount = await prisma.profile.count({
      where: { userId, providerId: providerId || undefined },
    });

    if (existingCount >= MAX_PROFILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PROFILES} profiles allowed` },
        { status: 400 }
      );
    }

    // If provider specified, verify it exists and belongs to user
    if (providerId) {
      const provider = await prisma.provider.findFirst({
        where: { id: providerId, userId },
      });

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found or does not belong to user' },
          { status: 404 }
        );
      }
    }

    // If this is the first profile, make it active
    const isFirstProfile = existingCount === 0;

    // Create profile
    const profile = await prisma.profile.create({
      data: {
        userId,
        providerId: providerId || null,
        name,
        avatar,
        type,
        pin: pin ? encrypt(pin) : null,
        ageRating: ageRating || null,
        isActive: isFirstProfile,
        allowedCategories: JSON.stringify(allowedCategories),
        blockedCategories: JSON.stringify(blockedCategories),
        allowedChannels: JSON.stringify(allowedChannels),
        blockedChannels: JSON.stringify(blockedChannels),
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        pin: pin || null,
        allowedCategories,
        blockedCategories,
        allowedChannels,
        blockedChannels,
      },
      message: 'Profile created successfully',
    });
  } catch (error: unknown) {
    console.error('Error creating profile:', error);
    return NextResponse.json(
      { error: 'Failed to create profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
