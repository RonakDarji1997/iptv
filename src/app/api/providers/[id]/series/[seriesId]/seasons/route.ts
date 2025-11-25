import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { StalkerClient } from '@/lib/stalker-client';

/**
 * GET /api/providers/[id]/series/[seriesId]/seasons
 * Get seasons and episodes for a series - fetches from DB first, 
 * if not found fetches from Stalker API and saves to DB
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; seriesId: string }> }
) {
  try {
    const { id: providerId, seriesId } = await params;

    // Fetch series to verify it exists and belongs to this provider
    const series = await prisma.series.findFirst({
      where: {
        id: seriesId,
        providerId: providerId,
      },
      select: {
        id: true,
        name: true,
        externalId: true,
        originalName: true,
        description: true,
        poster: true,
        year: true,
        director: true,
        actors: true,
        country: true,
        ratingImdb: true,
        genres: true,
        episodeCount: true,
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    // Try to fetch seasons from database first
    let seasons = await prisma.season.findMany({
      where: {
        seriesId: seriesId,
      },
      include: {
        episodes: {
          orderBy: {
            episodeNumber: 'asc',
          },
        },
      },
      orderBy: {
        seasonNumber: 'desc',
      },
    });

    // If no seasons found in DB, fetch from Stalker API
    if (seasons.length === 0) {
      console.log(`[OnDemand] Fetching seasons for series ${series.name} from Stalker API`);
      
      // Get provider credentials
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          url: true,
          stalkerBearer: true,
          stalkerAdid: true,
          stalkerMac: true,
          stalkerToken: true,
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      // Initialize Stalker client
      const client = new StalkerClient(
        provider.url,
        provider.stalkerBearer || '',
        provider.stalkerAdid || ''
      );
      
      // Set MAC
      Object.assign(client, { mac: provider.stalkerMac || '' });
      
      // Perform fresh handshake
      console.log('[Series Seasons] Performing fresh handshake...');
      await client.handshake();
      console.log('[Series Seasons] ✅ Fresh handshake successful');

      try {
        // Fetch seasons from Stalker API
        console.log(`[OnDemand] Calling getSeriesSeasons for externalId: ${series.externalId}`);
        const seasonsData = await client.getSeriesSeasons(series.externalId);
        console.log(`[OnDemand] Received ${seasonsData.length} seasons from Stalker API`);
        
        if (seasonsData.length === 0) {
          console.log(`[OnDemand] No seasons found for series ${series.name} (externalId: ${series.externalId})`);
        }
        
        // Save each season and its episodes to DB
        for (const seasonData of seasonsData) {
          const season = await prisma.season.upsert({
            where: {
              seriesId_externalId: {
                seriesId: seriesId,
                externalId: seasonData.id,
              },
            },
            create: {
              seriesId: seriesId,
              externalId: seasonData.id,
              seasonNumber: parseInt(seasonData.season_number) || 0,
              name: seasonData.name || `Season ${seasonData.season_number}`,
            },
            update: {
              seasonNumber: parseInt(seasonData.season_number) || 0,
              name: seasonData.name || `Season ${seasonData.season_number}`,
            },
          });

          // Fetch episodes for this season with pagination
          console.log(`[OnDemand] Fetching episodes for season ${seasonData.season_number} (seasonId: ${seasonData.id})`);
          try {
            let allEpisodes: any[] = [];
            let currentPage = 1;
            let hasMorePages = true;

            // Fetch all pages of episodes
            while (hasMorePages) {
              const episodesResponse = await client.getSeriesEpisodes(
                series.externalId,
                seasonData.id,
                currentPage
              );
              
              const episodesOnPage = episodesResponse.data || [];
              allEpisodes = [...allEpisodes, ...episodesOnPage];
              
              // Check if we need to fetch more pages
              const totalItems = episodesResponse.total || 0;
              const maxPageItems = 14; // Default from Stalker API
              const totalPages = Math.ceil(totalItems / maxPageItems);
              
              hasMorePages = currentPage < totalPages;
              currentPage++;
              
              console.log(`[OnDemand] Fetched page ${currentPage - 1}/${totalPages} for season ${seasonData.season_number} (${episodesOnPage.length} episodes)`);
            }

            console.log(`[OnDemand] Total episodes for season ${seasonData.season_number}: ${allEpisodes.length}`);

            // Save all episodes - fetch file info for each to get actual cmd
            for (const episodeData of allEpisodes) {
              // Step 3: Get episode file info to retrieve the actual cmd and file_id
              let fileCmd = '';
              let fileId = '';
              try {
                const fileInfo = await client.getEpisodeFileInfo(
                  series.externalId,
                  seasonData.id,
                  episodeData.id
                );
                if (fileInfo) {
                  fileCmd = fileInfo.cmd || '';
                  fileId = fileInfo.id || '';
                  console.log(`[OnDemand] Episode ${episodeData.series_number} file: id=${fileId}, cmd=${fileCmd.substring(0, 50)}...`);
                }
              } catch (fileError) {
                console.error(`[OnDemand] Error fetching file info for episode ${episodeData.series_number}:`, fileError);
                // Fallback to constructed cmd if file fetch fails
                fileCmd = `/media/file_${episodeData.id}.mpg`;
              }

              await prisma.episode.upsert({
                where: {
                  seasonId_externalId: {
                    seasonId: season.id,
                    externalId: episodeData.id,
                  },
                },
                create: {
                  seasonId: season.id,
                  externalId: episodeData.id,
                  episodeNumber: parseInt(episodeData.series_number) || 0,
                  name: episodeData.name || `Episode ${episodeData.series_number}`,
                  description: episodeData.series_name || '',
                  duration: 0,
                  thumbnail: episodeData.screenshot_uri || '',
                  cmd: fileCmd ? `/media/file_${fileId}.mpg` : '',
                },
                update: {
                  episodeNumber: parseInt(episodeData.series_number) || 0,
                  name: episodeData.name || `Episode ${episodeData.series_number}`,
                  description: episodeData.series_name || '',
                  duration: 0,
                  thumbnail: episodeData.screenshot_uri || '',
                  cmd: fileCmd ? `/media/file_${fileId}.mpg` : '',
                },
              });
            }
          } catch (episodeError) {
            console.error(`[OnDemand] Error fetching episodes for season ${seasonData.season_number}:`, episodeError);
            // Continue with next season even if episodes fail
          }
        }

        console.log(`[OnDemand] Saved ${seasonsData.length} seasons for series ${series.name}`);

        // Re-fetch from DB to get the saved data
        seasons = await prisma.season.findMany({
          where: {
            seriesId: seriesId,
          },
          include: {
            episodes: {
              orderBy: {
                episodeNumber: 'asc',
              },
            },
          },
          orderBy: {
            seasonNumber: 'desc',
          },
        });
      } catch (error) {
        console.error('[OnDemand] Error fetching from Stalker API:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Return empty array with error info if fetch fails
        return NextResponse.json({
          success: true,
          series: {
            id: series.id,
            name: series.name,
            externalId: series.externalId,
          },
          seasons: [],
          error: `Failed to fetch seasons: ${errorMessage}`,
        });
      }
    }

    // Return seasons with episodes from database
    return NextResponse.json({
      success: true,
      series: {
        id: series.id,
        name: series.name,
        externalId: series.externalId,
        originalName: series.originalName,
        description: series.description,
        poster: series.poster,
        year: series.year,
        director: series.director,
        actors: series.actors,
        country: series.country,
        ratingImdb: series.ratingImdb,
        genres: series.genres,
        episodeCount: series.episodeCount,
      },
      seasons: seasons.map(season => ({
        id: season.id,
        externalId: season.externalId,
        seasonNumber: season.seasonNumber,
        name: season.name,
        episodeCount: season.episodes.length,
        episodes: season.episodes.map(episode => ({
          id: episode.id,
          externalId: episode.externalId,
          episodeNumber: episode.episodeNumber,
          name: episode.name,
          description: episode.description,
          duration: episode.duration,
          thumbnail: episode.thumbnail,
          // Use the actual cmd from file info (step 3)
          cmd: episode.cmd || `/media/file_${episode.externalId}.mpg`,
        })),
      })),
    });
  } catch (error: unknown) {
    console.error('Error fetching series seasons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch seasons', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
