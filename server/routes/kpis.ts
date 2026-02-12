import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

export const kpisRouter = Router();

function computeTrend(current: number, previous: number): { trend: "up" | "down" | "neutral"; delta: number } {
  if (previous === 0) return { trend: "neutral", delta: 0 };
  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.round(delta * 10) / 10;
  if (rounded > 0) return { trend: "up", delta: rounded };
  if (rounded < 0) return { trend: "down", delta: Math.abs(rounded) };
  return { trend: "neutral", delta: 0 };
}

kpisRouter.get("/api/kpis", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const safeClientId = clientId.replace(/'/g, "''");
    const today = new Date().toISOString().split("T")[0];
    const todayEnd = today + "T23:59:59";
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [
      queueRes, queuePrevRes,
      slaRes, slaPrevRes,
      claimsWeekRes, claimsPrevWeekRes,
      closedWeekRes, closedPrevWeekRes,
    ] = await Promise.all([
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.status NOT IN ('closed', 'denied')
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.status NOT IN ('closed', 'denied')
            AND c.fnol_date < '${weekAgo}'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT ROUND(AVG(CASE WHEN c.sla_breached THEN 1.0 ELSE 0.0 END)::numeric, 4) as value
          FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.fnol_date >= NOW() - INTERVAL '30 days'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT ROUND(AVG(CASE WHEN c.sla_breached THEN 1.0 ELSE 0.0 END)::numeric, 4) as value
          FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.fnol_date >= NOW() - INTERVAL '60 days'
            AND c.fnol_date < NOW() - INTERVAL '30 days'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.fnol_date >= '${weekAgo}'
            AND c.fnol_date <= '${todayEnd}'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.fnol_date >= '${twoWeeksAgo}'
            AND c.fnol_date < '${weekAgo}'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.closed_at IS NOT NULL
            AND c.closed_at >= '${weekAgo}T00:00:00'
            AND c.closed_at <= '${todayEnd}T23:59:59'
        `,
      }),
      supabase.rpc("execute_raw_sql", {
        query_text: `
          SELECT COUNT(*)::int as value FROM claims c
          WHERE c.client_id = '${safeClientId}'
            AND c.closed_at IS NOT NULL
            AND c.closed_at >= '${twoWeeksAgo}T00:00:00'
            AND c.closed_at < '${weekAgo}T00:00:00'
        `,
      }),
    ]);

    const queueDepth = (queueRes.data as any)?.[0]?.value ?? 0;
    const queuePrev = (queuePrevRes.data as any)?.[0]?.value ?? 0;
    const slaBreachRate = (slaRes.data as any)?.[0]?.value ?? 0;
    const slaPrev = (slaPrevRes.data as any)?.[0]?.value ?? 0;
    const claimsThisWeek = (claimsWeekRes.data as any)?.[0]?.value ?? 0;
    const claimsPrevWeek = (claimsPrevWeekRes.data as any)?.[0]?.value ?? 0;
    const closedThisWeek = (closedWeekRes.data as any)?.[0]?.value ?? 0;
    const closedPrevWeek = (closedPrevWeekRes.data as any)?.[0]?.value ?? 0;

    const queueTrend = computeTrend(Number(queueDepth), Number(queuePrev));
    const slaTrend = computeTrend(Number(slaBreachRate), Number(slaPrev));
    const claimsTrend = computeTrend(Number(claimsThisWeek), Number(claimsPrevWeek));
    const closedTrend = computeTrend(Number(closedThisWeek), Number(closedPrevWeek));

    res.json({
      success: true,
      data: [
        { label: "Queue Depth", value: queueDepth, unit: "claims", trend: queueTrend.trend, delta: queueTrend.delta },
        {
          label: "SLA Breach Rate",
          value: `${(slaBreachRate * 100).toFixed(1)}%`,
          unit: "%",
          trend: slaTrend.trend,
          delta: slaTrend.delta,
        },
        {
          label: "Claims This Week",
          value: claimsThisWeek,
          unit: "claims",
          trend: claimsTrend.trend,
          delta: claimsTrend.delta,
        },
        {
          label: "Closed This Week",
          value: closedThisWeek,
          unit: "claims",
          trend: closedTrend.trend,
          delta: closedTrend.delta,
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
