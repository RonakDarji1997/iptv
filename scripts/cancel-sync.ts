import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cancelActiveSync() {
  const providerId = '584c6e57-4859-4e8f-8b94-a59e5ada4d6f';
  
  console.log('🛑 Cancelling active sync...');
  
  const activeJob = await prisma.syncJob.findFirst({
    where: { providerId, status: 'processing' },
  });
  
  if (activeJob) {
    await prisma.syncJob.update({
      where: { id: activeJob.id },
      data: {
        status: 'failed',
        error: 'Cancelled by user',
        completedAt: new Date(),
      },
    });
    console.log(`✅ Cancelled sync job: ${activeJob.id}`);
  } else {
    console.log('ℹ️  No active sync found');
  }
  
  await prisma.$disconnect();
}

cancelActiveSync().catch(console.error);
