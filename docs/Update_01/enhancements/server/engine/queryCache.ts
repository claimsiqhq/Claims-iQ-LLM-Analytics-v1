import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

/**
 * Represents a cached query result
 */
export interface CachedQueryResult {
  cacheKey: string;
  metricSlug: string;
  clientId: string;
  resultData: unknown;
  hitCount: number;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Query cache configuration
 */
export interface CacheConfig {
  ttlMinutes: number;
}

/**
 * Query caching engine for metric results
 *
 * Reduces database load by caching metric query results with automatic expiration
 * and hit tracking for analytics.
 */
export class QueryCache {
  /**
   * Retrieves a cached query result if available and not expired
   * @param cacheKey - The cache key (typically generated via generateCacheKey)
   * @returns Cached result data or null if not found/expired
   */
  async getCachedResult(cacheKey: string): Promise<unknown | null> {
    try {
      const now = new Date().toISOString();

      // Query the cache
      const { data: cacheEntry, error } = await supabase
        .from('query_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', now)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is expected
        throw new Error(`Cache lookup failed: ${error.message}`);
      }

      if (!cacheEntry) {
        return null;
      }

      // Increment hit count asynchronously (don't await to avoid latency impact)
      this.incrementHitCount(cacheKey).catch(err =>
        console.error('Failed to increment cache hit count:', err)
      );

      return cacheEntry.result_data;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      // Return null on error to allow fallthrough to fresh query
      return null;
    }
  }

  /**
   * Stores a query result in the cache
   * @param cacheKey - The cache key
   * @param metricSlug - The metric being cached
   * @param clientId - The client ID
   * @param resultData - The result data to cache
   * @param ttlMinutes - Time-to-live in minutes
   */
  async setCachedResult(
    cacheKey: string,
    metricSlug: string,
    clientId: string,
    resultData: unknown,
    ttlMinutes: number
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60000);

      const { error } = await supabase
        .from('query_cache')
        .upsert(
          {
            cache_key: cacheKey,
            metric_slug: metricSlug,
            client_id: clientId,
            result_data: resultData,
            hit_count: 0,
            created_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          },
          { onConflict: 'cache_key' }
        );

      if (error) {
        throw new Error(`Cache store failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Cache storage error:', error);
      // Don't throw - cache failures should not break the application
    }
  }

  /**
   * Generates a deterministic cache key from metric and filter parameters
   * @param metricSlug - The metric slug
   * @param clientId - The client ID
   * @param filters - Optional filter object
   * @param timeRange - Optional time range (e.g., "last_30_days")
   * @param dimensions - Optional dimension filters
   * @returns MD5 hash of the parameters
   */
  generateCacheKey(
    metricSlug: string,
    clientId: string,
    filters?: Record<string, unknown>,
    timeRange?: string,
    dimensions?: Record<string, unknown>
  ): string {
    const keyParts = [
      metricSlug,
      clientId,
      JSON.stringify(filters || {}),
      timeRange || 'default',
      JSON.stringify(dimensions || {}),
    ];

    const keyString = keyParts.join(':');
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * Removes expired cache entries
   * @returns Number of entries deleted
   */
  async cleanExpiredCache(): Promise<number> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('query_cache')
        .delete()
        .lt('expires_at', now)
        .select('cache_key');

      if (error) {
        throw new Error(`Cache cleanup failed: ${error.message}`);
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Clears all cache entries for a specific client
   * @param clientId - The client ID
   * @returns Number of entries deleted
   */
  async clearClientCache(clientId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('query_cache')
        .delete()
        .eq('client_id', clientId)
        .select('cache_key');

      if (error) {
        throw new Error(`Client cache clear failed: ${error.message}`);
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Client cache clear error:', error);
      return 0;
    }
  }

  /**
   * Clears cache entries for a specific metric
   * @param metricSlug - The metric slug
   * @param clientId - Optional client ID to limit scope
   * @returns Number of entries deleted
   */
  async clearMetricCache(metricSlug: string, clientId?: string): Promise<number> {
    try {
      let query = supabase
        .from('query_cache')
        .delete()
        .eq('metric_slug', metricSlug);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query.select('cache_key');

      if (error) {
        throw new Error(`Metric cache clear failed: ${error.message}`);
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Metric cache clear error:', error);
      return 0;
    }
  }

  /**
   * Gets cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    cacheSize: number;
    averageHitCount: number;
  }> {
    try {
      const now = new Date().toISOString();

      // Get all cache entries
      const { data: allEntries, error: allError } = await supabase
        .from('query_cache')
        .select('hit_count, result_data');

      if (allError) {
        throw new Error(`Stats query failed: ${allError.message}`);
      }

      // Get expired entries
      const { data: expiredEntries, error: expiredError } = await supabase
        .from('query_cache')
        .select('cache_key')
        .lt('expires_at', now);

      if (expiredError) {
        throw new Error(`Expired entries query failed: ${expiredError.message}`);
      }

      const totalEntries = allEntries?.length || 0;
      const expiredCount = expiredEntries?.length || 0;
      const totalHits = allEntries?.reduce((sum, entry) => sum + (entry.hit_count || 0), 0) || 0;
      const averageHitCount = totalEntries > 0 ? totalHits / totalEntries : 0;

      // Estimate cache size (rough approximation in bytes)
      const cacheSize =
        allEntries?.reduce((sum, entry) => {
          const dataSize = JSON.stringify(entry.result_data).length;
          return sum + dataSize;
        }, 0) || 0;

      return {
        totalEntries,
        expiredEntries: expiredCount,
        cacheSize,
        averageHitCount,
      };
    } catch (error) {
      console.error('Stats retrieval error:', error);
      return {
        totalEntries: 0,
        expiredEntries: 0,
        cacheSize: 0,
        averageHitCount: 0,
      };
    }
  }

  /**
   * Increments the hit count for a cache entry
   */
  private async incrementHitCount(cacheKey: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_cache_hit_count', {
        p_cache_key: cacheKey,
      });

      if (error && error.code !== 'PGRST204') {
        // PGRST204 means no rows affected, which is acceptable
        throw error;
      }
    } catch (error) {
      // Non-critical error, log but don't throw
      console.debug('Hit count increment failed:', error);
    }
  }
}

/**
 * Singleton instance
 */
export const queryCache = new QueryCache();
