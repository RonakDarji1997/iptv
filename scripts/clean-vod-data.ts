import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDatabase() {
  const providerId = '584c6e57-4859-4e8f-8b94-a59e5ada4d6f';
  
  console.log('🗑️  Cleaning VOD database for provider:', providerId);
  console.log('');
  
  // Delete in correct order (respecting foreign keys)
  const deletedSnapshots = await prisma.snapshot.deleteMany({ where: { providerId } });
  console.log(`✅ Deleted ${deletedSnapshots.count} snapshots`);
  
  const deletedSyncJobs = await prisma.syncJob.deleteMany({ where: { providerId } });
  console.log(`✅ Deleted ${deletedSyncJobs.count} sync jobs`);
  
  const deletedMovies = await prisma.movie.deleteMany({ where: { providerId } });
  console.log(`✅ Deleted ${deletedMovies.count} movies`);
  
  const deletedSeries = await prisma.series.deleteMany({ where: { providerId } });
  console.log(`✅ Deleted ${deletedSeries.count} series`);
  
  const deletedCategories = await prisma.category.deleteMany({ where: { providerId } });
  console.log(`✅ Deleted ${deletedCategories.count} categories`);
  
  console.log('');
  console.log('✨ Database cleaned! Ready for fresh sync.');
  console.log('');
  console.log('👉 Next step: Trigger sync from dashboard or run:');
  console.log(`   curl -X POST http://localhost:2005/api/providers/${providerId}/sync`);
  
  await prisma.$disconnect();
}

cleanDatabase().catch((error) => {
  console.error('❌ Error cleaning database:', error);
  process.exit(1);
});
