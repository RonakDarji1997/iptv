# Platform-Specific Storage Implementation

## Overview

The mobile app now uses platform-specific storage solutions:
- **iOS & Android**: SQLite database (expo-sqlite)
- **Web**: AsyncStorage with JSON cache

## Architecture

### Storage Adapter Pattern

The implementation uses the **Adapter Pattern** to abstract storage operations:

```typescript
interface IStorageAdapter {
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
```

### Implementations

#### 1. SQLiteAdapter (iOS & Android)
- Uses `expo-sqlite` for native SQLite database
- Full SQL support with transactions
- Optimal performance for mobile devices
- Supports complex queries and indexes

#### 2. WebCacheAdapter (Web)
- Uses `@react-native-async-storage/async-storage`
- Stores data as JSON arrays
- Parses SQL queries to simulate database operations
- Transaction support (batches operations)

## How It Works

### Platform Detection

```typescript
import { Platform } from 'react-native';

export function createStorageAdapter(): IStorageAdapter {
  if (Platform.OS === 'web') {
    return new WebCacheAdapter();
  } else {
    return new SQLiteAdapter();
  }
}
```

### Database.ts

```typescript
import { createStorageAdapter, IStorageAdapter } from './StorageAdapter';

export class Database {
  private static adapter: IStorageAdapter | null = null;

  static async init(): Promise<IStorageAdapter> {
    if (this.adapter) {
      return this.adapter;
    }

    this.adapter = createStorageAdapter(); // Auto-detects platform
    await this.adapter.init();
    return this.adapter;
  }
}
```

## Usage in Repositories

No changes needed in repository code! The same SQL queries work across platforms:

```typescript
// CategoryRepository.ts
static async getLiveCategories(): Promise<Category[]> {
  const db = await Database.getDatabase();
  const result = await db.getAllRows<any>(`
    SELECT * FROM categories 
    WHERE type = 'LIVE' AND is_enabled = 1
    ORDER BY name ASC
  `);
  return result.map(row => ({ /* map to Category */ }));
}
```

## Web Storage Implementation

### Data Structure

Each table is stored as a separate AsyncStorage key:
- `web_providers` → Array of provider objects
- `web_categories` → Array of category objects  
- `web_channels` → Array of channel objects
- `web_movies` → Array of movie objects
- `web_series` → Array of series objects
- `web_episodes` → Array of episode objects
- `web_watch_progress` → Array of progress objects
- `web_settings` → Array of settings objects

### SQL Parsing

The WebCacheAdapter parses SQL queries to determine operations:

```typescript
// INSERT OR REPLACE INTO categories (id, name, ...) VALUES (?, ?, ...)
→ Upserts object into categories array

// SELECT * FROM categories WHERE type = 'LIVE'
→ Filters categories array by type

// DELETE FROM channels
→ Clears channels array
```

### Transaction Support

```typescript
await db.beginTransaction();  // Start batching operations
await db.runQuery(...);        // Queue operation
await db.runQuery(...);        // Queue operation
await db.commit();             // Execute all queued operations

// Or rollback if error
await db.rollback();           // Cancel all queued operations
```

## Benefits

1. **Unified API**: Same code works across all platforms
2. **No Code Duplication**: Repositories don't need platform checks
3. **Type Safety**: TypeScript interfaces ensure consistency
4. **Easy Testing**: Can swap adapters for testing
5. **Future-Proof**: Easy to add new storage backends

## Testing

### iOS/Android
```bash
cd mobile-app
npm start
# Press 'i' for iOS or 'a' for Android
```

Console should show:
```
📱 Using SQLite Storage (Native)
✅ SQLite database initialized (Native)
```

### Web
```bash
cd mobile-app
npm start
# Press 'w' for web
```

Console should show:
```
🌐 Using Web Cache Storage (AsyncStorage)
✅ Web cache storage initialized
```

## Limitations

### Web Storage Limitations

1. **No Complex Queries**: Simple WHERE clauses only
2. **No JOINs**: All data must be queried separately
3. **Limited Sorting**: Basic ORDER BY support
4. **Performance**: Slower for large datasets (loads entire arrays)
5. **No Indexes**: No query optimization

### Recommended Usage

- **Mobile (iOS/Android)**: Use for production apps with lots of data
- **Web**: Use for demos, testing, or small datasets only

## Future Enhancements

1. Add IndexedDB support for web (better performance)
2. Implement query caching for web
3. Add pagination support for large datasets
4. Optimize JSON parsing for web storage
5. Add data migration utilities

## Files Modified

- ✅ `src/database/StorageAdapter.ts` - NEW: Platform-specific adapters
- ✅ `src/database/Database.ts` - Updated to use adapter
- ✅ `src/repositories/CategoryRepository.ts` - Updated method calls
- ✅ `src/repositories/ChannelRepository.ts` - Updated method calls
- ✅ `src/services/StalkerSyncService.ts` - Updated method calls

## No Changes Needed

- ✅ `App.tsx` - Works as-is
- ✅ Screens and UI components - No changes
- ✅ `package.json` - expo-sqlite still required for native platforms
