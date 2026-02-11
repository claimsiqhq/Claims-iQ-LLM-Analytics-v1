import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

export const exportRouter = Router();

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = [
    headers.map((h) => escapeCSVField(String(h))).join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          return escapeCSVField(v == null ? "" : String(v));
        })
        .join(",")
    ),
  ];
  return rows.join("\n");
}

exportRouter.get("/api/export/csv", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const threadId = req.query.thread_id as string | undefined;
    const turnId = req.query.turn_id as string | undefined;

    let threadIds: string[] | null = null;
    if (!threadId) {
      const { data: threads } = await supabase
        .from("threads")
        .select("id")
        .eq("client_id", clientId);
      threadIds = (threads || []).map((t: any) => t.id);
      if (threadIds.length === 0) threadIds = [];
    }

    let query = supabase
      .from("thread_turns")
      .select("*")
      .eq("intent_valid", true);

    if (threadId) query = query.eq("thread_id", threadId);
    else if (threadIds && threadIds.length > 0) query = query.in("thread_id", threadIds);
    else query = query.eq("thread_id", "none"); // no threads
    if (turnId) query = query.eq("id", turnId);

    const { data: turns, error } = await query.order("turn_index", {
      ascending: true,
    });

    if (error) {
      throw new Error(`Data retrieval failed: ${error.message}`);
    }

    const exportData = (turns || []).flatMap((t: any) => {
      const chartData = t.chart_data;
      if (!chartData?.labels || !chartData?.datasets) return [];
      return chartData.labels.map((label: string, i: number) => {
        const row: Record<string, unknown> = {
          thread_id: t.thread_id,
          turn_index: t.turn_index,
          label,
        };
        (chartData.datasets || []).forEach((ds: any, dsIdx: number) => {
          row[ds.label || `value_${dsIdx}`] = ds.values?.[i] ?? "";
        });
        return row;
      });
    });

    if (exportData.length === 0) {
      return res.status(404).json({
        error: "Not found",
        message: "No chart data found for the specified filters",
      });
    }

    const csv = convertToCSV(exportData);
    const fileName = `claims-export-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (error) {
    console.error("CSV export failed:", error);
    res.status(500).json({
      error: "CSV export failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

exportRouter.get("/api/export/json", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const threadId = req.query.thread_id as string | undefined;
    const pretty = req.query.pretty === "true";

    let threadIds: string[] | null = null;
    if (!threadId) {
      const { data: threads } = await supabase
        .from("threads")
        .select("id")
        .eq("client_id", clientId);
      threadIds = (threads || []).map((t: any) => t.id);
      if (threadIds.length === 0) threadIds = [];
    }

    let query = supabase
      .from("thread_turns")
      .select("*")
      .eq("intent_valid", true);

    if (threadId) query = query.eq("thread_id", threadId);
    else if (threadIds && threadIds.length > 0) query = query.in("thread_id", threadIds);
    else query = query.eq("thread_id", "none");

    const { data: turns, error } = await query.order("turn_index", {
      ascending: true,
    });

    if (error) {
      throw new Error(`Data retrieval failed: ${error.message}`);
    }

    const exportData = {
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        clientId,
        rowCount: turns?.length || 0,
        filters: { threadId: threadId || null },
      },
      data: (turns || []).map((t: any) => ({
        threadId: t.thread_id,
        turnIndex: t.turn_index,
        chartData: t.chart_data,
        chartType: t.chart_type,
        insightSummary: t.insight_summary,
      })),
    };

    const fileName = `claims-export-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(
      pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData)
    );
  } catch (error) {
    console.error("JSON export failed:", error);
    res.status(500).json({
      error: "JSON export failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

exportRouter.get("/api/export/status", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const exportId = req.query.export_id as string;

    if (!exportId) {
      return res.status(400).json({
        error: "Invalid input",
        message: "export_id is required",
      });
    }

    const { data, error } = await supabase
      .from("export_jobs")
      .select("*")
      .eq("id", exportId)
      .eq("client_id", clientId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Not found",
        message: `Export ${exportId} not found`,
      });
    }

    res.json({
      success: true,
      data: {
        id: data.id,
        status: data.status,
        progress: data.progress,
        rowsProcessed: data.rows_processed,
        totalRows: data.total_rows,
        downloadUrl: data.status === "completed" ? data.download_url : null,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      },
    });
  } catch (error) {
    console.error("Failed to get export status:", error);
    res.status(500).json({
      error: "Failed to get export status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
