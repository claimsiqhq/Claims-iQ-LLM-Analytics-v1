import { supabase } from "../config/supabase";
import { getMetrics } from "./metricRegistry";

/**
 * Represents a detected anomaly event
 */
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

/**
 * Options for anomaly detection
 */
export interface AnomalyDetectionOptions {
  metricSlugs?: string[];
  lookbackDays?: number;
  threshold?: number;
}

/**
 * Daily metric snapshot from the database
 */
interface DailyMetricValue {
  date: string;
  value: number;
}

/**
 * Anomaly detection engine using Z-score statistical method.
 * Uses metric_definitions and computes daily values from claims data
 * when metric_daily_values table is not available.
 */
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
        : metrics.slice(0, 5); // Default: analyze first 5 metrics

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

  /**
   * Analyzes a metric by querying claims data for daily aggregates
   */
  private async analyzeMetricFromClaims(
    clientId: string,
    metricSlug: string,
    lookbackDays: number,
    threshold: number
  ): Promise<AnomalyEvent | null> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const endDateStr = endDate.toISOString().split("T")[0];
    const startDateStr = startDate.toISOString().split("T")[0];

    // Query daily aggregates from claims for simple metrics
    const { data: dailyValues, error } = await supabase.rpc("execute_raw_sql", {
      query_text: `
        SELECT DATE(c.fnol_date)::text as date, COUNT(*)::float as value
        FROM claims c
        WHERE c.client_id = '${clientId.replace(/'/g, "''")}'
          AND c.fnol_date >= '${startDateStr}'
          AND c.fnol_date <= '${endDateStr}'
        GROUP BY DATE(c.fnol_date)
        ORDER BY date ASC
      `,
    });

    if (error || !dailyValues || !Array.isArray(dailyValues)) {
      return null;
    }

    const values = dailyValues as DailyMetricValue[];
    if (values.length < 3) return null;

    const currentValue = values[values.length - 1].value;
    const baselineValues = values.slice(0, -1).map((v) => v.value);
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
