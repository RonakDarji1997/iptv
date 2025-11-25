import prisma from '../src/lib/prisma';

async function checkSnapshots() {
  try {
    const snapshots = await prisma.snapshot.findMany({
      select: {
        id: true,
        type: true,
        providerId: true,
        createdAt: true,
        provider: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    console.log('Recent Snapshots:');
    snapshots.forEach((snapshot) => {
      console.log({
        id: snapshot.id.substring(0, 8),
        type: snapshot.type,
        provider: snapshot.provider.name,
        createdAt: snapshot.createdAt.toISOString(),
      });
    });

    if (snapshots.length > 0) {
      const latest = snapshots[0];
      const fullSnapshot = await prisma.snapshot.findUnique({
        where: { id: latest.id },
      });

      if (fullSnapshot) {
        const data = JSON.parse(fullSnapshot.data);
        console.log('\nLatest Snapshot Data Structure:');
        console.log({
          version: data.version,
          generatedAt: data.generatedAt,
          stats: data.stats,
          hasCategories: !!data.categories,
          categoriesCount: data.categories?.length || 0,
          hasMovies: !!data.movies,
          moviesCount: data.movies?.length || 0,
          hasSeries: !!data.series,
          seriesCount: data.series?.length || 0,
          hasChannels: !!data.channels,
          channelsCount: data.channels?.length || 0,
        });

        // Sample a few items from each type
        if (data.channels && data.channels.length > 0) {
          console.log('\nSample Channel:', data.channels[0]);
        }
        if (data.movies && data.movies.length > 0) {
          console.log('\nSample Movie:', data.movies[0]);
        }
        if (data.categories && data.categories.length > 0) {
          console.log('\nSample Category:', data.categories[0]);
        }
      }
    } else {
      console.log('No snapshots found in database');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkSnapshots();
