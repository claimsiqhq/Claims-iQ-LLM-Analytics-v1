import { supabase } from "../config/supabase";

export interface MetricDefinition {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  description: string;
  calculation: string;
  unit: string;
  default_chart_type: string;
  allowed_dimensions: string[];
  allowed_time_grains: string[];
  is_active: boolean;
}

let cachedMetrics: MetricDefinition[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getMetrics(): Promise<MetricDefinition[]> {
  const now = Date.now();
  if (cachedMetrics && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedMetrics;
  }

  const { data, error } = await supabase
    .from("metric_definitions")
    .select("*")
    .eq("is_active", true)
    .order("category");

  if (error) throw new Error(`Failed to load metrics: ${error.message}`);

  cachedMetrics = data as MetricDefinition[];
  cacheTimestamp = now;
  return cachedMetrics;
}

export function getMetricBySlug(
  metrics: MetricDefinition[],
  slug: string
): MetricDefinition | undefined {
  return metrics.find((m) => m.slug === slug);
}

export function invalidateCache(): void {
  cachedMetrics = null;
  cacheTimestamp = 0;
}
