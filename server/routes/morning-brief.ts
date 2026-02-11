import { Router, Request, Response } from "express";
import { morningBriefGenerator } from "../engine/morningBrief";
import { supabase } from "../config/supabase";
import { getDefaultClientId, getDefaultUserId } from "../config/defaults";

export const morningBriefRouter = Router();

morningBriefRouter.get("/api/morning-brief", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();
    const userId = await getDefaultUserId();

    const brief = await morningBriefGenerator.generateMorningBrief(clientId, userId);

    res.json({
      success: true,
      data: {
        date: brief.briefDate,
        content: brief.content,
        metrics: [
          { label: "Queue Depth", value: brief.metricsSnapshot.queueDepth, unit: "claims" },
          {
            label: "SLA Breach Rate",
            value: `${(brief.metricsSnapshot.slaBreachRate * 100).toFixed(1)}%`,
            unit: "%",
          },
          {
            label: "Claims Today",
            value: brief.metricsSnapshot.claimsReceivedToday,
            unit: "",
          },
        ],
        anomalies: brief.anomalyCount,
        generatedAt: brief.generatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to generate morning brief:", error);
    res.status(500).json({
      error: "Failed to generate morning brief",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

morningBriefRouter.get("/api/morning-brief/history", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "10", 10)));
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;

    const offset = (page - 1) * limit;

    let query = supabase
      .from("morning_briefs")
      .select("*", { count: "exact" })
      .eq("client_id", clientId);

    if (fromDate) query = query.gte("brief_date", fromDate);
    if (toDate) query = query.lte("brief_date", toDate);

    const { data: briefs, count, error } = await query
      .order("brief_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: (briefs || []).map((b: any) => ({
        briefDate: b.brief_date,
        content:
          (b.content || "").substring(0, 500) +
          (b.content?.length > 500 ? "..." : ""),
        metricsSnapshot: b.metrics_snapshot,
        anomalyCount: b.anomaly_count,
        generatedAt: b.generated_at,
      })),
      pagination: { page, limit, totalCount, totalPages },
    });
  } catch (error) {
    console.error("Failed to retrieve brief history:", error);
    res.status(500).json({
      error: "Failed to retrieve brief history",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

morningBriefRouter.get("/api/morning-brief/:briefDate", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();
    const briefDate = Array.isArray(req.params.briefDate) ? req.params.briefDate[0] : req.params.briefDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
      return res.status(400).json({
        error: "Invalid brief_date format",
        message: "Expected YYYY-MM-DD format",
      });
    }

    const { data: brief, error } = await supabase
      .from("morning_briefs")
      .select("*")
      .eq("client_id", clientId)
      .eq("brief_date", briefDate)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Not found",
          message: `No brief found for date ${briefDate}`,
        });
      }
      throw new Error(`Database query failed: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        briefDate: brief.brief_date,
        content: brief.content,
        metricsSnapshot: brief.metrics_snapshot,
        anomalyCount: brief.anomaly_count,
        generatedAt: brief.generated_at,
      },
    });
  } catch (error) {
    console.error("Failed to retrieve brief:", error);
    res.status(500).json({
      error: "Failed to retrieve brief",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
