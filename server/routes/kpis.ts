import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

export const kpisRouter = Router();

kpisRouter.get("/api/kpis", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const today = new Date().toISOString().split("T")[0];
    const todayStart = today + "T00:00:00";
    const todayEnd = today + "T23:59:59";
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [queueRes, slaRes, claimsWeekRes, closedWeekRes] = await Promise.all([
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
            AND c.status IN ('open', 'in_progress', 'review')
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT ROUND(AVG(CASE WHEN c.sla_breached THEN 1.0 ELSE 0.0 END)::numeric, 4) as value
          FROM claims c
          WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
            AND c.fnol_date >= NOW() - INTERVAL '30 days'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
            AND c.fnol_date >= '${weekAgo}'
            AND c.fnol_date <= '${todayEnd}'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
            AND c.closed_at IS NOT NULL
            AND c.closed_at >= '${weekAgo}T00:00:00'
            AND c.closed_at <= '${todayEnd}T23:59:59'
        `,
      }),
    ]);

    const queueDepth = (queueRes.data as any)?.[0]?.value ?? 0;
    const slaBreachRate = (slaRes.data as any)?.[0]?.value ?? 0;
    const claimsThisWeek = (claimsWeekRes.data as any)?.[0]?.value ?? 0;
    const closedThisWeek = (closedWeekRes.data as any)?.[0]?.value ?? 0;

    res.json({
      success: true,
      data: [
        { label: "Queue Depth", value: queueDepth, unit: "claims", trend: "neutral" as const },
        {
          label: "SLA Breach Rate",
          value: `${(slaBreachRate * 100).toFixed(1)}%`,
          unit: "%",
          trend: "neutral" as const,
        },
        {
          label: "Claims This Week",
          value: claimsThisWeek,
          unit: "claims",
          trend: "neutral" as const,
        },
        {
          label: "Closed This Week",
          value: closedThisWeek,
          unit: "claims",
          trend: "neutral" as const,
        },
      ],
    });
  } catch (error) {
    console.error("Failed to fetch KPIs:", error);
    res.status(500).json({
      error: "Failed to fetch KPIs",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
