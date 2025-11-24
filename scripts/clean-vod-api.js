/**
 * Clean VOD Database Script
 * Deletes all movies, series, categories, sync jobs, and snapshots for a provider
 */

const PROVIDER_ID = '584c6e57-4859-4e8f-8b94-a59e5ada4d6f';
const API_BASE = 'http://localhost:2005';

async function cleanDatabase() {
  console.log('🗑️  Starting database cleanup...');
  console.log('');

  try {
    // Use the database directly via a custom API endpoint
    const response = await fetch(`${API_BASE}/api/providers/${PROVIDER_ID}/clean`, {
      method: 'DELETE',
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Cleanup successful!');
      console.log('');
      console.log(`   Snapshots: ${result.deleted.snapshots}`);
      console.log(`   Sync Jobs: ${result.deleted.syncJobs}`);
      console.log(`   Movies: ${result.deleted.movies}`);
      console.log(`   Series: ${result.deleted.series}`);
      console.log(`   Categories: ${result.deleted.categories}`);
      console.log('');
      console.log('✨ Database cleaned! Ready for fresh sync.');
    } else {
      console.error('❌ Cleanup failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

cleanDatabase();
