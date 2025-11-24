const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function addProvider() {
  try {
    // Find user ronak
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { contains: 'ronak', mode: 'insensitive' } },
          { email: { contains: 'ronak', mode: 'insensitive' } }
        ]
      }
    });

    if (!user) {
      console.log('❌ User "ronak" not found');
      console.log('\nSearching all users...');
      const allUsers = await prisma.user.findMany({
        select: { id: true, username: true, email: true }
      });
      console.log('Available users:');
      allUsers.forEach(u => console.log(`  - ${u.username} (${u.email})`));
      process.exit(1);
    }

    console.log('✅ Found user:', user.username, '(', user.id, ')');

    // Check if provider already exists
    const existing = await prisma.provider.findFirst({
      where: {
        userId: user.id,
        url: 'http://tv.stream4k.cc/stalker_portal/'
      }
    });

    if (existing) {
      console.log('⚠️ Provider already exists:', existing.name);
      console.log('Updating credentials...');
      
      const updated = await prisma.provider.update({
        where: { id: existing.id },
        data: {
          stalkerMac: '00:1A:79:17:F4:F5',
          stalkerBearer: '1E75E91204660B7A876055CE8830130E',
          stalkerAdid: '06c140f97c839eaaa4faef4cc08a5722',
          isActive: true,
        }
      });
      
      console.log('✅ Provider updated:', updated.name);
      console.log('   MAC:', updated.stalkerMac);
      console.log('   Bearer:', updated.stalkerBearer);
      return;
    }

    // Create new provider
    const provider = await prisma.provider.create({
      data: {
        userId: user.id,
        type: 'STALKER',
        name: 'Stream4K Stalker',
        url: 'http://tv.stream4k.cc/stalker_portal/',
        stalkerMac: '00:1A:79:17:F4:F5',
        stalkerBearer: '1E75E91204660B7A876055CE8830130E',
        stalkerAdid: '06c140f97c839eaaa4faef4cc08a5722',
        isActive: true,
      }
    });

    console.log('✅ Provider created successfully!');
    console.log('   Provider ID:', provider.id);
    console.log('   Name:', provider.name);
    console.log('   Type:', provider.type);
    console.log('   URL:', provider.url);
    console.log('   MAC:', provider.stalkerMac);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

addProvider();
