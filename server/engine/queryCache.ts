import crypto from "crypto";
import { supabase } from "../config/supabase";

export interface CachedQueryResult {
  cacheKey: string;
  metricSlug: string;
  clientId: string;
  resultData: unknown;
  hitCount: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface CacheConfig {
  ttlMinutes: number;
}

export class QueryCache {
  async getCachedResult(cacheKey: string): Promise<unknown | null> {
    try {
      const now = new Date().toISOString();

      const { data: cacheEntry, error } = await supabase
        .from("query_cache")
        .select("*")
        .eq("cache_key", cacheKey)
        .gt("expires_at", now)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Cache lookup failed: ${error.message}`);
      }

      if (!cacheEntry) return null;

      this.incrementHitCount(cacheKey).catch((err) =>
        console.error("Failed to increment cache hit count:", err)
      );

      return cacheEntry.result_data;
    } catch (error) {
      console.error("Cache retrieval error:", error);
      return null;
    }
  }

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

      const { error } = await supabase.from("query_cache").upsert(
        {
          cache_key: cacheKey,
          metric_slug: metricSlug,
          client_id: clientId,
          result_data: resultData,
          hit_count: 0,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: "cache_key" }
      );

      if (error) {
        throw new Error(`Cache store failed: ${error.message}`);
      }
    } catch (error) {
      console.error("Cache storage error:", error);
    }
  }

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
      timeRange || "default",
      JSON.stringify(dimensions || {}),
    ];
    return crypto.createHash("md5").update(keyParts.join(":")).digest("hex");
  }

  async cleanExpiredCache(): Promise<number> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("query_cache")
        .delete()
        .lt("expires_at", now)
        .select("cache_key");
      if (error) throw new Error(`Cache cleanup failed: ${error.message}`);
      return data?.length || 0;
    } catch (error) {
      console.error("Cache cleanup error:", error);
      return 0;
    }
  }

  private async incrementHitCount(cacheKey: string): Promise<void> {
    try {
      const { error } = await supabase.rpc("increment_cache_hit_count", {
        p_cache_key: cacheKey,
      });
      if (error && error.code !== "PGRST204") throw error;
    } catch {
      /* non-critical */
    }
  }
}

export const queryCache = new QueryCache();
