import type { ParsedIntent } from "../llm/intentParser";
import type { MetricDefinition } from "./metricRegistry";
import { supabase } from "../config/supabase";
import {
  ENHANCED_METRIC_QUERIES,
  type QueryParams,
} from "./queryCompiler-additions";

interface QueryResult {
  data: any;
  queryMs: number;
  recordCount: number;
}

function sanitize(val: string | number): string {
  if (typeof val === "number") return String(val);
  return String(val).replace(/'/g, "''");
}

function buildWhereClause(
  intent: ParsedIntent,
  clientId: string
): { conditions: string; params: any[] } {
  const conditions: string[] = [`client_id = '${sanitize(clientId)}'`];
  const params: any[] = [];

  if (intent.time_range?.start && intent.time_range?.end) {
    conditions.push(
      `c.fnol_date >= '${sanitize(intent.time_range.start)}'`,
      `c.fnol_date <= '${sanitize(intent.time_range.end)}'`
    );
  }

  for (const filter of intent.filters || []) {
    const isAdjusterFilter = filter.field === "adjuster";

    if (isAdjusterFilter) {
      if (filter.operator === "eq") {
        conditions.push(
          `assigned_adjuster_id IN (SELECT id FROM adjusters WHERE LOWER(full_name) = LOWER('${sanitize(String(filter.value))}'))`
        );
      } else if (filter.operator === "neq") {
        conditions.push(
          `assigned_adjuster_id NOT IN (SELECT id FROM adjusters WHERE LOWER(full_name) = LOWER('${sanitize(String(filter.value))}'))`
        );
      } else if (filter.operator === "in" && Array.isArray(filter.value)) {
        const vals = filter.value.map((v) => `LOWER('${sanitize(v)}')`).join(", ");
        conditions.push(
          `assigned_adjuster_id IN (SELECT id FROM adjusters WHERE LOWER(full_name) IN (${vals}))`
        );
      } else if (filter.operator === "not_in" && Array.isArray(filter.value)) {
        const vals = filter.value.map((v) => `LOWER('${sanitize(v)}')`).join(", ");
        conditions.push(
          `assigned_adjuster_id NOT IN (SELECT id FROM adjusters WHERE LOWER(full_name) IN (${vals}))`
        );
      }
      continue;
    }

    const col = mapFilterFieldToColumn(filter.field);
    switch (filter.operator) {
      case "eq":
        conditions.push(`${col} = '${sanitize(String(filter.value))}'`);
        break;
      case "neq":
        conditions.push(`${col} != '${sanitize(String(filter.value))}'`);
        break;
      case "gt":
        conditions.push(`${col} > '${sanitize(String(filter.value))}'`);
        break;
      case "gte":
        conditions.push(`${col} >= '${sanitize(String(filter.value))}'`);
        break;
      case "lt":
        conditions.push(`${col} < '${sanitize(String(filter.value))}'`);
        break;
      case "lte":
        conditions.push(`${col} <= '${sanitize(String(filter.value))}'`);
        break;
      case "in":
        if (Array.isArray(filter.value)) {
          const vals = filter.value.map((v) => `'${sanitize(v)}'`).join(", ");
          conditions.push(`${col} IN (${vals})`);
        }
        break;
      case "not_in":
        if (Array.isArray(filter.value)) {
          const vals = filter.value.map((v) => `'${sanitize(v)}'`).join(", ");
          conditions.push(`${col} NOT IN (${vals})`);
        }
        break;
    }
  }

  return { conditions: conditions.join(" AND "), params };
}

function mapFilterFieldToColumn(field: string): string {
  const mapping: Record<string, string> = {
    stage: "current_stage",
    issue_type: "issue_types",
  };
  return mapping[field] || field;
}

function getDimensionColumn(dim: string): string {
  const mapping: Record<string, string> = {
    adjuster: "COALESCE(a.full_name, 'Unassigned')",
    peril: "c.peril",
    region: "c.region",
    severity: "c.severity",
    stage: "c.current_stage",
    status: "c.status",
    team: "a.team",
    model: "lu.model",
    issue_type: "unnest(c.issue_types)",
    day: "DATE_TRUNC('day', c.fnol_date)",
    week: "DATE_TRUNC('week', c.fnol_date)",
    month: "DATE_TRUNC('month', c.fnol_date)",
    priority: "c.severity",
    carrier: "cl.name",
    decision_type: "cr.review_type",
  };
  return mapping[dim] || `c.${dim}`;
}

function intentToQueryParams(intent: ParsedIntent, clientId: string): QueryParams {
  const now = new Date();
  const defaultEnd = now.toISOString().split("T")[0];
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const timeGrain =
    intent.dimensions?.includes("month") ||
    intent.time_range?.value?.includes("month")
      ? "month"
      : intent.dimensions?.includes("week") ||
          intent.time_range?.value?.includes("week")
        ? "week"
        : "day";
  const filters = (intent.filters || []).map((f) => ({
    field: f.field,
    operator: f.operator === "eq" ? "=" : f.operator === "neq" ? "!=" : f.operator,
    value: String(Array.isArray(f.value) ? f.value[0] : f.value),
  }));
  return {
    clientId,
    startDate: intent.time_range?.start || defaultStart,
    endDate: intent.time_range?.end || defaultEnd,
    timeGrain,
    filters,
    dimensions: intent.dimensions || [],
    limit: intent.limit ?? 1000,
  };
}

const METRIC_QUERIES: Record<
  string,
  (intent: ParsedIntent, clientId: string) => string
> = {
  claims_received: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY ${dimCols[0]}`
      : "";
    return `SELECT ${selectDims}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id LEFT JOIN clients cl ON c.client_id = cl.id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  claims_in_progress: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY ${dimCols[0]}`
      : "";
    return `SELECT ${selectDims}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} AND c.status IN ('open', 'in_progress', 'review') ${groupBy}`;
  },

  queue_depth: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.client_id = '${sanitize(clientId)}' AND c.status IN ('open', 'in_progress', 'review') ${groupBy}`;
  },

  cycle_time_e2e: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}AVG(EXTRACT(EPOCH FROM (COALESCE(c.closed_at, NOW()) - c.fnol_date)) / 86400.0) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  stage_dwell_time: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims
      .filter((d) => d !== "stage")
      .map((d) => (d === "adjuster" ? "a.full_name" : `sh.${d}`));
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = ["sh.stage", ...dimCols].join(", ");
    return `SELECT sh.stage as dim_0, ${selectDims}AVG(sh.dwell_days) as value FROM claim_stage_history sh JOIN claims c ON sh.claim_id = c.id LEFT JOIN adjusters a ON sh.adjuster_id = a.id AND a.client_id = c.client_id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY ${groupBy} ORDER BY value DESC`;
  },

  time_to_first_touch: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}AVG(EXTRACT(EPOCH FROM (c.first_touch_at - c.fnol_date)) / 3600.0) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} AND c.first_touch_at IS NOT NULL ${groupBy}`;
  },

  sla_breach_rate: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}ROUND(AVG(CASE WHEN c.sla_breached THEN 1.0 ELSE 0.0 END)::numeric, 4) as value, COUNT(*) as total FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  sla_breach_count: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} AND c.sla_breached = true ${groupBy}`;
  },

  issue_rate: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}ROUND(AVG(CASE WHEN c.has_issues THEN 1.0 ELSE 0.0 END)::numeric, 4) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  re_review_count: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims.map((d) =>
      d === "adjuster" ? "a.full_name" : `cr.${d === "peril" ? "c.peril" : d}`
    );
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}COUNT(*) as value FROM claim_reviews cr JOIN claims c ON cr.claim_id = c.id LEFT JOIN adjusters a ON cr.reviewer_id = a.id AND a.client_id = c.client_id WHERE c.client_id = '${sanitize(clientId)}' AND cr.review_type = 're_review' ${groupBy}`;
  },

  human_override_rate: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims.map((d) =>
      d === "stage" ? "cr.review_type" : d === "decision_type" ? "cr.outcome" : `cr.${d}`
    );
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}ROUND(AVG(CASE WHEN cr.human_override THEN 1.0 ELSE 0.0 END)::numeric, 4) as value FROM claim_reviews cr JOIN claims c ON cr.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' ${groupBy}`;
  },

  tokens_per_claim: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims.map((d) =>
      d === "model" ? "lu.model" : d === "stage" ? "lu.stage" : `lu.${d}`
    );
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}AVG(lu.input_tokens + lu.output_tokens) as value FROM claim_llm_usage lu JOIN claims c ON lu.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' ${groupBy}`;
  },

  cost_per_claim: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map((d) =>
      d === "model" ? "lu.model" : d === "stage" ? "lu.stage" : getDimensionColumn(d)
    );
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}AVG(lu.cost_usd) as value FROM claim_llm_usage lu JOIN claims c ON lu.claim_id = c.id LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  model_mix: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const extraDims = dims
      .filter((d) => d !== "model")
      .map((d) => (d === "stage" ? "lu.stage" : `lu.${d}`));
    const selectExtra = extraDims.length
      ? extraDims.map((d, i) => `${d} as dim_${i + 1}`).join(", ") + ", "
      : "";
    const groupBy = ["lu.model", ...extraDims].join(", ");
    return `SELECT lu.model as dim_0, ${selectExtra}COUNT(*) as value FROM claim_llm_usage lu JOIN claims c ON lu.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY ${groupBy} ORDER BY value DESC`;
  },

  llm_latency: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const dimCols = dims.map((d) =>
      d === "model" ? "lu.model" : d === "stage" ? "lu.stage" : `lu.${d}`
    );
    const selectDims = dimCols.length
      ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", "
      : "";
    const groupBy = dimCols.length
      ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC`
      : "";
    return `SELECT ${selectDims}AVG(lu.latency_ms) as value FROM claim_llm_usage lu JOIN claims c ON lu.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' ${groupBy}`;
  },

  severity_distribution: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const extraDims = dims
      .filter((d) => d !== "severity")
      .map(getDimensionColumn);
    const selectExtra = extraDims.length
      ? extraDims.map((d, i) => `${d} as dim_${i + 1}`).join(", ") + ", "
      : "";
    const groupBy = ["c.severity", ...extraDims].join(", ");
    return `SELECT c.severity as dim_0, ${selectExtra}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} GROUP BY ${groupBy} ORDER BY value DESC`;
  },

  high_severity_trend: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const timeDim = dims.includes("month")
      ? "month"
      : dims.includes("week")
        ? "week"
        : "month";
    const extraDims = dims
      .filter((d) => !["day", "week", "month"].includes(d))
      .map(getDimensionColumn);
    const selectExtra = extraDims.length
      ? extraDims.map((d, i) => `${d} as dim_${i + 1}`).join(", ") + ", "
      : "";
    const groupBy = [
      `DATE_TRUNC('${timeDim}', c.fnol_date)`,
      ...extraDims,
    ].join(", ");
    return `SELECT DATE_TRUNC('${timeDim}', c.fnol_date) as dim_0, ${selectExtra}COUNT(*) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} AND c.severity IN ('high', 'critical') GROUP BY ${groupBy} ORDER BY dim_0`;
  },

  // Enhanced metrics (documentation, policy, financial) — delegated to additions
  photo_count_per_claim: (intent, clientId) =>
    ENHANCED_METRIC_QUERIES.photo_count_per_claim?.(intentToQueryParams(intent, clientId))?.sql ||
    `SELECT 'N/A' as dim_0, 0 as value`,
  areas_documented: (intent, clientId) =>
    ENHANCED_METRIC_QUERIES.areas_documented?.(intentToQueryParams(intent, clientId))?.sql ||
    `SELECT 'N/A' as dim_0, 0 as value`,
  damage_type_coverage: (intent, clientId) =>
    ENHANCED_METRIC_QUERIES.damage_type_coverage?.(intentToQueryParams(intent, clientId))?.sql ||
    `SELECT 'N/A' as dim_0, 0 as value`,
  endorsement_frequency: (intent, clientId) =>
    ENHANCED_METRIC_QUERIES.endorsement_frequency?.(intentToQueryParams(intent, clientId))?.sql ||
    `SELECT 'N/A' as dim_0, 0 as value`,
  roof_coverage_rate: (intent, clientId) =>
    ENHANCED_METRIC_QUERIES.roof_coverage_rate?.(intentToQueryParams(intent, clientId))?.sql ||
    `SELECT 'N/A' as dim_0, 0 as value`,

  // Financial metrics using claim_policies, claim_estimates, claim_billing
  reserve_amount: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", " : "";
    const groupBy = dimCols.length ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC` : "";
    return `SELECT ${selectDims}ROUND(AVG(c.reserve_amount)::numeric, 2) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  paid_amount: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", " : "";
    const groupBy = dimCols.length ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC` : "";
    return `SELECT ${selectDims}ROUND(AVG(c.paid_amount)::numeric, 2) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  estimate_accuracy: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", " : "";
    const groupBy = dimCols.length ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC` : "";
    return `SELECT ${selectDims}ROUND(AVG(CASE WHEN c.paid_amount > 0 THEN ce.estimated_amount / c.paid_amount ELSE NULL END)::numeric, 4) as value FROM claim_estimates ce JOIN claims c ON ce.claim_id = c.id LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} AND c.paid_amount > 0 ${groupBy}`;
  },

  depreciation_ratio: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", " : "";
    const groupBy = dimCols.length ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC` : "";
    return `SELECT ${selectDims}ROUND(AVG(CASE WHEN ce.replacement_cost > 0 THEN ce.depreciation_amount / ce.replacement_cost ELSE 0 END)::numeric, 4) as value FROM claim_estimates ce JOIN claims c ON ce.claim_id = c.id LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} ${groupBy}`;
  },

  coverage_type_distribution: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const extraDims = dims.filter(d => d !== "coverage_type").map(getDimensionColumn);
    const selectExtra = extraDims.length ? extraDims.map((d, i) => `${d} as dim_${i + 1}`).join(", ") + ", " : "";
    const groupBy = ["cp.coverage_type", ...extraDims].join(", ");
    return `SELECT cp.coverage_type as dim_0, ${selectExtra}COUNT(*) as value FROM claim_policies cp JOIN claims c ON cp.claim_id = c.id LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY ${groupBy} ORDER BY value DESC`;
  },

  total_expenses_per_claim: (intent, clientId) => {
    const dims = intent.dimensions || [];
    if (dims.includes("expense_category")) {
      return `SELECT cb.expense_category as dim_0, ROUND(AVG(cb.amount)::numeric, 2) as value FROM claim_billing cb JOIN claims c ON cb.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cb.expense_category ORDER BY value DESC`;
    }
    if (dims.includes("vendor_name")) {
      return `SELECT cb.vendor_name as dim_0, ROUND(SUM(cb.amount)::numeric, 2) as value FROM claim_billing cb JOIN claims c ON cb.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cb.vendor_name ORDER BY value DESC`;
    }
    const dimCols = dims.map(getDimensionColumn);
    const selectDims = dimCols.length ? dimCols.map((d, i) => `${d} as dim_${i}`).join(", ") + ", " : "";
    const groupBy = dimCols.length ? `GROUP BY ${dimCols.join(", ")} ORDER BY value DESC` : "";
    return `SELECT ${selectDims}ROUND(AVG(total)::numeric, 2) as value FROM (SELECT cb.claim_id, SUM(cb.amount) as total FROM claim_billing cb JOIN claims c ON cb.claim_id = c.id LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cb.claim_id) sub ${groupBy}`;
  },

  expense_type_breakdown: (intent, clientId) => {
    return `SELECT cb.expense_category as dim_0, ROUND(SUM(cb.amount)::numeric, 2) as value FROM claim_billing cb JOIN claims c ON cb.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cb.expense_category ORDER BY value DESC`;
  },

  net_claim_amount_trend: (intent, clientId) => {
    const dims = intent.dimensions || [];
    const { conditions } = buildWhereClause(intent, clientId);
    const timeDim = dims.includes("month") ? "month" : dims.includes("week") ? "week" : "month";
    const extraDims = dims.filter(d => !["day", "week", "month"].includes(d)).map(getDimensionColumn);
    const selectExtra = extraDims.length ? extraDims.map((d, i) => `${d} as dim_${i + 1}`).join(", ") + ", " : "";
    const groupBy = [`DATE_TRUNC('${timeDim}', c.fnol_date)`, ...extraDims].join(", ");
    return `SELECT DATE_TRUNC('${timeDim}', c.fnol_date) as dim_0, ${selectExtra}ROUND(SUM(c.paid_amount)::numeric, 2) as value FROM claims c LEFT JOIN adjusters a ON c.assigned_adjuster_id = a.id AND a.client_id = c.client_id WHERE ${conditions.replace(/client_id/g, "c.client_id")} GROUP BY ${groupBy} ORDER BY dim_0`;
  },

  deductible_analysis: (intent, clientId) => {
    const dims = intent.dimensions || [];
    if (dims.includes("policy_type")) {
      return `SELECT cp.policy_type as dim_0, ROUND(AVG(cp.deductible)::numeric, 2) as value FROM claim_policies cp JOIN claims c ON cp.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cp.policy_type ORDER BY value DESC`;
    }
    if (dims.includes("coverage_type")) {
      return `SELECT cp.coverage_type as dim_0, ROUND(AVG(cp.deductible)::numeric, 2) as value FROM claim_policies cp JOIN claims c ON cp.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}' GROUP BY cp.coverage_type ORDER BY value DESC`;
    }
    return `SELECT ROUND(AVG(cp.deductible)::numeric, 2) as value FROM claim_policies cp JOIN claims c ON cp.claim_id = c.id WHERE c.client_id = '${sanitize(clientId)}'`;
  },
};

