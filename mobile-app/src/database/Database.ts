import * as SQLite from 'expo-sqlite';

export class Database {
  private static instance: SQLite.SQLiteDatabase | null = null;
  private static isInitialized: boolean = false;

  static async init(): Promise<SQLite.SQLiteDatabase> {
    if (this.instance) {
      return this.instance;
    }

    this.instance = await SQLite.openDatabaseAsync('iptv.db');
    await this.createTables();
    this.isInitialized = true;
    return this.instance;
  }

  static async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.instance) {
      return this.init();
    }
    return this.instance;
  }

  private static async createTables() {
    const db = this.instance!;

    // Providers table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        server_url TEXT,
        username TEXT,
        password TEXT,
        mac_address TEXT,
        serial_number TEXT,
        token TEXT,
        configuration TEXT,
        is_active INTEGER DEFAULT 1,
        is_configured INTEGER DEFAULT 1,
        include_tv INTEGER DEFAULT 1,
        include_vod INTEGER DEFAULT 1,
        adult_password TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, provider_id)
      );
    `);

    // Categories table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content_type TEXT,
        censored INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, provider_id, category_id),
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );
    `);

    // Channels table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT,
        cmd TEXT,
        logo TEXT,
        number INTEGER,
        is_active INTEGER DEFAULT 1,
        external_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, category_id, channel_id),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
    `);

    // Movies table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        movie_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        director TEXT,
        actors TEXT,
        year INTEGER,
        rating REAL,
        duration INTEGER,
        genre TEXT,
        cover_url TEXT,
        backdrop_url TEXT,
        stream_url TEXT,
        quality TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, category_id, movie_id),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
    `);

    // Series table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS series (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        series_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        director TEXT,
        actors TEXT,
        year INTEGER,
        rating REAL,
        genre TEXT,
        cover_url TEXT,
        backdrop_url TEXT,
        total_seasons INTEGER,
        total_episodes INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, category_id, series_id),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
    `);

    // Episodes table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        series_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        duration INTEGER,
        stream_url TEXT,
        cover_url TEXT,
        air_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, series_id, episode_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
      );
    `);

    // Watch progress table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS watch_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_name TEXT,
        provider_id TEXT,
        current_position INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        last_watched_at INTEGER DEFAULT (strftime('%s', 'now')),
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, content_id, content_type),
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
      );
    `);

    // Settings table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        settings_data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Create indexes
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_categories_provider ON categories(provider_id);
      CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
      CREATE INDEX IF NOT EXISTS idx_categories_enabled ON categories(is_enabled);
      CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
      CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active);
      CREATE INDEX IF NOT EXISTS idx_movies_category ON movies(category_id);
      CREATE INDEX IF NOT EXISTS idx_series_category ON series(category_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id);
      CREATE INDEX IF NOT EXISTS idx_progress_user ON watch_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_progress_last_watched ON watch_progress(last_watched_at DESC);
    `);

    if (!this.isInitialized) {
      console.log('✅ Database tables created successfully');
    }
  }

  static async clearAllData() {
    const db = await this.getDatabase();
    await db.execAsync(`
      DELETE FROM watch_progress;
      DELETE FROM episodes;
      DELETE FROM series;
      DELETE FROM movies;
      DELETE FROM channels;
      DELETE FROM categories;
      DELETE FROM settings;
      DELETE FROM providers;
    `);
    console.log('✅ All data cleared');
  }

  static async close() {
    if (this.instance) {
      await this.instance.closeAsync();
      this.instance = null;
    }
  }
}
