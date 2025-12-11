/**
 * Media caching utilities for web
 * Uses Cache API to cache media files for offline access
 */

const CACHE_NAME = "tripsync-media-cache-v1";
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Initialize media cache
 */
export async function initMediaCache() {
  if (!("caches" in window)) {
    console.warn("Cache API not supported");
    return false;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    return true;
  } catch (error) {
    console.error("Error initializing media cache:", error);
    return false;
  }
}

/**
 * Cache a media file
 */
export async function cacheMedia(url) {
  if (!("caches" in window)) {
    return false;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Check if already cached
    const cached = await cache.match(url);
    if (cached) {
      return true;
    }

    // Fetch and cache
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response.clone());
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error caching media:", error);
    return false;
  }
}

/**
 * Get cached media or fetch if not cached
 */
export async function getCachedMedia(url) {
  if (!("caches" in window)) {
    return url;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    
    if (cached) {
      return URL.createObjectURL(await cached.blob());
    }

    // Not cached, fetch and cache
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response.clone());
      return url;
    }
    return url;
  } catch (error) {
    console.error("Error getting cached media:", error);
    return url;
  }
}

/**
 * Clear media cache
 */
export async function clearMediaCache() {
  if (!("caches" in window)) {
    return false;
  }

  try {
    const deleted = await caches.delete(CACHE_NAME);
    return deleted;
  } catch (error) {
    console.error("Error clearing media cache:", error);
    return false;
  }
}

/**
 * Get cache size (approximate)
 */
export async function getCacheSize() {
  if (!("caches" in window) || !("storage" in navigator && "estimate" in navigator.storage)) {
    return 0;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  } catch (error) {
    console.error("Error getting cache size:", error);
    return 0;
  }
}

