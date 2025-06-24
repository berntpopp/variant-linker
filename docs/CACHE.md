# Cache Enhancement Documentation

The variant-linker cache system has been enhanced with LRU (Least Recently Used) eviction and optional persistent file-based caching. This document describes the new features and how to configure them.

## Overview

The enhanced cache system provides:

- **LRU Eviction**: Prevents memory bloat by evicting least recently used items when cache reaches size limit
- **Configurable Size Limits**: Set maximum number of entries in memory cache
- **TTL Support**: Time-to-live for cache entries with automatic expiration
- **Persistent Caching**: Optional file-based caching for cross-session persistence
- **Two-Tier Architecture**: L1 (memory) and L2 (persistent disk) caching
- **Backward Compatibility**: Existing API remains unchanged

## Configuration

Cache configuration is defined in `config/apiConfig.json`:

```json
{
  "cache": {
    "memory": {
      "maxSize": 100,
      "ttl": 300000,
      "sizeCalculation": {
        "enabled": false
      }
    },
    "persistent": {
      "enabled": false,
      "location": "~/.cache/variant-linker",
      "ttl": 86400000,
      "maxSize": "100MB"
    }
  }
}
```

### Memory Cache Options

- **`maxSize`**: Maximum number of entries in memory cache (default: 100)
- **`ttl`**: Default time-to-live in milliseconds (default: 300000 = 5 minutes)
- **`sizeCalculation.enabled`**: Enable size-based eviction (currently disabled)

### Persistent Cache Options

- **`enabled`**: Enable/disable persistent caching (default: false)
- **`location`**: Directory for cache files (default: `~/.cache/variant-linker`)
- **`ttl`**: Default TTL for persistent cache (default: 86400000 = 24 hours)
- **`maxSize`**: Maximum total size of persistent cache (e.g., "100MB", "1GB")

## API Usage

### Backward Compatible API

The existing synchronous API remains unchanged:

```javascript
const { setCache, getCache, clearCache, getCacheStats, hasCache } = require('./src/cache');

// Store data
setCache('key', data, ttl); // ttl is optional

// Retrieve data
const data = getCache('key'); // Returns null if not found or expired

// Check existence
const exists = hasCache('key');

// Clear cache
clearCache();

// Get statistics
const stats = getCacheStats();
```

### New Async API

For full two-tier cache functionality:

```javascript
const { getCacheAsync, hasCacheAsync, clearCacheAsync, getComprehensiveCacheStats } = require('./src/cache');

// Async operations that check both memory and persistent caches
const data = await getCacheAsync('key');
const exists = await hasCacheAsync('key');
await clearCacheAsync();

// Comprehensive statistics
const fullStats = await getComprehensiveCacheStats();
```

### Advanced Usage

Access the cache manager directly for advanced operations:

```javascript
const { getCacheManager } = require('./src/cache');

const cacheManager = getCacheManager();

// Direct tier access
const memoryCache = cacheManager.memoryCache;
const persistentCache = cacheManager.persistentCache; // null if disabled

// Full async API
await cacheManager.set('key', data, ttl);
const data = await cacheManager.get('key');
const exists = await cacheManager.has('key');
await cacheManager.delete('key');
await cacheManager.clear();

// Statistics
const stats = await cacheManager.getStats();
const config = cacheManager.getConfig();
```

## Cache Behavior

### Two-Tier Architecture

When persistent caching is enabled:

1. **L1 (Memory)**: Fast access, limited size, shorter TTL
2. **L2 (Persistent)**: Slower access, larger capacity, longer TTL

#### Cache Flow

- **Set**: Data stored in both L1 and L2 (if enabled)
- **Get**: Check L1 first, fallback to L2, promote to L1 on hit
- **Delete**: Remove from both tiers
- **Clear**: Clear both tiers

### LRU Eviction

When memory cache reaches `maxSize`:
- Least recently used item is evicted from memory
- Item remains in persistent cache (if enabled)
- Accessing evicted item promotes it back to memory

### TTL Handling

- Each tier has independent TTL configuration
- Memory cache typically has shorter TTL (5 minutes)
- Persistent cache has longer TTL (24 hours)
- Expired items are automatically cleaned up

## Performance Considerations

### Memory Cache

- Very fast access (hash map lookup)
- Limited by `maxSize` setting
- Use for frequently accessed data

### Persistent Cache

- Slower access (file I/O)
- Larger capacity
- Use for cross-session persistence

### Recommendations

