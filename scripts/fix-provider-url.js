const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function fixProviderUrl() {
  try {
    const provider = await prisma.provider.findFirst({
      where: {
        url: 'http://tv.stream4k.cc'
      }
    });
    
    if (!provider) {
      console.log('❌ Provider not found');
      process.exit(1);
    }
    
    const updated = await prisma.provider.update({
      where: { id: provider.id },
      data: {
        url: 'http://tv.stream4k.cc/stalker_portal'
      }
    });
    
    console.log('✅ Provider URL fixed!');
    console.log('   Old:', 'http://tv.stream4k.cc');
    console.log('   New:', updated.url);
    console.log('\n📝 Note: The StalkerClient will append /server/load.php automatically');
    console.log('   Final URL will be: http://tv.stream4k.cc/stalker_portal/server/load.php');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixProviderUrl();
