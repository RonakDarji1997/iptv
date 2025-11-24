const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteSnapshots() {
  try {
    const result = await prisma.snapshot.deleteMany({});
    console.log(`Deleted ${result.count} snapshots`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteSnapshots();
