import prisma from './prisma';
import { decrypt } from './crypto';
import { StalkerClient } from './stalker-client';
import pako from 'pako';

export interface SyncResult {
  success: boolean;
  providerId: string;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  snapshotsGenerated: number;
  error?: string;
}

/**
 * Sync provider content and generate snapshots
 */
export async function syncProvider(providerId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    providerId,
    addedCount: 0,
    updatedCount: 0,
    removedCount: 0,
    snapshotsGenerated: 0,
  };

  try {
    // Fetch provider with credentials
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      include: {
        profiles: true,
      },
    });

    if (!provider || !provider.isActive) {
      result.error = 'Provider not found or inactive';
      return result;
    }

    // Only sync Stalker for now (Xtream and M3U coming later)
    if (provider.type !== 'STALKER') {
      result.error = 'Only Stalker providers are supported currently';
      return result;
    }

    // Decrypt credentials
    const bearer = provider.stalkerBearer ? decrypt(provider.stalkerBearer) : '';
    const token = provider.stalkerToken ? decrypt(provider.stalkerToken) : '';
    const mac = provider.stalkerMac || '';
    const adid = provider.stalkerAdid || '';

    if (!bearer || !mac) {
      result.error = 'Missing Stalker credentials';
      return result;
    }

    // Initialize client with stored token
    const client = new StalkerClient(provider.url, bearer, adid);
    Object.assign(client, { token: token || '', mac });

    // Fetch all categories
    console.log(`[SyncService] Fetching categories for provider ${provider.name}...`);
    
    const [channelCategories, movieCategories, seriesCategories] = await Promise.all([
      client.getCategories(),
      client.getMovieCategories(),
      client.getSeriesCategories(),
    ]);

    // Sync channel categories
    for (const cat of channelCategories) {
      await syncCategory(providerId, cat, 'CHANNEL');
      result.addedCount++;
    }

    // Sync movie categories
    for (const cat of movieCategories) {
      if (!isSeriesCategory(cat)) {
        await syncCategory(providerId, cat, 'MOVIE');
        result.addedCount++;
      }
    }

    // Sync series categories
    for (const cat of seriesCategories) {
      await syncCategory(providerId, cat, 'SERIES');
      result.addedCount++;
    }

    // Fetch and sync channels (first page only for performance)
    console.log(`[SyncService] Fetching channels...`);
    for (const cat of channelCategories) {
      const { data: channels } = await client.getChannels(cat.id, 1);
      for (const channel of channels) {
        await syncChannel(providerId, cat.id, channel);
      }
    }

    // Fetch and sync movies (metadata only, first page)
    console.log(`[SyncService] Fetching movies...`);
    for (const cat of movieCategories) {
      if (!isSeriesCategory(cat)) {
        const { data: movies } = await client.getMovies(cat.id, 1);
        for (const movie of movies) {
          await syncMovie(providerId, cat.id, movie);
        }
      }
    }

    // Fetch and sync series (metadata only)
    console.log(`[SyncService] Fetching series...`);
    for (const cat of seriesCategories) {
      const { data: seriesList } = await client.getMovies(cat.id, 1);
      for (const series of seriesList) {
        await syncSeries(providerId, cat.id, series);
      }
    }

    // Update provider lastSync
    await prisma.provider.update({
      where: { id: providerId },
      data: { lastSync: new Date() },
    });

    // Generate snapshots for each profile
    console.log(`[SyncService] Generating snapshots...`);
    for (const profile of provider.profiles) {
      await generateSnapshot(profile.id);
      result.snapshotsGenerated++;
    }

    result.success = true;
    return result;
  } catch (error: unknown) {
    console.error('[SyncService] Sync failed:', error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

function isSeriesCategory(cat: any): boolean {
  const seriesKeywords = ['SERIES', 'SERIALS', 'WEB_SERIES', 'TV_SERIALS', 'ANIME', 'DOCUMENTARY', 'DRAMA', 'SHOWS', 'KOREAN', 'DUBB'];
  const combinedText = `${cat.title} ${cat.alias}`.toUpperCase();
  return seriesKeywords.some((keyword) => combinedText.includes(keyword));
}

async function syncCategory(providerId: string, cat: any, type: 'CHANNEL' | 'MOVIE' | 'SERIES') {
  await prisma.category.upsert({
    where: {
      providerId_externalId: {
        providerId,
        externalId: cat.id.toString(),
      },
    },
    create: {
      providerId,
      externalId: cat.id.toString(),
      name: cat.title || cat.name,
      type,
    },
    update: {
      name: cat.title || cat.name,
      updatedAt: new Date(),
    },
  });
}

async function syncChannel(providerId: string, categoryId: string, channel: any) {
  const category = await prisma.category.findUnique({
    where: {
      providerId_externalId: {
        providerId,
        externalId: categoryId,
      },
    },
  });

  await prisma.channel.upsert({
    where: {
      providerId_externalId: {
        providerId,
        externalId: channel.id.toString(),
      },
    },
    create: {
      providerId,
      categoryId: category?.id,
      externalId: channel.id.toString(),
      name: channel.name,
      number: channel.number || null,
      logo: channel.logo || null,
      cmd: channel.cmd || null,
    },
    update: {
      name: channel.name,
      number: channel.number || null,
      logo: channel.logo || null,
      cmd: channel.cmd || null,
      updatedAt: new Date(),
    },
  });
}

async function syncMovie(providerId: string, categoryId: string, movie: any) {
  const category = await prisma.category.findUnique({
    where: {
      providerId_externalId: {
        providerId,
        externalId: categoryId,
      },
    },
  });

  await prisma.movie.upsert({
    where: {
      providerId_externalId: {
        providerId,
        externalId: movie.id.toString(),
      },
    },
    create: {
      providerId,
      categoryId: category?.id,
      externalId: movie.id.toString(),
      name: movie.name,
      description: movie.description || movie.o_name || null,
      year: movie.year ? parseInt(movie.year) : null,
      rating: movie.rating_imdb ? parseFloat(movie.rating_imdb) : null,
      ageRating: movie.age || null,
      duration: movie.duration ? parseInt(movie.duration) : null,
      poster: movie.screenshot_uri || movie.cover || null,
      backdrop: movie.screenshot_uri || null,
      cmd: movie.cmd || null,
    },
    update: {
      name: movie.name,
      description: movie.description || movie.o_name || null,
      year: movie.year ? parseInt(movie.year) : null,
      rating: movie.rating_imdb ? parseFloat(movie.rating_imdb) : null,
      ageRating: movie.age || null,
      duration: movie.duration ? parseInt(movie.duration) : null,
      poster: movie.screenshot_uri || movie.cover || null,
      backdrop: movie.screenshot_uri || null,
      cmd: movie.cmd || null,
      updatedAt: new Date(),
    },
  });
}

async function syncSeries(providerId: string, categoryId: string, series: any) {
  const category = await prisma.category.findUnique({
    where: {
      providerId_externalId: {
        providerId,
        externalId: categoryId,
      },
    },
  });

  await prisma.series.upsert({
    where: {
      providerId_externalId: {
        providerId,
        externalId: series.id.toString(),
      },
    },
    create: {
      providerId,
      categoryId: category?.id,
      externalId: series.id.toString(),
      name: series.name,
      description: series.description || series.o_name || null,
      year: series.year ? parseInt(series.year) : null,
      rating: series.rating_imdb ? parseFloat(series.rating_imdb) : null,
      ageRating: series.age || null,
      poster: series.screenshot_uri || series.cover || null,
      backdrop: series.screenshot_uri || null,
    },
    update: {
      name: series.name,
      description: series.description || series.o_name || null,
      year: series.year ? parseInt(series.year) : null,
      rating: series.rating_imdb ? parseFloat(series.rating_imdb) : null,
      ageRating: series.age || null,
      poster: series.screenshot_uri || series.cover || null,
      backdrop: series.screenshot_uri || null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Generate snapshot for a profile
 */
export async function generateSnapshot(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { provider: true },
  });

  if (!profile) {
    throw new Error('Profile not found');
  }

  // Get latest snapshot version
  const latestSnapshot = await prisma.snapshot.findFirst({
    where: { profileId },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latestSnapshot?.version || 0) + 1;

  // Fetch content with age filtering
  const where: any = {
    providerId: profile.providerId,
    isActive: true,
  };

  // Apply age rating filter for KID profiles
  if (profile.type === 'KID' && profile.ageRating) {
    where.OR = [
      { ageRating: null },
      { ageRating: { lte: profile.ageRating.toString() } },
    ];
  }

  const [categories, channels, movies, series] = await Promise.all([
    prisma.category.findMany({ where: { providerId: profile.providerId } }),
    prisma.channel.findMany({ where }),
    prisma.movie.findMany({ where }),
    prisma.series.findMany({ where, include: { seasons: true } }),
  ]);

  // Build snapshot data
  const snapshotData = {
    version: nextVersion,
    profile: {
      id: profile.id,
      name: profile.name,
      type: profile.type,
    },
    categories: categories.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      name: c.name,
      type: c.type,
    })),
    channels: channels.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      categoryId: c.categoryId,
      name: c.name,
      number: c.number,
      logo: c.logo,
      cmd: c.cmd,
    })),
    movies: movies.map((m) => ({
      id: m.id,
      externalId: m.externalId,
      categoryId: m.categoryId,
      name: m.name,
      year: m.year,
      rating: m.rating,
      ageRating: m.ageRating,
      poster: m.poster,
      cmd: m.cmd,
    })),
    series: series.map((s) => ({
      id: s.id,
      externalId: s.externalId,
      categoryId: s.categoryId,
      name: s.name,
      year: s.year,
      rating: s.rating,
      ageRating: s.ageRating,
      poster: s.poster,
      seasonCount: s.seasons.length,
    })),
  };

  // Compress snapshot (gzip)
  const jsonString = JSON.stringify(snapshotData);
  const compressed = pako.gzip(jsonString);
  const base64Compressed = Buffer.from(compressed).toString('base64');

  // Save snapshot
  await prisma.snapshot.create({
    data: {
      profileId,
      providerId: profile.providerId,
      version: nextVersion,
      data: base64Compressed,
    },
  });

  console.log(`[SyncService] Snapshot v${nextVersion} generated for profile ${profile.name}`);
}
