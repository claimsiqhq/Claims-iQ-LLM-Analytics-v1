import type { ParsedIntent } from "../llm/intentParser";
import type { MetricDefinition } from "./metricRegistry";
import { getMetricBySlug } from "./metricRegistry";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  metric?: MetricDefinition;
}

const VALID_OPERATORS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "between",
];

const VALID_CHART_TYPES = [
  "line", "bar", "stacked_bar", "area", "pie", "table", "heatmap", "waterfall",
];

const VALID_FILTER_FIELDS = [
  "peril", "severity", "region", "status", "current_stage",
  "sla_breached", "state_code", "adjuster", "team", "issue_type",
  "stage", "model", "decision_type", "cat_code", "coverage_type",
  "policy_type", "expense_category", "billing_type", "vendor_name",
];

export function validateIntent(
  intent: ParsedIntent,
  metrics: MetricDefinition[]
): ValidationResult {
  const errors: string[] = [];

  if (!intent.metric?.slug) {
    errors.push("Missing metric slug");
    return { valid: false, errors };
  }

  const metric = getMetricBySlug(metrics, intent.metric.slug);
  if (!metric) {
    errors.push(
      `Unknown metric "${intent.metric.slug}". Available: ${metrics.map((m) => m.slug).join(", ")}`
    );
    return { valid: false, errors };
  }

  if (!metric.is_active) {
    errors.push(`Metric "${intent.metric.slug}" is not active`);
  }

  for (const dim of intent.dimensions || []) {
    if (!metric.allowed_dimensions.includes(dim)) {
      errors.push(
        `Dimension "${dim}" not allowed for metric "${metric.slug}". Allowed: ${metric.allowed_dimensions.join(", ")}`
      );
    }
  }

  for (const filter of intent.filters || []) {
    if (!VALID_FILTER_FIELDS.includes(filter.field)) {
      errors.push(
        `Invalid filter field "${filter.field}". Valid fields: ${VALID_FILTER_FIELDS.join(", ")}`
      );
    }
    if (!VALID_OPERATORS.includes(filter.operator)) {
      errors.push(
        `Invalid operator "${filter.operator}". Valid: ${VALID_OPERATORS.join(", ")}`
      );
    }
  }

  if (intent.chart_type && !VALID_CHART_TYPES.includes(intent.chart_type)) {
    errors.push(
      `Invalid chart type "${intent.chart_type}". Valid: ${VALID_CHART_TYPES.join(", ")}`
    );
  }

  if (intent.time_range) {
    if (!intent.time_range.start || !intent.time_range.end) {
      errors.push("Time range must include start and end dates");
    }
  }

  return { valid: errors.length === 0, errors, metric };
}
