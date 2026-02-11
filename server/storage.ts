import { supabase } from "./config/supabase";

export interface IStorage {
  getClients(userId?: string): Promise<any[]>;
  getThreads(userId: string, clientId: string): Promise<any[]>;
  getThread(threadId: string): Promise<any>;
  getThreadTurns(threadId: string): Promise<any[]>;
  createThread(sessionId: string, userId: string, clientId: string, title: string): Promise<any>;
  updateThread(threadId: string, updates: any): Promise<any>;
  createTurn(turn: any): Promise<any>;
  getOrCreateSession(userId: string, clientId: string): Promise<any>;
  getDrilldownClaims(clientId: string, filters: any, page: number, pageSize: number): Promise<any>;
}

class SupabaseStorage implements IStorage {
  async getClients(userId?: string): Promise<any[]> {
    if (userId) {
      const { data, error } = await supabase
        .from("user_client_access")
        .select("client_id, clients(*)")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => r.clients);
    }
    const { data, error } = await supabase.from("clients").select("*");
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getThreads(userId: string, clientId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("threads")
      .select("*, thread_turns(chart_type, created_at)")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getThread(threadId: string): Promise<any> {
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getThreadTurns(threadId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("thread_turns")
      .select("*")
      .eq("thread_id", threadId)
      .order("turn_index", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async createThread(
    sessionId: string,
    userId: string,
    clientId: string,
    title: string
  ): Promise<any> {
    const { data, error } = await supabase
      .from("threads")
      .insert({ session_id: sessionId, user_id: userId, client_id: clientId, title })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateThread(threadId: string, updates: any): Promise<any> {
    const { data, error } = await supabase
      .from("threads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async createTurn(turn: any): Promise<any> {
    const { data, error } = await supabase
      .from("thread_turns")
      .insert(turn)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getOrCreateSession(userId: string, clientId: string): Promise<any> {
    const { data: existing } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .order("last_active_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      await supabase
        .from("sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", existing.id);
      return existing;
    }

    const { data, error } = await supabase
      .from("sessions")
      .insert({ user_id: userId, client_id: clientId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getDrilldownClaims(
    clientId: string,
    filters: any,
    page: number,
    pageSize: number
  ): Promise<any> {
    let query = supabase
      .from("claims")
      .select("*, adjusters(full_name, team)", { count: "exact" })
      .eq("client_id", clientId);

    if (filters.peril) query = query.eq("peril", filters.peril);
    if (filters.severity) query = query.eq("severity", filters.severity);
    if (filters.region) query = query.eq("region", filters.region);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.current_stage) query = query.eq("current_stage", filters.current_stage);
    if (filters.sla_breached !== undefined) query = query.eq("sla_breached", filters.sla_breached);
    if (filters.start_date) query = query.gte("fnol_date", filters.start_date);
    if (filters.end_date) query = query.lte("fnol_date", filters.end_date);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to).order("fnol_date", { ascending: false });

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: data || [], total: count || 0, page, pageSize };
  }
}

export const storage = new SupabaseStorage();
