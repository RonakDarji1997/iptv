import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Interface for storage operations - abstracts SQLite and AsyncStorage
 */
export interface IStorageAdapter {
  init(): Promise<void>;
  executeQuery(sql: string, params?: any[]): Promise<void>;
  getAllRows<T>(sql: string, params?: any[]): Promise<T[]>;
  runQuery(sql: string, params?: any[]): Promise<void>;
  execAsync(sql: string): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/**
 * SQLite adapter for iOS and Android
 */
class SQLiteAdapter implements IStorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null;
  private inTransaction: boolean = false;

  async init(): Promise<void> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('iptv.db');
      await this.createTables();
      console.log('✅ SQLite database initialized (Native)');
    }
  }

  async executeQuery(sql: string, params?: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(sql, params || []);
  }

  async getAllRows<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAllAsync<T>(sql, params || []);
  }

  async runQuery(sql: string, params?: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(sql, params || []);
  }

  async execAsync(sql: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync(sql);
  }

  async beginTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('BEGIN TRANSACTION');
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('COMMIT');
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('ROLLBACK');
    this.inTransaction = false;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;

    // Providers table
    await this.db.execAsync(`
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
    await this.db.execAsync(`
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
    await this.db.execAsync(`
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

    // Movies, Series, Episodes, Progress, Settings tables
    await this.db.execAsync(`
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

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        settings_data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Create indexes
    await this.db.execAsync(`
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
  }
}

/**
 * AsyncStorage adapter for Web
 * Stores data as JSON in AsyncStorage
 */
class WebCacheAdapter implements IStorageAdapter {
  private inTransaction: boolean = false;
  private transactionOps: Array<() => Promise<void>> = [];

  // Cache keys
  private readonly PROVIDERS_KEY = 'web_providers';
  private readonly CATEGORIES_KEY = 'web_categories';
  private readonly CHANNELS_KEY = 'web_channels';
  private readonly MOVIES_KEY = 'web_movies';
  private readonly SERIES_KEY = 'web_series';
  private readonly EPISODES_KEY = 'web_episodes';
  private readonly PROGRESS_KEY = 'web_watch_progress';
  private readonly SETTINGS_KEY = 'web_settings';

  async init(): Promise<void> {
    // Initialize empty collections if they don't exist
    const keys = [
      this.PROVIDERS_KEY,
      this.CATEGORIES_KEY,
      this.CHANNELS_KEY,
      this.MOVIES_KEY,
      this.SERIES_KEY,
      this.EPISODES_KEY,
      this.PROGRESS_KEY,
      this.SETTINGS_KEY,
    ];

    for (const key of keys) {
      const existing = await AsyncStorage.getItem(key);
      if (!existing) {
        await AsyncStorage.setItem(key, JSON.stringify([]));
      }
    }
    console.log('✅ Web cache storage initialized');
  }

  async executeQuery(sql: string, params?: any[]): Promise<void> {
    // Parse SQL and execute appropriate operation
    await this.parseSQLAndExecute(sql, params);
  }

  async getAllRows<T>(sql: string, params?: any[]): Promise<T[]> {
    return await this.parseSQLAndQuery<T>(sql, params);
  }

  async runQuery(sql: string, params?: any[]): Promise<void> {
    await this.parseSQLAndExecute(sql, params);
  }

  async execAsync(sql: string): Promise<void> {
    // Handle multi-statement SQL
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await this.parseSQLAndExecute(statement.trim());
    }
  }

  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
    this.transactionOps = [];
  }

  async commit(): Promise<void> {
    // Execute all transaction operations
    for (const op of this.transactionOps) {
      await op();
    }
    this.transactionOps = [];
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    this.transactionOps = [];
    this.inTransaction = false;
  }

  async close(): Promise<void> {
    // Nothing to close for AsyncStorage
  }

  private async parseSQLAndExecute(sql: string, params?: any[]): Promise<void> {
    const sqlLower = sql.toLowerCase().trim();

    const operation = async () => {
      if (sqlLower.includes('insert or replace into providers')) {
        await this.insertOrReplaceProvider(params);
      } else if (sqlLower.includes('insert or replace into categories')) {
        await this.insertOrReplaceCategory(params);
      } else if (sqlLower.includes('insert or replace into channels')) {
        await this.insertOrReplaceChannel(params);
      } else if (sqlLower.includes('delete from')) {
        await this.handleDelete(sqlLower);
      } else if (sqlLower.startsWith('update categories')) {
        // Handle updates like: UPDATE categories SET provider_id = ? WHERE provider_id = ?
        if (params && params.length >= 2) {
          const newId = params[0];
          const oldId = params[1];
          const categories = await this.getCollection(this.CATEGORIES_KEY);
          let changed = false;
          for (const c of categories) {
            if (c.provider_id === oldId) {
              c.provider_id = newId;
              changed = true;
            }
          }
          if (changed) await this.saveCollection(this.CATEGORIES_KEY, categories);
        }
      } else if (sqlLower.startsWith('update watch_progress')) {
        // Handle updates like: UPDATE watch_progress SET provider_id = ? WHERE provider_id = ?
        if (params && params.length >= 2) {
          const newId = params[0];
          const oldId = params[1];
          const progress = await this.getCollection(this.PROGRESS_KEY);
          let changed = false;
          for (const p of progress) {
            if (p.provider_id === oldId) {
              p.provider_id = newId;
              changed = true;
            }
          }
          if (changed) await this.saveCollection(this.PROGRESS_KEY, progress);
        }
      }
      // Add other operations as needed
    };

    if (this.inTransaction) {
      this.transactionOps.push(operation);
    } else {
      await operation();
    }
  }

  private async parseSQLAndQuery<T>(sql: string, params?: any[]): Promise<T[]> {
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.includes('from categories')) {
      return await this.queryCategories<T>(sqlLower, params) as T[];
    } else if (sqlLower.includes('from channels')) {
      return await this.queryChannels<T>(sqlLower, params) as T[];
    } else if (sqlLower.includes('from providers')) {
      return await this.queryProviders<T>(sqlLower, params) as T[];
    }

    return [];
  }

  private async insertOrReplaceProvider(params?: any[]): Promise<void> {
    if (!params || params.length < 7) return;

    const providers = await this.getCollection(this.PROVIDERS_KEY);
    const provider = {
      id: params[0],
      user_id: params[1],
      provider_id: params[2],
      name: params[3],
      type: params[4],
      server_url: params[5],
      username: params[6] || null,
      password: params[7] || null,
      mac_address: params[8] || null,
      serial_number: params[9] || null,
      token: params[10] || null,
      configuration: params[11] || null,
      is_active: params[12] || 1,
      is_configured: params[13] || 1,
      include_tv: params[14] || 1,
      include_vod: params[15] || 1,
      adult_password: params[16] || null,
      created_at: params[17] || Date.now(),
      updated_at: params[18] || Date.now(),
    };

    const index = providers.findIndex((p: any) => p.id === provider.id);
    if (index >= 0) {
      providers[index] = provider;
    } else {
      providers.push(provider);
    }

    await this.saveCollection(this.PROVIDERS_KEY, providers);
  }

  private async insertOrReplaceCategory(params?: any[]): Promise<void> {
    if (!params || params.length < 8) return;

    const categories = await this.getCollection(this.CATEGORIES_KEY);
    const category = {
      id: params[0],
      user_id: params[1],
      provider_id: params[2],
      category_id: params[3],
      name: params[4],
      type: params[5],
      content_type: params[6],
      censored: params[7] || 0,
      is_enabled: params[8] !== undefined ? params[8] : 1,
      sort_order: params[9] || 0,
      created_at: params[10] || Date.now(),
      updated_at: params[11] || Date.now(),
    };

    const index = categories.findIndex((c: any) => c.id === category.id);
    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.push(category);
    }

    await this.saveCollection(this.CATEGORIES_KEY, categories);
  }

  private async insertOrReplaceChannel(params?: any[]): Promise<void> {
    if (!params || params.length < 10) return;

    const channels = await this.getCollection(this.CHANNELS_KEY);
    const channel = {
      id: params[0],
      user_id: params[1],
      category_id: params[2],
      channel_id: params[3],
      name: params[4],
      url: params[5],
      cmd: params[6],
      logo: params[7],
      number: params[8] || 0,
      is_active: params[9] !== undefined ? params[9] : 1,
      external_id: params[10] || null,
      created_at: params[11] || Date.now(),
      updated_at: params[12] || Date.now(),
    };

    const index = channels.findIndex((ch: any) => ch.id === channel.id);
    if (index >= 0) {
      channels[index] = channel;
    } else {
      channels.push(channel);
    }

    await this.saveCollection(this.CHANNELS_KEY, channels);
  }

  private async queryCategories<T>(sql: string, params?: any[]): Promise<T[]> {
    let categories = await this.getCollection(this.CATEGORIES_KEY);

    // Apply WHERE clauses
    if (sql.includes('where')) {
      if (sql.includes("type = 'live'")) {
        categories = categories.filter((c: any) => c.type === 'LIVE');
      } else if (sql.includes("content_type = 'movie'")) {
        categories = categories.filter((c: any) => c.content_type === 'movie');
      } else if (sql.includes("content_type = 'series'")) {
        categories = categories.filter((c: any) => c.content_type === 'series');
      } else if (sql.includes("content_type = 'live'") && params?.[0]) {
        categories = categories.filter((c: any) => c.category_id === params[0] && c.content_type === 'live');
      }

      if (sql.includes('is_enabled = 1')) {
        categories = categories.filter((c: any) => c.is_enabled === 1);
      }
    }

    // Apply SELECT
    if (sql.includes('select id from')) {
      return categories.map((c: any) => ({ id: c.id })) as T[];
    }

    return categories as T[];
  }

  private async queryChannels<T>(sql: string, params?: any[]): Promise<T[]> {
    let channels = await this.getCollection(this.CHANNELS_KEY);

    // Apply WHERE clauses
    if (sql.includes('where')) {
      if (sql.includes('category_id = ?') && params?.[0]) {
        channels = channels.filter((ch: any) => ch.category_id === params[0]);
      }

      if (sql.includes('is_active = 1')) {
        channels = channels.filter((ch: any) => ch.is_active === 1);
      }

      if (sql.includes('name like ?') && params?.[0]) {
        const searchTerm = params[0].replace(/%/g, '').toLowerCase();
        channels = channels.filter((ch: any) => 
          ch.name.toLowerCase().includes(searchTerm)
        );
      }
    }

    // Apply COUNT
    if (sql.includes('count(*)')) {
      return [{ count: channels.length }] as T[];
    }

    // Apply LIMIT
    if (sql.includes('limit')) {
      const limitMatch = sql.match(/limit\s+(\d+)/i);
      if (limitMatch) {
        channels = channels.slice(0, parseInt(limitMatch[1]));
      }
    }

    return channels as T[];
  }

  private async queryProviders<T>(sql: string, params?: any[]): Promise<T[]> {
    const providers = await this.getCollection(this.PROVIDERS_KEY);
    // If params specify provider ids (from WHERE id IN (?)), filter accordingly
    if (params && params.length > 0) {
      const ids = params as string[];
      return providers.filter((p: any) => ids.includes(p.id)) as T[];
    }
    return providers as T[];
  }

  private async handleDelete(sql: string): Promise<void> {
    if (sql.includes('from watch_progress')) {
      await this.saveCollection(this.PROGRESS_KEY, []);
    } else if (sql.includes('from episodes')) {
      await this.saveCollection(this.EPISODES_KEY, []);
    } else if (sql.includes('from series')) {
      await this.saveCollection(this.SERIES_KEY, []);
    } else if (sql.includes('from movies')) {
      await this.saveCollection(this.MOVIES_KEY, []);
    } else if (sql.includes('from channels')) {
      await this.saveCollection(this.CHANNELS_KEY, []);
    } else if (sql.includes('from categories')) {
      await this.saveCollection(this.CATEGORIES_KEY, []);
    } else if (sql.includes('from settings')) {
      await this.saveCollection(this.SETTINGS_KEY, []);
    } else if (sql.includes('from providers')) {
      await this.saveCollection(this.PROVIDERS_KEY, []);
    }
  }

  private async getCollection(key: string): Promise<any[]> {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private async saveCollection(key: string, data: any[]): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  }
}

/**
 * Factory to create the appropriate storage adapter based on platform
 */
export function createStorageAdapter(): IStorageAdapter {
  if (Platform.OS === 'web') {
    console.log('🌐 Using Web Cache Storage (AsyncStorage)');
    return new WebCacheAdapter();
  } else {
    console.log('📱 Using SQLite Storage (Native)');
    return new SQLiteAdapter();
  }
}
