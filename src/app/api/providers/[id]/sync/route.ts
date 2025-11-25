import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { StalkerClient } from '@/lib/stalker-client';
import { safeDecrypt } from '@/lib/crypto';

/**
 * POST /api/providers/[providerId]/sync
 * Sync all VOD content from Stalker portal
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: providerId } = await params;

    // Get provider from database
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    if (provider.type !== 'STALKER') {
      return NextResponse.json({ error: 'Only Stalker providers are supported' }, { status: 400 });
    }

    // Decrypt credentials
    const bearer = provider.stalkerBearer ? safeDecrypt(provider.stalkerBearer) : '';
    const token = provider.stalkerToken ? safeDecrypt(provider.stalkerToken) : '';
    const adid = provider.stalkerAdid || '';
    const mac = provider.stalkerMac || '';

    if (!bearer || !mac) {
      return NextResponse.json({ error: 'Provider missing credentials' }, { status: 400 });
    }

    // Check for existing active sync job
    const existingJob = await prisma.syncJob.findFirst({
      where: {
        providerId,
        status: 'processing',
      },
    });

    if (existingJob) {
      return NextResponse.json({
        message: 'Sync already in progress',
        providerId,
        jobId: existingJob.id,
        status: 'processing',
      });
    }

    // Initialize Stalker client
    const client = new StalkerClient(provider.url, bearer, adid);
    Object.assign(client, { mac });

    // Perform fresh handshake to get a new token (tokens expire quickly)
    console.log(`[Sync] Performing fresh handshake for provider ${providerId}...`);
    try {
      await client.handshake();
      console.log(`[Sync] ✅ Fresh handshake successful`);
    } catch (error) {
      console.error(`[Sync] ❌ Handshake failed:`, error);
      return NextResponse.json({ 
        error: 'Failed to authenticate with provider', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 401 });
    }

    // Get sync mode from query parameter (default: auto)
    const { searchParams } = new URL(request.url);
    const syncMode = searchParams.get('mode') || 'auto'; // 'full', 'incremental', or 'auto'

    // Check what content exists in the database
    const [movieCount, seriesCount, channelCount] = await Promise.all([
      prisma.movie.count({ where: { providerId } }),
      prisma.series.count({ where: { providerId } }),
      prisma.channel.count({ where: { providerId } }),
    ]);

    const existingVodCount = movieCount + seriesCount;
    
    // Determine sync mode based on parameter or smart detection
    let isIncrementalSync: boolean;
    let isFirstFullSync: boolean;
    
    if (syncMode === 'full') {
      // Force full sync regardless of existing data
      isIncrementalSync = false;
      isFirstFullSync = !provider.firstFullSyncCompleted;
      console.log(`[Sync] Mode: FORCED FULL SYNC (mode=full parameter)`);
    } else if (syncMode === 'incremental') {
      // Force incremental sync
      isIncrementalSync = true;
      isFirstFullSync = false;
      console.log(`[Sync] Mode: FORCED INCREMENTAL SYNC (mode=incremental parameter)`);
    } else {
      // Auto mode: smart detection
      isFirstFullSync = !provider.firstFullSyncCompleted;
      isIncrementalSync = existingVodCount > 0 && !isFirstFullSync;
      console.log(`[Sync] Mode: AUTO (smart detection)`);
    }
    const needsChannelSync = channelCount === 0;
    const needsVodSync = existingVodCount === 0 || isIncrementalSync || isFirstFullSync;

    console.log(`[Sync] Database check - Movies: ${movieCount}, Series: ${seriesCount}, Channels: ${channelCount}, FirstFullSync: ${provider.firstFullSyncCompleted ? 'YES' : 'NO'}`);
    console.log(`[Sync] Sync plan - VOD: ${needsVodSync ? (isIncrementalSync ? 'INCREMENTAL' : isFirstFullSync ? 'FULL (RESUME)' : 'FULL') : 'SKIP'}, Channels: ${needsChannelSync ? 'FULL' : 'SKIP'}`);

    // Create sync job for tracking
    const syncJob = await prisma.syncJob.create({
      data: {
        providerId,
        status: 'processing',
        totalItems: 0,
        processedItems: 0,
        moviesCount: 0,
        seriesCount: 0,
        channelsCount: 0, // Track channels progress
      },
    });

    // Start background sync job (runs independently)
    // This will sync both VOD and channels based on what's missing
    performSmartSync(
      providerId, 
      provider.url, 
      client, 
      syncJob.id, 
      { needsVodSync, needsChannelSync, isIncrementalSync, isFirstFullSync: !provider.firstFullSyncCompleted }
    ).catch(async (error) => {
      console.error(`[Sync] ❌ Background sync FAILED for provider ${providerId}:`, error);
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      message: 'Sync started',
      providerId,
      jobId: syncJob.id,
      status: 'processing',
    });
  } catch (error: unknown) {
    console.error('Error starting sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Smart sync orchestrator - syncs VOD and/or channels based on what's missing
 */
