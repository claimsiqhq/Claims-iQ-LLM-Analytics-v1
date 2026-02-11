import { supabase } from '../config/supabase.js';
import { getMetricBySlug } from './metricRegistry.js';

/**
 * Represents a detected anomaly event
 */
export interface AnomalyEvent {
  metricSlug: string;
  direction: 'up' | 'down';
  zScore: number;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  severity: 'info' | 'warning' | 'critical';
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
 * Anomaly detection engine using Z-score statistical method
 *
 * Analyzes metric trends over a lookback period and flags values that deviate
 * significantly from the baseline (rolling mean and standard deviation).
 */
export class AnomalyDetector {
  /**
   * Detects anomalies for a client's metrics
   * @param clientId - The client to analyze
   * @param options - Detection options (metric filters, lookback period, z-score threshold)
   * @returns Array of detected anomalies, sorted by severity
   */
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
      // Fetch metric definitions
      const { data: metrics, error: metricsError } = await supabase
        .from('metrics')
        .select('id, slug, name')
        .eq('client_id', clientId)
        .then(result => {
          if (metricSlugs && metricSlugs.length > 0) {
            return {
              ...result,
              data: result.data?.filter(m => metricSlugs.includes(m.slug)),
            };
          }
          return result;
        });

      if (metricsError) {
        throw new Error(`Failed to fetch metrics: ${metricsError.message}`);
      }

      if (!metrics || metrics.length === 0) {
        return [];
      }

      // Process each metric
      for (const metric of metrics) {
        try {
          const anomaly = await this.analyzeMetric(
            clientId,
            metric.id,
            metric.slug,
            lookbackDays,
            threshold
          );

          if (anomaly) {
            anomalies.push(anomaly);
          }
        } catch (error) {
          console.error(`Error analyzing metric ${metric.slug}:`, error);
          // Continue processing other metrics
        }
      }

      // Store detected anomalies
      if (anomalies.length > 0) {
        await this.storeAnomalies(clientId, anomalies);
      }

      // Sort by severity (critical first)
      anomalies.sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });

      return anomalies;
    } catch (error) {
      console.error('Anomaly detection failed:', error);
      throw error;
    }
  }

  /**
   * Analyzes a single metric for anomalies
   */
  private async analyzeMetric(
    clientId: string,
    metricId: string,
    metricSlug: string,
    lookbackDays: number,
    threshold: number
  ): Promise<AnomalyEvent | null> {
    // Calculate the date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const endDateStr = endDate.toISOString().split('T')[0];
    const startDateStr = startDate.toISOString().split('T')[0];

    // Query daily metric values
    const { data: dailyValues, error } = await supabase
      .from('metric_daily_values')
      .select('date, value')
      .eq('metric_id', metricId)
      .eq('client_id', clientId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch daily values for metric ${metricSlug}: ${error.message}`);
    }

    if (!dailyValues || dailyValues.length < 3) {
      // Insufficient data for statistical analysis
      return null;
    }

    const values = dailyValues as DailyMetricValue[];
    const currentValue = values[values.length - 1].value;

    // Calculate baseline (mean of all but the most recent value)
    const baselineValues = values.slice(0, -1).map(v => v.value);
    const baselineMean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;

    // Calculate standard deviation
    const variance =
      baselineValues.reduce((sum, val) => sum + Math.pow(val - baselineMean, 2), 0) /
      baselineValues.length;
    const baselineStdDev = Math.sqrt(variance);

    // Calculate Z-score
    const zScore = baselineStdDev === 0 ? 0 : (currentValue - baselineMean) / baselineStdDev;
    const absZScore = Math.abs(zScore);

    // Check if anomaly threshold is exceeded
    if (absZScore <= threshold) {
      return null;
    }

    // Determine severity
    let severity: 'info' | 'warning' | 'critical';
    if (absZScore > 3) {
      severity = 'critical';
    } else if (absZScore > 2.5) {
      severity = 'warning';
    } else {
      severity = 'info';
    }

    // Determine direction (increase or decrease)
    const direction = currentValue > baselineMean ? 'up' : 'down';

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

  /**
   * Stores detected anomalies in the database
   */
  private async storeAnomalies(
    clientId: string,
    anomalies: AnomalyEvent[]
  ): Promise<void> {
    const anomalyRecords = anomalies.map(anomaly => ({
      client_id: clientId,
      metric_slug: anomaly.metricSlug,
      direction: anomaly.direction,
      z_score: anomaly.zScore,
      current_value: anomaly.currentValue,
      baseline_mean: anomaly.baselineMean,
      baseline_std_dev: anomaly.baselineStdDev,
      severity: anomaly.severity,
      detected_at: anomaly.detectedAt.toISOString(),
    }));

    const { error } = await supabase
      .from('anomaly_events')
      .insert(anomalyRecords);

    if (error) {
      throw new Error(`Failed to store anomalies: ${error.message}`);
    }
  }
}

/**
 * Singleton instance
 */
export const anomalyDetector = new AnomalyDetector();
