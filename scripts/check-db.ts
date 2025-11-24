#!/usr/bin/env tsx
import prisma from '../src/lib/prisma';

async function checkDatabase() {
  const providerId = '584c6e57-4859-4e8f-8b94-a59e5ada4d6f';
  
  const movieCount = await prisma.movie.count({
    where: { providerId }
  });
  
  const seriesCount = await prisma.series.count({
    where: { providerId }
  });
  
  console.log(`Movies: ${movieCount}`);
  console.log(`Series: ${seriesCount}`);
  
  if (seriesCount > 0) {
    const sample = await prisma.series.findFirst({
      where: { providerId },
      select: {
        name: true,
        year: true,
        yearEnd: true,
        episodeCount: true,
        originalName: true,
        director: true,
        actors: true,
        ratingImdb: true,
        genres: true,
      }
    });
    console.log('\nSample Series:');
    console.log(JSON.stringify(sample, null, 2));
  }
  
  await prisma.$disconnect();
}

checkDatabase();
