const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/iptv_sync' 
});

async function insertProvider() {
  const client = await pool.connect();
  try {
    const providerId = 'stream4k-' + Date.now();
    const result = await client.query(`
      INSERT INTO providers (
        id,
        provider_id,
        user_id,
        type,
        name,
        server_url,
        mac_address,
        serial_number,
        token,
        is_active,
        is_configured,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        '028a5a03-b6a7-432a-8294-1ef4b1ee643c',
        'stalker',
        'Stream4K TV',
        'http://tv.stream4k.cc',
        '00:1A:79:7E:00:D7',
        '185455D368139',
        '71C018FB5EDD3706F9FAB979F96F1462',
        true,
        true,
        NOW(),
        NOW()
      )
      RETURNING *
    `, [providerId]);
    console.log('✅ Provider inserted successfully!');
    console.log('📋 Provider details:', JSON.stringify(result.rows[0], null, 2));
  } catch (err) {
    console.error('❌ Error inserting provider:', err.message);
    console.error('Details:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

insertProvider();
