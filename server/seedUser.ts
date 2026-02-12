import { supabase } from "./config/supabase";
import { invalidateDefaultsCache } from "./config/defaults";

export async function ensureDefaultUser(): Promise<string> {
  const { data: existingUsers } = await supabase
    .from("users")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingUsers?.length) {
    return existingUsers[0].id;
  }

  const { data: inserted, error } = await supabase
    .from("users")
    .insert({
      email: "admin@claimsiq.com",
      full_name: "Claims Manager",
      role: "claims_manager",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to create default user: ${error?.message || "unknown error"}`);
  }

  const userId = inserted.id;

  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (clients?.length) {
    const clientId = clients[0].id;
    const { data: existingAccess } = await supabase
      .from("user_client_access")
      .select("id")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .limit(1);

    if (!existingAccess?.length) {
      await supabase
        .from("user_client_access")
        .insert({ user_id: userId, client_id: clientId, role: "admin" });
    }
  }

  invalidateDefaultsCache();

  return userId;
}