async function performSmartSync(
  providerId: string,
  providerUrl: string,
  client: StalkerClient,
  jobId: string,
  options: { needsVodSync: boolean; needsChannelSync: boolean; isIncrementalSync: boolean; isFirstFullSync: boolean }
) {
  const { needsVodSync, needsChannelSync, isIncrementalSync, isFirstFullSync } = options;

  try {
    // Sync channels first if needed (faster, less data)
    if (needsChannelSync) {
      console.log(`[SmartSync] Starting channel sync for provider ${providerId}`);
      await syncChannelContent(providerId, providerUrl, client, jobId);
      console.log(`[SmartSync] ✅ Channel sync completed`);
    }

    // Then sync VOD if needed
    if (needsVodSync) {
      console.log(`[SmartSync] Starting ${isIncrementalSync ? 'incremental' : isFirstFullSync ? 'full (resume)' : 'full'} VOD sync for provider ${providerId}`);
      const syncCompleted = await syncVodContent(providerId, providerUrl, client, jobId, isIncrementalSync);
      console.log(`[SmartSync] ✅ VOD sync completed`);
      
      // Mark first full sync as completed (only if it was a full sync that finished successfully)
      if (isFirstFullSync && syncCompleted) {
        await prisma.provider.update({
          where: { id: providerId },
          data: { firstFullSyncCompleted: true },
        });
        console.log(`[SmartSync] ✅ First full sync completed flag set`);
      }
    }

    // Mark job as completed
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    console.log(`[SmartSync] ✅ All sync operations completed for provider ${providerId}`);
  } catch (error) {
    console.error(`[SmartSync] ❌ Sync failed:`, error);
    throw error;
  }
}

/**
 * Sync live TV channels from ITV genres
 */
async function syncChannelContent(
  providerId: string,
  providerUrl: string,
  client: StalkerClient,
  jobId: string
) {
  console.log(`[ChannelSync] Starting channel sync`);

  // Fetch ITV genres (channel categories)
  const genres = await client.getCategories();
  console.log(`[ChannelSync] Found ${genres.length} ITV genres`);

  // Store genres as CHANNEL categories
  const categoryMap = new Map<string, string>();
  for (const genre of genres) {
    const dbCategory = await prisma.category.upsert({
      where: {
        providerId_externalId: {
          providerId,
          externalId: genre.id,
        },
      },
      update: { name: genre.title },
      create: {
        providerId,
        externalId: genre.id,
        name: genre.title,
        type: 'CHANNEL',
      },
    });
    categoryMap.set(genre.id, dbCategory.id);
  }

  // Get total channel count
  const firstPage = await client.getChannels('*', 1);
  const totalChannels = firstPage.total;
  const channelsPerPage = 14;
  const totalPages = Math.ceil(totalChannels / channelsPerPage);

  console.log(`[ChannelSync] Total channels: ${totalChannels}, Pages: ${totalPages}`);

  // Extract base URL for logos
  const urlObj = new URL(providerUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

  let channelsCount = 0;
  const batchSize = 150;
  const batches = Math.ceil(totalPages / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchPages = [];
    const batchStart = batch * batchSize;
    for (let i = batchStart + 1; i <= Math.min(batchStart + batchSize, totalPages); i++) {
      batchPages.push(i);
    }

    const pagePromises = batchPages.map(page =>
      client.getChannels('*', page).then(async result => {
        let batchChannelsCount = 0;
        for (const channel of result.data) {
          const categoryId = channel.tv_genre_id
            ? categoryMap.get(channel.tv_genre_id) || null
            : null;

          // Handle logo URL properly
          let logoUrl: string | null = null;
          if (channel.logo) {
            if (channel.logo.startsWith('http://') || channel.logo.startsWith('https://')) {
              // Already a full URL
              logoUrl = channel.logo;
            } else if (channel.logo.startsWith('/')) {
              // Absolute path
              logoUrl = `${baseUrl}${channel.logo}`;
            } else {
              // Relative filename (e.g., "5624.png") - build Stalker logo path
              logoUrl = `${baseUrl}/misc/logos/320/${channel.logo}`;
            }
          }

          await prisma.channel.upsert({
            where: {
              providerId_externalId: {
                providerId,
                externalId: channel.id.toString(),
              },
            },
            update: {
              name: channel.name,
              number: channel.number ? parseInt(channel.number) : null,
              logo: logoUrl,
              cmd: channel.cmd || null,
              categoryId,
              updatedAt: new Date(),
            },
            create: {
              providerId,
              externalId: channel.id.toString(),
              name: channel.name,
              number: channel.number ? parseInt(channel.number) : null,
              logo: logoUrl,
              cmd: channel.cmd || null,
              categoryId,
            },
          });
          batchChannelsCount++;
        }
        return batchChannelsCount;
      })
    );

    const batchResults = await Promise.all(pagePromises);
    channelsCount += batchResults.reduce((sum, count) => sum + count, 0);

    // Update SyncJob with channels progress
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { channelsCount },
    });

    console.log(
      `[ChannelSync] Batch ${batch + 1}/${batches}: ${channelsCount}/${totalChannels} channels processed`
    );
  }

  console.log(`[ChannelSync] ✅ Synced ${channelsCount} channels total`);
}

