import { supabase } from "./supabase";

let cachedDefaultClientId: string | null = null;
let cachedDefaultUserId: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function refreshCache(): Promise<void> {
  const now = Date.now();
  if (cachedDefaultClientId && cachedDefaultUserId && now - cacheTimestamp < CACHE_TTL_MS) {
    return;
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (clients?.length) {
    cachedDefaultClientId = clients[0].id;
  }

  const { data: users } = await supabase
    .from("users")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (users?.length) {
    cachedDefaultUserId = users[0].id;
  }

  cacheTimestamp = now;
}

export async function getDefaultClientId(): Promise<string> {
  await refreshCache();
  if (!cachedDefaultClientId) {
    throw new Error("No clients found in database. Please seed the database first via POST /api/seed.");
  }
  return cachedDefaultClientId;
}

export async function getDefaultUserId(): Promise<string> {
  await refreshCache();
  if (!cachedDefaultUserId) {
    throw new Error("No users found in database. Please seed the database first via POST /api/seed.");
  }
  return cachedDefaultUserId;
}

export function invalidateDefaultsCache(): void {
  cachedDefaultClientId = null;
  cachedDefaultUserId = null;
  cacheTimestamp = 0;
}

const TIME_RANGE_MAP: Record<string, string> = {
  "7d": "last_7_days",
  "30d": "last_30_days",
  "90d": "last_90_days",
};

export async function getClientPreferences(clientId: string): Promise<{
  default_chart_type: string;
  default_time_range: string;
} | null> {
  try {
    const { data } = await supabase
      .from("client_preferences")
      .select("default_chart_type, default_time_range")
      .eq("client_id", clientId)
      .single();
    if (!data) return null;
    return {
      default_chart_type: data.default_chart_type || "bar",
      default_time_range: TIME_RANGE_MAP[data.default_time_range] || data.default_time_range || "last_30_days",
    };
  } catch {
    return null;
  }
}