1. **Memory Cache Size**: Set based on available RAM and usage patterns
2. **Persistent Cache**: Enable for batch processing workflows
3. **TTL Settings**: Balance between performance and data freshness
4. **Cache Location**: Use fast storage (SSD) for persistent cache

## Monitoring

### Basic Statistics

```javascript
const stats = getCacheStats();
console.log(stats);
// {
//   size: 50,
//   maxSize: 100,
//   calculatedSize: 0,
//   ttl: 300000,
//   itemCount: 50
// }
```

### Comprehensive Statistics

```javascript
const fullStats = await getComprehensiveCacheStats();
console.log(fullStats);
// {
//   memory: {
//     size: 50,
//     maxSize: 100,
//     calculatedSize: 0,
//     ttl: 300000,
//     itemCount: 50
//   },
//   persistent: {
//     enabled: true,
//     location: "/home/user/.cache/variant-linker",
//     totalFiles: 150,
//     validEntries: 140,
//     expiredEntries: 10,
//     totalSize: 52428800,
//     maxSize: 104857600,
//     defaultTTL: 86400000
//   }
// }
```

## Troubleshooting

### Persistent Cache Issues

1. **Permission Errors**: Ensure write access to cache directory
2. **Disk Space**: Monitor available space in cache location
3. **File Corruption**: Cache handles corrupted files gracefully

### Performance Issues

1. **High Memory Usage**: Reduce `memory.maxSize`
2. **Slow Access**: Check persistent cache location performance
3. **Cache Misses**: Verify TTL settings and data access patterns

### Debug Output

Enable debug logging:

```bash
DEBUG=variant-linker:cache* node your-script.js
DEBUG=variant-linker:cache-manager node your-script.js
DEBUG=variant-linker:persistent-cache node your-script.js
```

## Migration Guide

### From Previous Version

The enhanced cache is fully backward compatible. No code changes required for existing functionality.

### Enabling Persistent Cache

1. Update `config/apiConfig.json`:
   ```json
   {
     "cache": {
       "persistent": {
         "enabled": true
       }
     }
   }
   ```

2. Optionally configure location and TTL:
   ```json
   {
     "cache": {
       "persistent": {
         "enabled": true,
         "location": "/path/to/cache",
         "ttl": 86400000,
         "maxSize": "500MB"
       }
     }
   }
   ```

### Using New Async API

For applications needing persistent cache access:

```javascript
// Before (sync, memory only)
const data = getCache('key');

// After (async, both tiers)
const data = await getCacheAsync('key');
```

## Examples

### Basic Usage

```javascript
const { setCache, getCache } = require('./src/cache');

// Cache API response
setCache('variant-rs123', apiResponse, 600000); // 10 minute TTL

// Retrieve cached response
const cached = getCache('variant-rs123');
if (cached) {
  console.log('Using cached data');
  return cached;
}
```

### Batch Processing with Persistent Cache

```javascript
const { getCacheAsync, getCacheManager } = require('./src/cache');

// Enable persistent cache in config first
const cacheManager = getCacheManager();

async function processVariants(variants) {
  for (const variant of variants) {
    // Check cache first (both memory and persistent)
    let result = await getCacheAsync(variant);
    
    if (!result) {
      // Not in cache, process variant
      result = await processVariant(variant);
      
      // Cache for future use (24 hour TTL)
      await cacheManager.set(variant, result, 86400000);
    }
    
    console.log(`Processed ${variant}:`, result);
  }
}
```

### Cache Warming

```javascript
const { getCacheManager } = require('./src/cache');

async function warmCache(commonVariants) {
  const cacheManager = getCacheManager();
  
  for (const variant of commonVariants) {
    if (!await cacheManager.has(variant)) {
      const result = await processVariant(variant);
      await cacheManager.set(variant, result);
      console.log(`Warmed cache for ${variant}`);
    }
  }
}
```

## Demo Script

Run the included demo to see cache features in action:

```bash
node scripts/cache-demo.js
```

This demonstrates:
- Basic cache operations
- LRU eviction behavior
- TTL functionality
- Persistent cache features (if enabled)
- Statistics collection

## Testing

The cache system includes comprehensive tests:

```bash
# Run cache-specific tests
npx mocha test/cache.test.js
npx mocha test/persistent-cache.test.js
npx mocha test/cache-manager.test.js

# Run all tests
npm test
```

Test coverage includes:
- LRU eviction behavior
- TTL expiration
- Persistent file operations
- Two-tier cache coordination
- Error handling and recovery
- Configuration validation