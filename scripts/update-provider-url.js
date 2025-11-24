const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function updateProvider() {
  try {
    const provider = await prisma.provider.findFirst({
      where: {
        url: 'http://tv.stream4k.cc/stalker_portal/'
      }
    });
    
    if (!provider) {
      console.log('❌ Provider not found');
      process.exit(1);
    }
    
    const updated = await prisma.provider.update({
      where: { id: provider.id },
      data: {
        url: 'http://tv.stream4k.cc'
      }
    });
    
    console.log('✅ Provider URL updated');
    console.log('   Old: http://tv.stream4k.cc/stalker_portal/');
    console.log('   New:', updated.url);
    console.log('   Note: /stalker_portal/ path will be added by API calls');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateProvider();
