const API_BASE = "/api";

export async function askQuestion(
  message: string,
  threadId: string | null,
  clientId?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      thread_id: threadId,
      client_id: clientId || "00000000-0000-0000-0000-000000000001",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export async function getThreads(clientId?: string): Promise<any> {
  const cid = clientId || "00000000-0000-0000-0000-000000000001";
  const res = await fetch(`${API_BASE}/threads?client_id=${cid}`);
  if (!res.ok) throw new Error("Failed to load threads");
  return res.json();
}

export async function getThread(threadId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`);
  if (!res.ok) throw new Error("Failed to load thread");
  return res.json();
}

export async function pinThread(
  threadId: string,
  isPinned: boolean,
  pinOrder?: number
): Promise<any> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/pin`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_pinned: isPinned, pin_order: pinOrder || 0 }),
  });
  if (!res.ok) throw new Error("Failed to pin thread");
  return res.json();
}

export async function getMetrics(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) throw new Error("Failed to load metrics");
  return res.json();
}

export async function getClients(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/clients`);
  if (!res.ok) throw new Error("Failed to load clients");
  return res.json();
}

export async function getDrilldown(
  filters: any,
  page = 1,
  pageSize = 25,
  clientId?: string
): Promise<any> {
  const cid = clientId || "00000000-0000-0000-0000-000000000001";
  const params = new URLSearchParams({
    client_id: cid,
    page: String(page),
    page_size: String(pageSize),
    filters: JSON.stringify(filters),
  });
  const res = await fetch(`${API_BASE}/drilldown?${params}`);
  if (!res.ok) throw new Error("Failed to load drilldown data");
  return res.json();
}

export async function seedDatabase(): Promise<any> {
  const res = await fetch(`${API_BASE}/seed`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Seed failed" }));
    throw new Error(err.error || "Seed failed");
  }
  return res.json();
}

export async function checkHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}
