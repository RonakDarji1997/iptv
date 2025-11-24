const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function checkProviders() {
  try {
    const providers = await prisma.provider.findMany({
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        stalkerMac: true,
      }
    });
    
    console.log('📋 All Providers:');
    providers.forEach(p => {
      console.log(`\n  ID: ${p.id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  Type: ${p.type}`);
      console.log(`  URL: ${p.url}`);
      console.log(`  MAC: ${p.stalkerMac || 'N/A'}`);
    });
    
    if (providers.length === 0) {
      console.log('\n  No providers found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProviders();
