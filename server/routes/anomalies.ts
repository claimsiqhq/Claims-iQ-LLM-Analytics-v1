import { Router, Request, Response } from "express";
import { anomalyDetector } from "../engine/anomalyDetector";
import { supabase } from "../config/supabase";
import { executeMetricQuery } from "../engine/queryCompiler";
import { getMetricBySlug } from "../engine/metricRegistry";
import { getMetrics } from "../engine/metricRegistry";
import type { ParsedIntent } from "../llm/intentParser";
import { getDefaultClientId } from "../config/defaults";

function mapConditionToSchema(condition: string): string {
  if (condition === "exceeds") return "gt";
  if (condition === "below") return "lt";
  if (condition === "anomaly") return "change_pct";
  if (["gt", "lt", "eq", "change_pct"].includes(condition)) return condition;
  return "gt";
}

export const anomaliesRouter = Router();

anomaliesRouter.get("/api/anomalies", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const metric = req.query.metric as string | undefined;
    const severity = req.query.severity as string | undefined;
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));

    if (severity && !["info", "warning", "critical"].includes(severity)) {
      return res.status(400).json({
        error: "Invalid severity",
        message: "Severity must be info, warning, or critical",
      });
    }

    const offset = (page - 1) * limit;

    let query = supabase
      .from("anomaly_events")
      .select("*", { count: "exact" })
      .eq("client_id", clientId);

    if (metric) query = query.eq("metric_slug", metric);
    if (severity) query = query.eq("severity", severity);
    if (fromDate) query = query.gte("detected_at", `${fromDate}T00:00:00`);
    if (toDate) query = query.lte("detected_at", `${toDate}T23:59:59`);

    const { data: anomalies, count, error } = await query
      .order("detected_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: (anomalies || []).map((a: any) => ({
        id: a.id,
        metricSlug: a.metric_slug,
        direction: a.direction === "spike" ? "up" : a.direction === "drop" ? "down" : a.direction,
        zScore: a.z_score,
        currentValue: a.current_value,
        baselineMean: a.baseline_mean,
        baselineStdDev: a.baseline_stddev ?? a.baseline_std_dev ?? 0,
        severity: a.severity,
        detectedAt: a.detected_at,
      })),
      pagination: { page, limit, totalCount, totalPages },
    });
  } catch (error) {
    console.error("Failed to retrieve anomalies:", error);
    res.status(500).json({
      error: "Failed to retrieve anomalies",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.get("/api/anomalies/detect", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const metricsParam = req.query.metrics as string | undefined;
    const lookbackDays = parseInt((req.query.lookback_days as string) || "30", 10) || 30;
    const threshold = parseFloat((req.query.threshold as string) || "2.0") || 2.0;

    const metricSlugs = metricsParam
      ? metricsParam.split(",").map((s) => s.trim())
      : undefined;

    const anomalies = await anomalyDetector.detectAnomalies(clientId, {
      metricSlugs,
      lookbackDays,
      threshold,
    });

    res.json({
      success: true,
      data: {
        detectionTime: new Date(),
        anomaliesDetected: anomalies.length,
        severityBreakdown: {
          critical: anomalies.filter((a) => a.severity === "critical").length,
          warning: anomalies.filter((a) => a.severity === "warning").length,
          info: anomalies.filter((a) => a.severity === "info").length,
        },
        anomalies: anomalies.slice(0, 10).map((a) => ({
          metricSlug: a.metricSlug,
          direction: a.direction,
          zScore: a.zScore,
          currentValue: a.currentValue,
          baselineMean: a.baselineMean,
          severity: a.severity,
        })),
      },
    });
  } catch (error) {
    console.error("Anomaly detection failed:", error);
    res.status(500).json({
      error: "Anomaly detection failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.get("/api/alert-rules", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();
    const activeOnly = req.query.active_only === "true";

    let query = supabase
      .from("alert_rules")
      .select("*")
      .eq("client_id", clientId);

    if (activeOnly) query = query.eq("is_active", true);

    const { data: rules, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const mapCondition = (c: string) => {
      if (c === "gt") return "exceeds";
      if (c === "lt") return "below";
      if (c === "change_pct") return "anomaly";
      return c;
    };
    res.json({
      success: true,
      data: (rules || []).map((r: any) => ({
        id: r.id,
        name: `${r.metric_slug} ${mapCondition(r.condition)} ${r.threshold}`,
        metricSlug: r.metric_slug,
        condition: mapCondition(r.condition ?? ""),
        threshold: r.threshold,
        severity: r.severity,
        isActive: r.is_active,
        notificationChannels: r.notification_channels ?? [],
        webhookUrl: r.webhook_url ?? null,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error("Failed to retrieve alert rules:", error);
    res.status(500).json({
      error: "Failed to retrieve alert rules",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.post("/api/alert-rules", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const userId = (req.headers["x-user-id"] as string) || (await (async () => {
      const { getDefaultUserId } = await import("../config/defaults");
      return getDefaultUserId();
    })());
    const { metricSlug, condition, threshold, severity } = req.body;

    if (!metricSlug || !condition || threshold === undefined) {
      return res.status(400).json({
        error: "Invalid input",
        message: "metricSlug, condition, and threshold are required",
      });
    }

    if (!["exceeds", "below", "anomaly", "gt", "lt", "eq", "change_pct"].includes(condition)) {
      return res.status(400).json({
        error: "Invalid condition",
        message: "Condition must be exceeds, below, anomaly, gt, lt, eq, or change_pct",
      });
    }

    const insertPayload: Record<string, unknown> = {
      client_id: clientId,
      user_id: userId,
      metric_slug: metricSlug,
      condition: mapConditionToSchema(condition),
      threshold,
      severity: severity || "warning",
      is_active: true,
    };
    if (req.body.webhookUrl !== undefined) insertPayload.webhook_url = req.body.webhookUrl;

    const { data: rule, error } = await supabase
      .from("alert_rules")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    const mapCond = (c: string) => {
      if (c === "gt") return "exceeds";
      if (c === "lt") return "below";
      if (c === "change_pct") return "anomaly";
      return c;
    };
    res.status(201).json({
      success: true,
      data: {
        id: rule.id,
        name: `${rule.metric_slug} ${mapCond(rule.condition)} ${rule.threshold}`,
        metricSlug: rule.metric_slug,
        condition: mapCond(rule.condition ?? ""),
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
        webhookUrl: rule.webhook_url ?? null,
        createdAt: rule.created_at,
      },
    });
  } catch (error) {
    console.error("Failed to create alert rule:", error);
    res.status(500).json({
      error: "Failed to create alert rule",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.patch("/api/alert-rules/:id", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();
    const ruleId = req.params.id;

    const updates: Record<string, unknown> = {};
    if (req.body.condition !== undefined) {
      updates.condition = mapConditionToSchema(req.body.condition);
    }
    if (req.body.threshold !== undefined) updates.threshold = req.body.threshold;
    if (req.body.severity !== undefined) updates.severity = req.body.severity;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;
    if (req.body.webhookUrl !== undefined) updates.webhook_url = req.body.webhookUrl;

    const { data: rule, error } = await supabase
      .from("alert_rules")
      .update(updates)
      .eq("id", ruleId)
      .eq("client_id", clientId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Not found",
          message: `Alert rule ${ruleId} not found`,
        });
      }
      throw new Error(`Failed to update alert rule: ${error.message}`);
    }

    const mapCondition = (c: string) => {
      if (c === "gt") return "exceeds";
      if (c === "lt") return "below";
      if (c === "change_pct") return "anomaly";
      return c;
    };
    res.json({
      success: true,
      data: {
        id: rule.id,
        name: `${rule.metric_slug} ${mapCondition(rule.condition)} ${rule.threshold}`,
        metricSlug: rule.metric_slug,
        condition: mapCondition(rule.condition ?? ""),
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
        webhookUrl: rule.webhook_url ?? null,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Failed to update alert rule:", error);
    res.status(500).json({
      error: "Failed to update alert rule",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.post("/api/alert-rules/execute", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();

    const { data: rules, error: rulesError } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .not("webhook_url", "is", null);

    if (rulesError || !rules?.length) {
      return res.json({ success: true, data: { fired: 0, evaluated: 0 } });
    }

    const fired: Array<{ ruleId: string; metricSlug: string; value: number; threshold: number }> = [];

    const metrics = await getMetrics();

    for (const rule of rules) {
      const metric = getMetricBySlug(metrics, rule.metric_slug);
      if (!metric) continue;

      const intent: Partial<ParsedIntent> = {
        metric: { slug: rule.metric_slug, display_name: metric.display_name },
        dimensions: [],
        filters: [],
        time_range: { type: "relative", value: "last_30_days", start: "", end: "" },
        comparison: null,
        chart_type: "bar",
        sort: null,
        limit: null,
        assumptions: [],
        confidence: 1,
      };
      const result = await executeMetricQuery(intent as ParsedIntent, metric, clientId);
      const row = result?.data?.[0];
      const value = row?.value ?? (row ? Object.values(row)[0] : 0);
      const numVal = typeof value === "number" ? value : parseFloat(String(value)) || 0;
      const threshold = parseFloat(String(rule.threshold)) || 0;
      let trigger = false;
      if (rule.condition === "gt" && numVal > threshold) trigger = true;
      if (rule.condition === "lt" && numVal < threshold) trigger = true;
      if (rule.condition === "eq" && Math.abs(numVal - threshold) < 0.001) trigger = true;

      if (trigger && rule.webhook_url) {
        try {
          await fetch(rule.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleId: rule.id,
              metricSlug: rule.metric_slug,
              condition: rule.condition,
              threshold,
              currentValue: numVal,
              severity: rule.severity,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) {
          console.error("Webhook delivery failed:", e);
        }
        fired.push({ ruleId: rule.id, metricSlug: rule.metric_slug, value: numVal, threshold });
      }
    }

    res.json({
      success: true,
      data: { fired: fired.length, evaluated: rules.length },
    });
  } catch (error) {
    console.error("Alert execution failed:", error);
    res.status(500).json({
      error: "Alert execution failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

anomaliesRouter.delete("/api/alert-rules/:id", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || await getDefaultClientId();
    const ruleId = req.params.id;

    const { error } = await supabase
      .from("alert_rules")
      .delete()
      .eq("id", ruleId)
      .eq("client_id", clientId);

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Not found",
          message: `Alert rule ${ruleId} not found`,
        });
      }
      throw new Error(`Failed to delete alert rule: ${error.message}`);
    }

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete alert rule:", error);
    res.status(500).json({
      error: "Failed to delete alert rule",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
