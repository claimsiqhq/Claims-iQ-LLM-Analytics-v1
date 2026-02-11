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
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export async function getThreads(clientId?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/threads?client_id=${clientId || ""}`);
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
  const params = new URLSearchParams({
    client_id: clientId || "",
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

// Morning Brief
export async function getMorningBrief(clientId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/morning-brief?client_id=${clientId}`);
  if (!res.ok) throw new Error("Failed to fetch morning brief");
  const json = await res.json();
  return json.data;
}

// Anomalies
export async function getAnomalies(clientId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/anomalies?client_id=${clientId}`);
  if (!res.ok) throw new Error("Failed to fetch anomalies");
  const json = await res.json();
  return json.data;
}

// Alert Rules
export async function getAlertRules(clientId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/alert-rules?client_id=${clientId}`);
  if (!res.ok) throw new Error("Failed to fetch alert rules");
  const json = await res.json();
  return json.data || [];
}

// Export
export async function exportCSV(
  metric: string,
  clientId: string,
  startDate: string,
  endDate: string
): Promise<Blob> {
  const params = new URLSearchParams({
    metric,
    client_id: clientId,
    start_date: startDate,
    end_date: endDate,
  });
  const res = await fetch(`${API_BASE}/export/csv?${params}`);
  if (!res.ok) throw new Error("Failed to export CSV");
  return res.blob();
}

// Thread sharing
export async function shareThread(threadId: string): Promise<{ shareUrl: string; shareToken: string; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/share`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to share" }));
    throw new Error(err.error || "Failed to share thread");
  }
  const json = await res.json();
  return { shareUrl: json.data.shareUrl, shareToken: json.data.shareToken, expiresAt: json.data.expiresAt };
}

export async function getSharedThread(token: string): Promise<any> {
  const res = await fetch(`${API_BASE}/share/${token}`);
  if (!res.ok) throw new Error("Share not found or expired");
  const json = await res.json();
  return json.data;
}

// Thread annotations
export async function getAnnotations(threadId: string): Promise<Array<{ id: string; turnId: string | null; note: string; createdAt: string }>> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/annotations`);
  if (!res.ok) throw new Error("Failed to load annotations");
  const json = await res.json();
  return json.data || [];
}

export async function createAnnotation(threadId: string, turnId: string | null, note: string): Promise<any> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turnId, note }),
  });
  if (!res.ok) throw new Error("Failed to add annotation");
  return (await res.json()).data;
}

export async function updateAnnotation(threadId: string, annotationId: string, note: string): Promise<any> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/annotations/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error("Failed to update annotation");
  return (await res.json()).data;
}

export async function deleteAnnotation(threadId: string, annotationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/annotations/${annotationId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete annotation");
}

// Ingestion
export async function ingestPDF(file: File, clientId: string): Promise<any> {
  const formData = new FormData();
  formData.append("document", file);
  const res = await fetch(`${API_BASE}/ingest/pdf?client_id=${clientId}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload PDF");
  const json = await res.json();
  return json.data;
}
