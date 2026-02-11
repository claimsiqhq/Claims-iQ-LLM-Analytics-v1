import { Router, Request, Response } from "express";
import { anomalyDetector } from "../engine/anomalyDetector";
import { supabase } from "../config/supabase";

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001";

export const anomaliesRouter = Router();

anomaliesRouter.get("/api/anomalies", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;

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
        direction: a.direction,
        zScore: a.z_score,
        currentValue: a.current_value,
        baselineMean: a.baseline_mean,
        baselineStdDev: a.baseline_std_dev,
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
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;

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
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
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

    res.json({
      success: true,
      data: (rules || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        metricSlug: r.metric_slug,
        condition: r.condition,
        threshold: r.threshold,
        severity: r.severity,
        isActive: r.is_active,
        notificationChannels: r.notification_channels,
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
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;

    const { name, metricSlug, condition, threshold, severity, notificationChannels } =
      req.body;

    if (!name || !metricSlug || !condition || threshold === undefined) {
      return res.status(400).json({
        error: "Invalid input",
        message: "name, metricSlug, condition, and threshold are required",
      });
    }

    const { data: rule, error } = await supabase
      .from("alert_rules")
      .insert([
        {
          client_id: clientId,
          name,
          metric_slug: metricSlug,
          condition,
          threshold,
          severity: severity || "warning",
          notification_channels: notificationChannels || [],
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        metricSlug: rule.metric_slug,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
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
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const ruleId = req.params.id;

    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.condition !== undefined) updates.condition = req.body.condition;
    if (req.body.threshold !== undefined) updates.threshold = req.body.threshold;
    if (req.body.severity !== undefined) updates.severity = req.body.severity;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;
    if (req.body.notificationChannels !== undefined) {
      updates.notification_channels = req.body.notificationChannels;
    }

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

    res.json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        metricSlug: rule.metric_slug,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
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

anomaliesRouter.delete("/api/alert-rules/:id", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const ruleId = req.params.id;

    const { error } = await supabase
      .from("alert_rules")
      .update({ deleted_at: new Date().toISOString() })
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
