import { Platform } from 'react-native';
import { IStorageAdapter, createStorageAdapter } from './StorageAdapter';

export class Database {
  private static adapter: IStorageAdapter | null = null;
  private static isInitialized: boolean = false;

  static async init(): Promise<IStorageAdapter> {
    if (this.adapter) {
      return this.adapter;
    }

    this.adapter = createStorageAdapter();
    await this.adapter.init();
    this.isInitialized = true;
    
    console.log(`✅ Database initialized for platform: ${Platform.OS}`);
    return this.adapter;
  }

  static async getDatabase(): Promise<IStorageAdapter> {
    if (!this.adapter) {
      return this.init();
    }
    return this.adapter;
  }

  static async getDatabase(): Promise<IStorageAdapter> {
    if (!this.adapter) {
      return this.init();
    }
    return this.adapter;
  }

  static async clearAllData() {
    const adapter = await this.getDatabase();
    await adapter.execAsync(`
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
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = null;
    }
  }
}
