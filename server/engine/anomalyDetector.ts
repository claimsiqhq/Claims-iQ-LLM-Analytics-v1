import { supabase } from "../config/supabase";
import { getMetrics } from "./metricRegistry";
import { executeMetricQuery } from "./queryCompiler";
import { getMetricBySlug } from "./metricRegistry";
import type { ParsedIntent } from "../llm/intentParser";

export interface AnomalyEvent {
  metricSlug: string;
  direction: "up" | "down";
  zScore: number;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  severity: "info" | "warning" | "critical";
  detectedAt: Date;
}

export interface AnomalyDetectionOptions {
  metricSlugs?: string[];
  lookbackDays?: number;
  threshold?: number;
}

interface DailyMetricValue {
  date: string;
  value: number;
}

export class AnomalyDetector {
  async detectAnomalies(
    clientId: string,
    options: AnomalyDetectionOptions = {}
  ): Promise<AnomalyEvent[]> {
    const {
      metricSlugs,
      lookbackDays = 30,
      threshold = 2.0,
    } = options;

    const anomalies: AnomalyEvent[] = [];

    try {
      const metrics = await getMetrics();
      const metricsToAnalyze = metricSlugs?.length
        ? metrics.filter((m) => metricSlugs.includes(m.slug))
        : metrics.filter((m) =>
            ["claims_opened", "avg_cycle_time", "sla_breach_rate", "claims_closed", "avg_reserve_accuracy"].includes(m.slug)
          );

      if (metricsToAnalyze.length === 0) return [];

      for (const metric of metricsToAnalyze) {
        try {
          const anomaly = await this.analyzeMetricFromClaims(
            clientId,
            metric.slug,
            lookbackDays,
            threshold
          );
          if (anomaly) anomalies.push(anomaly);
        } catch (error) {
          console.error(`Error analyzing metric ${metric.slug}:`, error);
        }
      }

      if (anomalies.length > 0) {
        await this.storeAnomalies(clientId, anomalies);
      }

      anomalies.sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });

      return anomalies;
    } catch (error) {
      console.error("Anomaly detection failed:", error);
      throw error;
    }
  }

  private async analyzeMetricFromClaims(
    clientId: string,
    metricSlug: string,
    lookbackDays: number,
    threshold: number
  ): Promise<AnomalyEvent | null> {
    const metrics = await getMetrics();
    const metric = getMetricBySlug(metrics, metricSlug);
    if (!metric) return null;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const weeklyValues: number[] = [];
    const weeksToAnalyze = Math.floor(lookbackDays / 7);
    if (weeksToAnalyze < 3) return null;

    for (let w = 0; w < weeksToAnalyze; w++) {
      const weekEnd = new Date(endDate);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);

      const intent: ParsedIntent = {
        intent_type: "query",
        metric: { slug: metricSlug, display_name: metric.display_name },
        dimensions: [],
        filters: [],
        time_range: {
          type: "absolute",
          value: "custom",
          start: weekStart.toISOString().split("T")[0],
          end: weekEnd.toISOString().split("T")[0],
        },
        comparison: null,
        chart_type: "bar",
        sort: null,
        limit: null,
        assumptions: [],
        confidence: 1,
      };

      try {
        const result = await executeMetricQuery(intent, metric, clientId);
        const row = result?.data?.[0];
        const value = row?.value ?? (row ? Object.values(row)[0] : 0);
        const numVal = typeof value === "number" ? value : parseFloat(String(value)) || 0;
        weeklyValues.unshift(numVal);
      } catch {
        weeklyValues.unshift(0);
      }
    }

    if (weeklyValues.length < 3) return null;

    const currentValue = weeklyValues[weeklyValues.length - 1];
    const baselineValues = weeklyValues.slice(0, -1);
    const baselineMean =
      baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
    const variance =
      baselineValues.reduce((sum, val) => sum + Math.pow(val - baselineMean, 2), 0) /
      baselineValues.length;
    const baselineStdDev = Math.sqrt(variance);

    const zScore =
      baselineStdDev === 0 ? 0 : (currentValue - baselineMean) / baselineStdDev;
    const absZScore = Math.abs(zScore);

    if (absZScore <= threshold) return null;

    let severity: "info" | "warning" | "critical";
    if (absZScore > 3) severity = "critical";
    else if (absZScore > 2.5) severity = "warning";
    else severity = "info";

    const direction = currentValue > baselineMean ? "up" : "down";

    return {
      metricSlug,
      direction,
      zScore,
      currentValue,
      baselineMean,
      baselineStdDev,
      severity,
      detectedAt: new Date(),
    };
  }

  private async storeAnomalies(
    clientId: string,
    anomalies: AnomalyEvent[]
  ): Promise<void> {
    const records = anomalies.map((a) => ({
      client_id: clientId,
      metric_slug: a.metricSlug,
      direction: a.direction === "up" ? "spike" : "drop",
      z_score: a.zScore,
      current_value: a.currentValue,
      baseline_mean: a.baselineMean,
      baseline_stddev: a.baselineStdDev,
      severity: a.severity,
      detected_at: a.detectedAt.toISOString(),
    }));

    const { error } = await supabase.from("anomaly_events").insert(records);
    if (error) {
      console.error("Failed to store anomalies:", error.message);
    }
  }

}

export const anomalyDetector = new AnomalyDetector();

export async function seedDefaultAlertRules(clientId: string, userId?: string): Promise<void> {
  const { data: existing } = await supabase
    .from("alert_rules")
    .select("id")
    .eq("client_id", clientId)
    .limit(1);

  if (existing && existing.length > 0) return;

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const { data: users } = await supabase
      .from("users")
      .select("id")
      .limit(1);
    resolvedUserId = users?.[0]?.id;
    if (!resolvedUserId) return;
  }

  const defaultRules = [
    {
      client_id: clientId,
      user_id: resolvedUserId,
      metric_slug: "sla_breach_rate",
      condition: "gt",
      threshold: 20,
      severity: "critical",
      is_active: true,
    },
    {
      client_id: clientId,
      user_id: resolvedUserId,
      metric_slug: "cycle_time_e2e",
      condition: "gt",
      threshold: 45,
      severity: "warning",
      is_active: true,
    },
    {
      client_id: clientId,
      user_id: resolvedUserId,
      metric_slug: "human_override_rate",
      condition: "gt",
      threshold: 50,
      severity: "warning",
      is_active: true,
    },
    {
      client_id: clientId,
      user_id: resolvedUserId,
      metric_slug: "cost_per_claim",
      condition: "gt",
      threshold: 0.05,
      severity: "info",
      is_active: true,
    },
    {
      client_id: clientId,
      user_id: resolvedUserId,
      metric_slug: "re_review_count",
      condition: "gt",
      threshold: 10,
      severity: "warning",
      is_active: true,
    },
  ];

  const { error } = await supabase.from("alert_rules").insert(defaultRules);
  if (error) {
    console.error("Failed to seed alert rules:", error.message);
  } else {
    console.log(`Seeded ${defaultRules.length} default alert rules`);
  }
}
