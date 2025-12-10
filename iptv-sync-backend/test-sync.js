const {Pool} = require('pg');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/iptv_sync'
});

async function testSync() {
  const client = await pool.connect();
  try {
    // Get user and new provider
    const user = await client.query('SELECT id FROM users LIMIT 1');
    const provider = await client.query('SELECT id, name FROM providers WHERE name = $1', ['Stream4K TV']);
    
    if (!provider.rows[0]) {
      console.log('❌ Provider not found');
      return;
    }
    
    const userId = user.rows[0].id;
    const providerId = provider.rows[0].id;
    
    // Generate JWT token
    const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'dev-secret-key-change-in-production');
    
    console.log('📋 Starting full sync test...');
    console.log('   User ID:', userId);
    console.log('   Provider ID:', providerId);
    console.log('   Provider Name:', provider.rows[0].name);
    console.log('\n🔄 Calling sync endpoint...\n');
    
    // Call the sync endpoint
    const response = await axios.post(
      `http://localhost:3001/api/sync/full-sync/${providerId}`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minutes
      }
    );
    
    console.log('\n✅ Sync completed!');
    console.log('📊 Stats:', response.data.stats);
    
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testSync();