/**
 * Background job to sync all VOD content
 * Returns true if sync completed successfully (all pages processed or overlap detected)
 */
async function syncVodContent(providerId: string, providerUrl: string, client: StalkerClient, jobId: string, isIncremental: boolean): Promise<boolean> {
  console.log(`[Sync] Starting ${isIncremental ? 'INCREMENTAL' : 'FULL'} VOD sync for provider ${providerId}, job: ${jobId}`);
  
  // Helper to safely parse dates
  const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr || dateStr === '0000-00-00 00:00:00') return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };
  
  // Get existing external IDs for incremental sync
  let existingIds = new Set<string>();
  if (isIncremental) {
    const [movies, series] = await Promise.all([
      prisma.movie.findMany({ where: { providerId }, select: { externalId: true } }),
      prisma.series.findMany({ where: { providerId }, select: { externalId: true } }),
    ]);
    existingIds = new Set([...movies.map(m => m.externalId), ...series.map(s => s.externalId)]);
    console.log(`[Sync] Incremental mode: ${existingIds.size} existing items in database`);
  }
  
  try {
    // First, fetch categories to store them
    const categories = await client.getMovieCategories();
    console.log(`[Sync] Found ${categories.length} VOD categories`);

    // Store categories in database and build a map for lookups
    const categoryMap = new Map<string, string>(); // externalId -> UUID
    
    for (const category of categories) {
      const dbCategory = await prisma.category.upsert({
        where: {
          providerId_externalId: {
            providerId,
            externalId: category.id,
          },
        },
        update: {
          name: category.title,
        },
        create: {
          providerId,
          externalId: category.id,
          name: category.title,
          type: 'MOVIE',
        },
      });
      categoryMap.set(category.id, dbCategory.id);
    }
    
    console.log(`[Sync] Category map created with ${categoryMap.size} categories`);

    // GET TOTAL COUNT FROM API (category=*)
    console.log(`[Sync] Fetching total count from API...`);
    let expectedTotalCount = 0;
    try {
      const totalResponse = await client.getMovies('*', 1);
      expectedTotalCount = totalResponse.total || 0;
      console.log(`[Sync] API reports ${expectedTotalCount} total items`);
      
      // Update sync job with expected total
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { totalItems: expectedTotalCount },
      });
    } catch (error) {
      console.error('[Sync] Failed to get total count from API:', error);
    }

    // SYNC EACH CATEGORY INDIVIDUALLY for complete coverage
    // This ensures all content from all categories (including adult/censored) is synced
    // Skip 'All' categories as they will be generated by combining all categories
    const categoriesToSync = categories.filter(cat => {
      const isAllCategory = cat.title.toLowerCase().includes('all') || cat.id === '*';
      if (isAllCategory) {
        console.log(`[Sync] Skipping 'All' category: ${cat.title} (ID: ${cat.id})`);
      }
      return !isAllCategory;
    });
    
    console.log(`[Sync] Starting per-category sync for ${categoriesToSync.length} categories (filtered from ${categories.length})`);

    let totalProcessed = 0;
    let totalMoviesCount = 0;
    let totalSeriesCount = 0;
    let newItemsCount = 0;
    let skippedItemsCount = 0;
    
    // Process each category individually
    for (const category of categoriesToSync) {
      const categoryName = category.title;
      const categoryDbId = categoryMap.get(category.id);
      
      if (!categoryDbId) {
        console.warn(`[Sync] Category ${categoryName} not found in map, skipping`);
        continue;
      }
      
      console.log(`[Sync] Processing category: ${categoryName} (ID: ${category.id})`);
      
      let page = 1;
      let hasMore = true;
      let categoryItemCount = 0;
      let consecutiveEmptyPages = 0;
      let consecutivePagesWithNoNewItems = 0;
      const maxConsecutiveEmpty = 3;
      const maxPagesWithNoNewItems = isIncremental ? 5 : 999999; // In incremental mode, stop after 5 pages with no new items
      const batchSize = isIncremental ? 5 : 50; // Smaller batches for incremental (just check recent content)
      
      // Fetch pages in batches for this category
      while (hasMore) {
        try {
          // Fetch multiple pages concurrently
          const pagesToFetch = [];
          for (let i = 0; i < batchSize; i++) {
            pagesToFetch.push(page + i);
          }
          
          const batchResults = await Promise.all(
            pagesToFetch.map(p => 
              client.getMovies(category.id, p)
                .then(result => ({ page: p, result }))
                .catch(err => ({ page: p, result: null, error: err }))
            )
          );
          
          // Process results in order
          let batchHasData = false;
          for (const batchItem of batchResults) {
            const currentPage = batchItem.page;
            const result = 'error' in batchItem ? null : batchItem.result;
            const error = 'error' in batchItem ? batchItem.error : null;
            
            if (error || !result) {
              console.error(`[Sync] Error fetching category ${categoryName} page ${currentPage}:`, error);
              continue;
            }
          
            if (!result.data || result.data.length === 0) {
              consecutiveEmptyPages++;
              console.log(`[Sync] Category ${categoryName} page ${currentPage}: empty (${consecutiveEmptyPages}/${maxConsecutiveEmpty})`);
              
              if (consecutiveEmptyPages >= maxConsecutiveEmpty) {
                console.log(`[Sync] Category ${categoryName}: reached end (${categoryItemCount} items)`);
                hasMore = false;
                break;
              }
              continue;
            }
          
            // Reset empty counter when we get data
            consecutiveEmptyPages = 0;
            batchHasData = true;
          
          // Process items in this page
          let pageMovies = 0;
          let pageSeries = 0;
          let pageNew = 0;
          let pageSkipped = 0;
          
          for (const item of result.data) {
              const itemExternalId = item.id.toString();
              
              // Skip if exists in incremental mode (early termination optimization)
              if (isIncremental && existingIds.has(itemExternalId)) {
                pageSkipped++;
                continue;
              }
              
              const isSeries = item.is_series === '1' || item.is_series === 1;
              
              // Look up category UUID from external ID
              const categoryId = item.category_id ? categoryMap.get(item.category_id) || null : null;
              
              if (!existingIds.has(itemExternalId)) {
                pageNew++;
              }
              
              if (isSeries) {
                pageSeries++;
                // Save as Series with ALL metadata
                await prisma.series.upsert({
                  where: {
                    providerId_externalId: {
                      providerId,
                      externalId: item.id.toString(),
                    },
                  },
                  update: {
                    name: item.name || item.o_name,
                    originalName: item.o_name || null,
                    description: item.description || null,
                    poster: item.screenshot_uri || item.pic || null,
                    year: item.year || null,
                    yearEnd: item.year_end || null,
                    director: item.director || null,
                    actors: item.actors || null,
                    country: item.country || null,
                    ratingImdb: item.rating_imdb ? parseFloat(item.rating_imdb) : null,
                    ratingKinopoisk: item.rating_kinopoisk ? parseFloat(item.rating_kinopoisk) : null,
                    kinopoiskId: item.kinopoisk_id || null,
                    genreId: item.genre_id || null,
                    genres: item.genres_str || null,
                    addedAt: parseDate(item.added),
                    lastPlayed: parseDate(item.last_played),
                    isHd: item.hd === 1 || item.hd === '1',
                    highQuality: item.high_quality === '1',
                    censored: item.censored === '1',
                    episodeCount: item.has_files ? parseInt(item.has_files.toString()) : 0,
                    cmd: item.cmd || null,
                    categoryId,
                    updatedAt: new Date(),
                  },
                  create: {
                    providerId,
                    externalId: item.id.toString(),
                    name: item.name || item.o_name,
                    originalName: item.o_name || null,
                    description: item.description || null,
                    poster: item.screenshot_uri || item.pic || null,
                    year: item.year || null,
                    yearEnd: item.year_end || null,
                    director: item.director || null,
                    actors: item.actors || null,
                    country: item.country || null,
                    ratingImdb: item.rating_imdb ? parseFloat(item.rating_imdb) : null,
                    ratingKinopoisk: item.rating_kinopoisk ? parseFloat(item.rating_kinopoisk) : null,
                    kinopoiskId: item.kinopoisk_id || null,
                    genreId: item.genre_id || null,
                    genres: item.genres_str || null,
                    addedAt: parseDate(item.added),
                    lastPlayed: parseDate(item.last_played),
                    isHd: item.hd === 1 || item.hd === '1',
                    highQuality: item.high_quality === '1',
                    censored: item.censored === '1',
                    episodeCount: item.has_files ? parseInt(item.has_files.toString()) : 0,
                    cmd: item.cmd || null,
                    categoryId,
                  },
                });
              } else {
                pageMovies++;
                // Save as Movie with ALL metadata
                await prisma.movie.upsert({
                  where: {
                    providerId_externalId: {
                      providerId,
                      externalId: item.id.toString(),
                    },
                  },
                  update: {
                    name: item.name || item.o_name,
                    originalName: item.o_name || null,
                    description: item.description || null,
                    poster: item.screenshot_uri || item.pic || null,
                    year: item.year || null,
                    director: item.director || null,
                    actors: item.actors || null,
                    country: item.country || null,
                    ratingImdb: item.rating_imdb ? parseFloat(item.rating_imdb) : null,
                    ratingKinopoisk: item.rating_kinopoisk ? parseFloat(item.rating_kinopoisk) : null,
                    kinopoiskId: item.kinopoisk_id || null,
                    genreId: item.genre_id || null,
                    genres: item.genres_str || null,
                    duration: item.duration ? parseInt(item.duration) : null,
                    addedAt: parseDate(item.added),
                    lastPlayed: parseDate(item.last_played),
                    isHd: item.hd === 1 || item.hd === '1',
                    highQuality: item.high_quality === '1',
                    censored: item.censored === '1',
                    cmd: item.cmd || null,
                    categoryId,
                    updatedAt: new Date(),
                  },
                  create: {
                    providerId,
                    externalId: item.id.toString(),
                    name: item.name || item.o_name,
                    originalName: item.o_name || null,
                    description: item.description || null,
                    poster: item.screenshot_uri || item.pic || null,
                    year: item.year || null,
                    director: item.director || null,
                    actors: item.actors || null,
                    country: item.country || null,
                    ratingImdb: item.rating_imdb ? parseFloat(item.rating_imdb) : null,
                    ratingKinopoisk: item.rating_kinopoisk ? parseFloat(item.rating_kinopoisk) : null,
                    kinopoiskId: item.kinopoisk_id || null,
                    genreId: item.genre_id || null,
                    genres: item.genres_str || null,
                    duration: item.duration ? parseInt(item.duration) : null,
                    addedAt: parseDate(item.added),
                    lastPlayed: parseDate(item.last_played),
                    isHd: item.hd === 1 || item.hd === '1',
                    highQuality: item.high_quality === '1',
                    censored: item.censored === '1',
                    cmd: item.cmd || null,
                    categoryId,
                  },
                });
              }
            }
          
            // Update counters
            categoryItemCount += result.data.length;
            totalProcessed += result.data.length;
            totalMoviesCount += pageMovies;
            totalSeriesCount += pageSeries;
            newItemsCount += pageNew;
            skippedItemsCount += pageSkipped;
          
            // INCREMENTAL MODE: Early termination if no new items found
            if (isIncremental) {
              if (pageNew === 0) {
                consecutivePagesWithNoNewItems++;
                if (consecutivePagesWithNoNewItems >= maxPagesWithNoNewItems) {
                  console.log(`[Sync] INCREMENTAL: Category ${categoryName} - ${consecutivePagesWithNoNewItems} consecutive pages with no new items. Stopping early.`);
                  hasMore = false;
                  break;
                }
              } else {
                consecutivePagesWithNoNewItems = 0; // Reset if we find new items
              }
            }
          
            console.log(`[Sync] Category ${categoryName} page ${currentPage}: ${result.data.length} items | Movies: ${pageMovies}, Series: ${pageSeries}, New: ${pageNew}`);
            
            // Update job progress after EACH PAGE for real-time UI feedback
            await prisma.syncJob.update({
              where: { id: jobId },
              data: {
                processedItems: totalProcessed,
                moviesCount: totalMoviesCount,
                seriesCount: totalSeriesCount,
              },
            });
          } // End batch item loop
          
          // Move to next batch
          if (batchHasData) {
            page = pagesToFetch[pagesToFetch.length - 1] + 1;
          } else {
            hasMore = false;
          }
          
        } catch (error) {
          console.error(`[Sync] Error processing category ${categoryName}:`, error);
          hasMore = false;
        }
      }
      
      console.log(`[Sync] Category ${categoryName}: Complete - ${categoryItemCount} items synced`);
    }
    
    // Final job update
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        processedItems: totalProcessed,
        moviesCount: totalMoviesCount,
        seriesCount: totalSeriesCount,
      },
    });
    
    console.log(`[Sync] Per-category sync complete: ${totalProcessed} items | Movies: ${totalMoviesCount}, Series: ${totalSeriesCount} | New: ${newItemsCount}, Skipped: ${skippedItemsCount}`);

    // Generate complete snapshot with ALL content for fast UI rendering
    console.log(`[Sync] Generating complete snapshot with all metadata...`);
    const [allMovies, allSeries, allChannels, allCategories] = await Promise.all([
      prisma.movie.findMany({
        where: { providerId, isActive: true },
        select: {
          id: true,
          externalId: true,
          name: true,
          originalName: true,
          description: true,
          poster: true,
          year: true,
          director: true,
          actors: true,
          country: true,
          ratingImdb: true,
          ratingKinopoisk: true,
          genres: true,
          duration: true,
          isHd: true,
          highQuality: true,
          censored: true,
          cmd: true,
          categoryId: true,
          addedAt: true,
        },
        orderBy: { addedAt: 'desc' },
      }),
      prisma.series.findMany({
        where: { providerId, isActive: true },
        select: {
          id: true,
          externalId: true,
          name: true,
          originalName: true,
          description: true,
          poster: true,
          year: true,
          yearEnd: true,
          director: true,
          actors: true,
          country: true,
          ratingImdb: true,
          ratingKinopoisk: true,
          genres: true,
          episodeCount: true,
          isHd: true,
          highQuality: true,
          cmd: true,
          categoryId: true,
          addedAt: true,
        },
        orderBy: { addedAt: 'desc' },
      }),
      prisma.channel.findMany({
        where: { providerId, isActive: true },
        select: {
          id: true,
          externalId: true,
          name: true,
          number: true,
          logo: true,
          cmd: true,
          categoryId: true,
          createdAt: true,
        },
        orderBy: { number: 'asc' },
      }),
      prisma.category.findMany({
        where: { providerId },
        select: { id: true, externalId: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Image URLs are already full URLs from sync, use them as-is
    const moviesWithFullUrls = allMovies.map(movie => ({
      ...movie,
      poster: movie.poster,
    }));
    
    const seriesWithFullUrls = allSeries.map(series => ({
      ...series,
      poster: series.poster,
    }));

    const channelsWithFullUrls = allChannels.map(channel => ({
      ...channel,
      logo: channel.logo,
    }));

    // Group content by categories for faster filtering in UI
    const moviesByCategory: Record<string, typeof moviesWithFullUrls> = {};
    const seriesByCategory: Record<string, typeof seriesWithFullUrls> = {};
    const channelsByCategory: Record<string, typeof channelsWithFullUrls> = {};
    
    // Track which categories contain movies vs series
    const categoryContentType = new Map<string, 'MOVIE' | 'SERIES' | 'BOTH'>();
    
    moviesWithFullUrls.forEach(movie => {
      const catId = movie.categoryId || 'uncategorized';
      if (!moviesByCategory[catId]) moviesByCategory[catId] = [];
      moviesByCategory[catId].push(movie);
      
      // Mark category as containing movies
      const currentType = categoryContentType.get(catId);
      if (!currentType) {
        categoryContentType.set(catId, 'MOVIE');
      } else if (currentType === 'SERIES') {
        categoryContentType.set(catId, 'BOTH');
      }
    });
    
    seriesWithFullUrls.forEach(series => {
      const catId = series.categoryId || 'uncategorized';
      if (!seriesByCategory[catId]) seriesByCategory[catId] = [];
      seriesByCategory[catId].push(series);
      
      // Mark category as containing series
      const currentType = categoryContentType.get(catId);
      if (!currentType) {
        categoryContentType.set(catId, 'SERIES');
      } else if (currentType === 'MOVIE') {
        categoryContentType.set(catId, 'BOTH');
      }
    });

    channelsWithFullUrls.forEach(channel => {
      const catId = channel.categoryId || 'uncategorized';
      if (!channelsByCategory[catId]) channelsByCategory[catId] = [];
      channelsByCategory[catId].push(channel);
    });
    
    // Update categories with content type flags
    const categoriesWithContentType = allCategories.map(cat => {
      const hasMovies = moviesByCategory[cat.id]?.length > 0;
      const hasSeries = seriesByCategory[cat.id]?.length > 0;
      const hasChannels = channelsByCategory[cat.id]?.length > 0;
      
      return {
        ...cat,
        hasMovies,
        hasSeries,
        hasChannels,
        // Keep original type for backward compatibility
        type: cat.type,
      };
    });

    const snapshotData = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      syncType: isIncremental ? 'incremental' : 'full',
      stats: {
        totalMovies: moviesWithFullUrls.length,
        totalSeries: seriesWithFullUrls.length,
        totalChannels: channelsWithFullUrls.length,
        totalCategories: categoriesWithContentType.length,
        newItemsAdded: newItemsCount,
        skippedItems: skippedItemsCount,
      },
      categories: categoriesWithContentType, // Categories with detected content types
      movies: moviesWithFullUrls, // ALL movies with FULL image URLs
      series: seriesWithFullUrls, // ALL series with FULL image URLs
      channels: channelsWithFullUrls, // ALL channels with FULL logo URLs
      moviesByCategory,
      seriesByCategory,
      channelsByCategory,
    };

    // Delete old snapshots (keep only last 5)
    const oldSnapshots = await prisma.snapshot.findMany({
      where: { providerId, type: 'vod_sync' },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      select: { id: true },
    });
    
    if (oldSnapshots.length > 0) {
      await prisma.snapshot.deleteMany({
        where: { id: { in: oldSnapshots.map(s => s.id) } },
      });
    }

    await prisma.snapshot.create({
      data: {
        providerId,
        type: 'vod_sync',
        data: JSON.stringify(snapshotData),
      },
    });

    console.log(`[Sync] Complete snapshot created: ${allMovies.length} movies, ${allSeries.length} series, ${allChannels.length} channels, ${allCategories.length} categories`);

    // Update provider lastSync timestamp (job completion handled by performSmartSync)
    await prisma.provider.update({
      where: { id: providerId },
      data: { lastSync: new Date() },
    });

    const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';
    console.log(`[Sync] ✅ ${syncType} VOD sync completed! Total: ${allMovies.length + allSeries.length} items | New: ${newItemsCount} | Skipped: ${skippedItemsCount}`);
    
    return true; // Sync completed successfully
  } catch (error) {
    console.error(`[Sync] ❌ Error during VOD sync:`, error);
    throw error;
  }
}

/**
 * GET /api/providers/[id]/sync
 * Get sync status and active job progress
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: providerId } = await params;

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        lastSync: true,
        _count: {
          select: {
            movies: true,
            series: true,
            channels: true,
          },
        },
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Check for active sync job
    const activeJob = await prisma.syncJob.findFirst({
      where: {
        providerId,
        status: 'processing',
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json({
      lastSync: provider.lastSync,
      stats: {
        movies: provider._count.movies,
        series: provider._count.series,
        channels: provider._count.channels,
      },
      activeJob: activeJob ? {
        id: activeJob.id,
        status: activeJob.status,
        totalItems: activeJob.totalItems,
        processedItems: activeJob.processedItems,
        moviesCount: activeJob.moviesCount,
        seriesCount: activeJob.seriesCount,
        channelsCount: activeJob.channelsCount, // Include channels progress
        startedAt: activeJob.startedAt,
      } : null,
    });
  } catch (error: unknown) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
