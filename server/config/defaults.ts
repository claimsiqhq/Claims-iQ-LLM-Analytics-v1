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
