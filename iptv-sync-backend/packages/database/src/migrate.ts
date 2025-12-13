import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

// Load environment variables from root
dotenv.config({ path: join(__dirname, '../../../.env') })

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'iptv_sync',
  user: process.env.DB_USER || 'ronika',
  password: process.env.DB_PASSWORD || '',
})

async function runMigrations() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Starting database migrations...')
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Get executed migrations
    const { rows: executedMigrations } = await client.query(
      'SELECT name FROM migrations ORDER BY name'
    )
    const executed = new Set(executedMigrations.map((row: any) => row.name))
    
    // Get migration files
    const migrationsDir = join(__dirname, '../migrations')
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort()
    
    console.log(`📁 Found ${files.length} migration files`)
    console.log(`✅ Already executed: ${executed.size}`)
    
    // Run pending migrations
    let count = 0
    for (const file of files) {
      if (!executed.has(file)) {
        console.log(`🔄 Running migration: ${file}`)
        
        const sql = readFileSync(join(migrationsDir, file), 'utf-8')
        
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file])
          await client.query('COMMIT')
          console.log(`✅ Completed: ${file}`)
          count++
        } catch (error) {
          await client.query('ROLLBACK')
          console.error(`❌ Failed: ${file}`)
          throw error
        }
      }
    }
    
    if (count === 0) {
      console.log('✨ Database is up to date - no migrations to run')
    } else {
      console.log(`\n✅ Successfully ran ${count} migration(s)`)
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

runMigrations()
  .then(() => {
    console.log('✨ Migration complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Migration error:', error)
    process.exit(1)
  })