export async function executeMetricQuery(
  intent: ParsedIntent,
  metric: MetricDefinition,
  clientId: string
): Promise<QueryResult> {
  const queryBuilder = METRIC_QUERIES[metric.slug];
  if (!queryBuilder) {
    throw new Error(`No query implementation for metric: ${metric.slug}`);
  }

  const sql = queryBuilder(intent, clientId);
  const start = Date.now();
  const { data, error } = await supabase.rpc("execute_raw_sql", {
    query_text: sql,
  });

  const queryMs = Date.now() - start;

  if (error) {
    console.error(`[queryCompiler] SQL error for ${metric.slug}:`, error.message);
    console.error(`[queryCompiler] SQL was:`, sql);
    throw new Error(`Query failed for ${metric.slug}: ${error.message}`);
  }

  return {
    data: data || [],
    queryMs,
    recordCount: Array.isArray(data) ? data.length : 0,
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(isoStr: string, grain: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const mon = MONTH_NAMES[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  if (grain === "month") return `${mon} ${year}`;
  if (grain === "week") return `Week of ${mon} ${day}`;
  return `${mon} ${day}`;
}

export function formatChartData(
  rawData: any[],
  intent: ParsedIntent,
  metric: MetricDefinition
): {
  type: string;
  data: { labels: string[]; datasets: Array<{ label: string; values: number[]; unit: string }> };
  title: string;
} {
  const chartType = intent.chart_type || metric.default_chart_type;

  const timeDims = new Set(["day", "week", "month"]);
  const hasTimeDim = intent.dimensions?.some((d) => timeDims.has(d)) ?? false;
  const timeDimGrain = intent.dimensions?.find((d) => timeDims.has(d));

  const labels = rawData.map((row) => {
    const dimKeys = Object.keys(row).filter((k) => k.startsWith("dim_"));
    if (dimKeys.length === 0) return metric.display_name;
    return dimKeys
      .map((k, idx) => {
        const val = row[k];
        if (val == null) return "Unknown";
        const valStr = String(val);
        if (idx === 0 && hasTimeDim && valStr.match(/^\d{4}-\d{2}-\d{2}/)) {
          return formatDateLabel(valStr, timeDimGrain || "day");
        }
        if (val instanceof Date) return formatDateLabel(val.toISOString(), "day");
        return valStr;
      })
      .join(" / ");
  });

  const values = rawData.map((row) => {
    const val = parseFloat(row.value);
    if (metric.unit === "percentage") return Math.round(val * 10000) / 100;
    return Math.round(val * 100) / 100;
  });

  const dims = intent.dimensions?.length
    ? ` by ${intent.dimensions.join(", ")}`
    : "";
  const timeLabel = intent.time_range?.value
    ? ` — ${intent.time_range.value.replace(/_/g, " ")}`
    : "";

  return {
    type: chartType,
    data: {
      labels,
      datasets: [
        {
          label: metric.display_name,
          values,
          unit: metric.unit || "count",
        },
      ],
    },
    title: `${metric.display_name}${dims}${timeLabel}`,
  };
}

export function formatChartDataForComparison(
  rawDataCurrent: any[],
  rawDataComparison: any[],
  intent: ParsedIntent,
  metric: MetricDefinition,
  comparisonLabel = "Previous Period"
): {
  type: string;
  data: { labels: string[]; datasets: Array<{ label: string; values: number[]; unit: string }> };
  title: string;
} {
  const unit = metric.unit || "count";
  const chartType = intent.chart_type || "bar";
  const timeLabel = intent.time_range?.value ? ` — ${intent.time_range.value.replace(/_/g, " ")}` : "";
  const hasDims = rawDataCurrent.some((r) => Object.keys(r).some((k) => k.startsWith("dim_")));

  const parseVal = (row: any) => {
    const val = parseFloat(row.value || 0);
    return unit === "percentage" ? Math.round(val * 10000) / 100 : Math.round(val * 100) / 100;
  };

  const getDimLabel = (row: any) => {
    const dimKeys = Object.keys(row).filter((k) => k.startsWith("dim_"));
    if (dimKeys.length === 0) return metric.display_name;
    return dimKeys.map((k) => String(row[k] ?? "Unknown")).join(" / ");
  };

  if (hasDims) {
    const currentMap = new Map<string, number>();
    rawDataCurrent.forEach((r) => currentMap.set(getDimLabel(r), parseVal(r)));
    const compMap = new Map<string, number>();
    rawDataComparison.forEach((r) => compMap.set(getDimLabel(r), parseVal(r)));

    const allLabels = Array.from(new Set([...currentMap.keys(), ...compMap.keys()]));
    allLabels.sort();

    return {
      type: chartType,
      data: {
        labels: allLabels,
        datasets: [
          { label: "Current Period", values: allLabels.map((l) => currentMap.get(l) ?? 0), unit },
          { label: comparisonLabel, values: allLabels.map((l) => compMap.get(l) ?? 0), unit },
        ],
      },
      title: `${metric.display_name} vs ${comparisonLabel}${timeLabel}`,
    };
  }

  const avgCurrent =
    rawDataCurrent.length > 0
      ? rawDataCurrent.reduce((s, r) => s + parseFloat(r.value || 0), 0) / rawDataCurrent.length
      : 0;
  const avgComparison =
    rawDataComparison.length > 0
      ? rawDataComparison.reduce((s, r) => s + parseFloat(r.value || 0), 0) / rawDataComparison.length
      : 0;

  const currentVal = unit === "percentage" ? Math.round(avgCurrent * 10000) / 100 : Math.round(avgCurrent * 100) / 100;
  const compVal = unit === "percentage" ? Math.round(avgComparison * 10000) / 100 : Math.round(avgComparison * 100) / 100;

  return {
    type: chartType,
    data: {
      labels: ["Current Period", comparisonLabel],
      datasets: [
        { label: "Current", values: [currentVal], unit },
        { label: comparisonLabel, values: [compVal], unit },
      ],
    },
    title: `${metric.display_name} vs ${comparisonLabel}${timeLabel}`,
  };
}
