// scripts/cache-demo.js
'use strict';

/**
 * @fileoverview Demo script to showcase the new cache functionality
 * including LRU eviction and persistent caching capabilities.
 */

const { getCacheManager, getComprehensiveCacheStats } = require('../src/cache');

/**
 * Runs a comprehensive demo of the cache functionality.
 * @returns {Promise<void>} Promise that resolves when demo completes
 */
async function runCacheDemo() {
  console.log('🚀 Variant Linker Cache Demo\n');

  // Get cache manager with persistent cache enabled
  const cacheManager = getCacheManager();

  console.log('📊 Initial cache configuration:');
  console.log(JSON.stringify(cacheManager.getConfig(), null, 2));
  console.log();

  // Demo 1: Basic caching
  console.log('📝 Demo 1: Basic cache operations');
  await cacheManager.set('demo-key-1', { message: 'Hello from cache!', timestamp: Date.now() });
  await cacheManager.set('demo-key-2', ['array', 'data', 'cached']);

  const data1 = await cacheManager.get('demo-key-1');
  const data2 = await cacheManager.get('demo-key-2');

  console.log('Retrieved data1:', data1);
  console.log('Retrieved data2:', data2);
  console.log();

  // Demo 2: LRU eviction
  console.log('📝 Demo 2: LRU eviction (memory cache has small size for demo)');

  // Fill beyond memory cache capacity to trigger LRU eviction
  for (let i = 1; i <= 10; i++) {
    await cacheManager.set(`lru-test-${i}`, `data-${i}`);
  }

  // Check which items are still in memory cache
  console.log('Items in memory cache after filling:');
  for (let i = 1; i <= 10; i++) {
    const inMemory = cacheManager.memoryCache.has(`lru-test-${i}`);
    console.log(`  lru-test-${i}: ${inMemory ? 'IN MEMORY' : 'evicted from memory'}`);
  }
  console.log();

  // Demo 3: Cache statistics
  console.log('📊 Demo 3: Cache statistics');
  const stats = await getComprehensiveCacheStats();
  console.log('Comprehensive cache stats:');
  console.log(JSON.stringify(stats, null, 2));
  console.log();

  // Demo 4: TTL demonstration
  console.log('📝 Demo 4: TTL (Time-To-Live) demonstration');
  await cacheManager.set('ttl-demo', 'This will expire soon', 2000); // 2 second TTL

  console.log('Item set with 2-second TTL...');
  console.log('Item exists:', await cacheManager.has('ttl-demo'));

  console.log('Waiting 3 seconds...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('Item exists after TTL:', await cacheManager.has('ttl-demo'));
  console.log();

  // Demo 5: Persistent cache (if enabled)
  if (cacheManager.persistentCache) {
    console.log('💾 Demo 5: Persistent cache functionality');

    // Set data in persistent cache
    await cacheManager.set('persistent-demo', {
      message: 'This survives application restarts!',
      created: new Date().toISOString(),
    });

    // Show that it's in both caches
    const memoryHas = cacheManager.memoryCache.has('persistent-demo');
    const persistentHas = await cacheManager.persistentCache.has('persistent-demo');

    console.log(`In memory cache: ${memoryHas}`);
    console.log(`In persistent cache: ${persistentHas}`);

    // Clear memory cache and retrieve from persistent
    cacheManager.memoryCache.clear();
    console.log('Memory cache cleared...');

    const retrievedFromPersistent = await cacheManager.get('persistent-demo');
    console.log('Retrieved from persistent cache:', retrievedFromPersistent);
    console.log('Item promoted back to memory:', cacheManager.memoryCache.has('persistent-demo'));
  } else {
    console.log('💾 Demo 5: Persistent cache is disabled in configuration');
    console.log('To enable: set persistent.enabled to true in config/apiConfig.json');
  }

  console.log('\n✅ Cache demo completed!');
  console.log('\n💡 Benefits of the enhanced cache:');
  console.log('  • LRU eviction prevents memory bloat');
  console.log('  • Configurable size limits and TTL');
  console.log('  • Optional persistent storage for cross-session caching');
  console.log('  • Two-tier architecture (L1: memory, L2: disk)');
  console.log('  • Automatic promotion from persistent to memory cache');
  console.log('  • Backward compatible with existing API');
}

// Run the demo
if (require.main === module) {
  runCacheDemo().catch((error) => {
    console.error('Cache demo failed:', error);
    throw error;
  });
}

module.exports = { runCacheDemo };
