const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSnapshot() {
  try {
    const snapshot = await prisma.snapshot.findFirst({
      where: {
        providerId: '584c6e57-4859-4e8f-8b94-a59e5ada4d6f',
        type: 'vod_sync',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      console.log('No snapshot found');
      return;
    }

    const data = JSON.parse(snapshot.data);
    
    console.log('Snapshot Statistics:');
    console.log('===================');
    console.log(`Total Movies: ${data.movies?.length || 0}`);
    console.log(`Total Series: ${data.series?.length || 0}`);
    console.log(`Total Channels: ${data.channels?.length || 0}`);
    console.log(`Total Categories: ${data.categories?.length || 0}`);
    console.log(`\nSnapshot created at: ${snapshot.createdAt}`);
    
    // Check if there's any censored filtering
    if (data.movies && data.movies.length > 0) {
      const censoredMovies = data.movies.filter(m => m.censored === true || m.censored === '1');
      console.log(`\nCensored movies in snapshot: ${censoredMovies.length}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSnapshot();
