import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001";

export const kpisRouter = Router();

kpisRouter.get("/api/kpis", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;

    const today = new Date().toISOString().split("T")[0];
    const todayStart = today + "T00:00:00";
    const todayEnd = today + "T23:59:59";

    const [queueRes, slaRes, claimsRes] = await Promise.all([
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
            AND c.status IN ('open', 'in_progress')
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
            AND c.fnol_date >= '${todayStart}'
            AND c.fnol_date <= '${todayEnd}'
        `,
      }),
    ]);

    const queueDepth = (queueRes.data as any)?.[0]?.value ?? 0;
    const slaBreachRate = (slaRes.data as any)?.[0]?.value ?? 0;
    const claimsToday = (claimsRes.data as any)?.[0]?.value ?? 0;

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
          label: "Claims Today",
          value: claimsToday,
          unit: "",
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
