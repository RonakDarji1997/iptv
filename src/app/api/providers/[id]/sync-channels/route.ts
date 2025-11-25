import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { StalkerClient } from '@/lib/stalker-client';
import { safeDecrypt } from '@/lib/crypto';


/**
 * POST /api/providers/[providerId]/sync-channels
 * Sync all Live TV channels from Stalker portal
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

    // Check for existing active channel sync job
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
    Object.assign(client, { token: token || '', mac });

    // Create sync job for tracking
    const syncJob = await prisma.syncJob.create({
      data: {
        providerId,
        status: 'processing',
        totalItems: 0,
        processedItems: 0,
        moviesCount: 0,
        seriesCount: 0,
      },
    });

    // Start background sync job (runs independently)
    console.log(`[Channel Sync] Initiating channel sync for provider ${providerId}, job: ${syncJob.id}`);
    syncChannelContent(providerId, provider.url, client, syncJob.id).catch(async (error) => {
      console.error(`[Channel Sync] ❌ Background sync FAILED for provider ${providerId}:`, error);
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
      message: 'Channel sync started',
      providerId,
      jobId: syncJob.id,
      status: 'processing',
    });
  } catch (error: unknown) {
    console.error('Error starting channel sync:', error);
    return NextResponse.json(
      { error: 'Failed to start channel sync', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Background job to sync all live TV channels
 */
async function syncChannelContent(providerId: string, providerUrl: string, client: StalkerClient, jobId: string) {
  console.log(`[Channel Sync] Starting channel sync for provider ${providerId}, job: ${jobId}`);
  
  try {
    // Fetch ITV genres (channel categories)
    const genres = await client.getCategories();
    console.log(`[Channel Sync] Found ${genres.length} ITV genres`);

    // Store genres as categories
    const categoryMap = new Map<string, string>(); // externalId -> UUID
    
    for (const genre of genres) {
      const dbCategory = await prisma.category.upsert({
        where: {
          providerId_externalId: {
            providerId,
            externalId: genre.id,
          },
        },
        update: {
          name: genre.title,
        },
        create: {
          providerId,
          externalId: genre.id,
          name: genre.title,
          type: 'CHANNEL',
        },
      });
      categoryMap.set(genre.id, dbCategory.id);
    }
    
    console.log(`[Channel Sync] Category map created with ${categoryMap.size} genres`);

    // Fetch first page to get total channel count
    const firstPage = await client.getChannels('*', 1);
    const totalChannels = firstPage.total;
    const channelsPerPage = 14; // Stalker default
    const totalPages = Math.ceil(totalChannels / channelsPerPage);
    
    console.log(`[Channel Sync] Total channels: ${totalChannels}, Pages: ${totalPages}`);

    // Update job with total count
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { totalItems: totalChannels },
    });

    let totalProcessed = 0;
    let channelsCount = 0;
    
    // Process all channel pages
    const batchSize = 150;
    const batches = Math.ceil(totalPages / batchSize);
    
    // Extract base URL for logos
    const urlObj = new URL(providerUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * batchSize;
      const batchPages = [];
      for (let i = batchStart + 1; i <= Math.min(batchStart + batchSize, totalPages); i++) {
        batchPages.push(i);
      }
      
      console.log(`[Channel Sync] Processing batch ${batch + 1}/${batches}: pages [${batchPages.join(', ')}]`);
      
      const pagePromises = [];
      for (const page of batchPages) {
        pagePromises.push(
          client.getChannels('*', page).then(async (result) => {
            let batchChannels = 0;
            
            for (const channel of result.data) {
              const categoryId = channel.tv_genre_id ? categoryMap.get(channel.tv_genre_id) || null : null;
              
              // Handle logo URL properly - check if it's already a full URL or relative path
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
              
              batchChannels++;
            }
            
            return { total: result.data.length, channels: batchChannels };
          })
        );
      }

      const results = await Promise.all(pagePromises);
      const batchTotal = results.reduce((sum, r) => sum + r.total, 0);
      const batchChannelsCount = results.reduce((sum, r) => sum + r.channels, 0);
      
      totalProcessed += batchTotal;
      channelsCount += batchChannelsCount;
      
      // Update job progress - use moviesCount temporarily for channel count display
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          processedItems: totalProcessed,
          moviesCount: channelsCount, // Reuse for channels
        },
      });
      
      console.log(`[Channel Sync] Batch ${batch + 1}/${batches}: ${batchTotal} channels | Progress: ${totalProcessed}/${totalChannels}`);
    }

    // Mark job complete
    await Promise.all([
      prisma.provider.update({
        where: { id: providerId },
        data: { lastSync: new Date() },
      }),
      prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      }),
    ]);

    console.log(`[Channel Sync] ✅ Channel sync completed! Total: ${channelsCount} channels`);
  } catch (error) {
    console.error(`[Channel Sync] ❌ Error during channel sync:`, error);
    throw error;
  }
}
