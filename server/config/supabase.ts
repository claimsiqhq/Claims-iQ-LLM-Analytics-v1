import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  let supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const mdMatch = supabaseUrl.match(/\[([^\]]+)\]/);
  if (mdMatch) supabaseUrl = mdMatch[1];
  supabaseUrl = supabaseUrl.replace(/\/+$/, "");
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_KEY || "").trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables");
  }

  _supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
