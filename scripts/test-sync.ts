#!/usr/bin/env ts-node
/**
 * Test sync with a small batch (first 3 pages = ~42 items)
 */

const PROVIDER_ID = '584c6e57-4859-4e8f-8b94-a59e5ada4d6f';
const API_URL = 'http://localhost:2005';

async function testSync() {
  console.log('🔄 Starting test sync...');
  
  try {
    // Start sync
    const response = await fetch(`${API_URL}/api/providers/${PROVIDER_ID}/sync`, {
      method: 'POST',
    });

    const result = await response.json();
    console.log('✅ Sync response:', result);

    // Poll status every 2 seconds
    console.log('\n⏱️  Polling sync status...\n');
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`${API_URL}/api/providers/${PROVIDER_ID}/sync`);
      const status = await statusResponse.json();

      console.log(`[${new Date().toISOString()}] Movies: ${status.stats.movies}, Series: ${status.stats.series}`);

      if (status.stats.movies + status.stats.series > 0) {
        console.log('\n✅ Items detected! Checking first few...\n');
        
        // Fetch first page of movies
        const moviesResponse = await fetch(`${API_URL}/api/movies?providerId=${PROVIDER_ID}&page=1&limit=3`);
        const movies = await moviesResponse.json();
        
        console.log('Sample Movies:');
        for (const movie of movies.data || []) {
          console.log(`  - ${movie.name} (${movie.year || 'N/A'})`);
          console.log(`    Original: ${movie.originalName || 'N/A'}`);
          console.log(`    Director: ${movie.director || 'N/A'}`);
          console.log(`    IMDB: ${movie.ratingImdb || 'N/A'}, Kinopoisk: ${movie.ratingKinopoisk || 'N/A'}`);
          console.log(`    HD: ${movie.isHd ? 'Yes' : 'No'}, Quality: ${movie.highQuality ? 'High' : 'Normal'}`);
          console.log(`    Poster: ${movie.poster || 'N/A'}\n`);
        }
        
        break;
      }
    }

    console.log('\n✅ Test sync complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSync();
