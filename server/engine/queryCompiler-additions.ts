/**
 * Enhanced metric SQL query builders for Claims iQ Analytics.
 * 11 new metrics: documentation, policy, financial.
 */

function sanitizeAdditions(value: string): string {
  if (!value || typeof value !== "string") return "";
  return value.replace(/'/g, "''").trim();
}

function validateUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function validateDate(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(date);
}

function validateTimeGrain(grain: string): string {
  const validGrains = ["day", "week", "month", "quarter", "year"];
  return validGrains.includes(grain) ? grain : "day";
}

export interface QueryParams {
  clientId: string;
  startDate: string;
  endDate: string;
  timeGrain: string;
  filters: Array<{ field: string; operator: string; value: string }>;
  dimensions: string[];
  limit?: number;
}

export interface QueryResult {
  sql: string;
  formatType: string;
}

function buildAdditionsWhere(
  clientId: string,
  startDate: string,
  endDate: string,
  dateCol: string
): string {
  return `c.client_id = '${sanitizeAdditions(clientId)}'
    AND ${dateCol} BETWEEN '${sanitizeAdditions(startDate)}'::TIMESTAMPTZ
    AND '${sanitizeAdditions(endDate)}'::TIMESTAMPTZ`;
}

export function photo_count_per_claim(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(photo_stats.photo_count) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as photo_count
        FROM claim_photos cp
        WHERE cp.claim_id = c.id
      ) photo_stats ON TRUE
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function areas_documented(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(area_stats.distinct_areas) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT area_documented) as distinct_areas
        FROM claim_photos cp
        WHERE cp.claim_id = c.id
          AND cp.area_documented IS NOT NULL
      ) area_stats ON TRUE
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function damage_type_coverage(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        COALESCE(cp.damage_type, 'unknown') AS dimension,
        COUNT(*) AS value
      FROM claims c
      LEFT JOIN claim_photos cp ON c.id = cp.claim_id
      WHERE ${where}
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "dimensional",
  };
}

export function coverage_type_distribution(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        COALESCE(cpol.coverage_type, 'unknown') AS dimension,
        COUNT(*) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE ${where}
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "dimensional",
  };
}

export function endorsement_frequency(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(COALESCE(array_length(cpol.endorsements, 1), 0)) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function roof_coverage_rate(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        (
          SUM(CASE WHEN cpol.roof_replacement_included THEN 1 ELSE 0 END)::NUMERIC
          / NULLIF(COUNT(*), 0)::NUMERIC * 100
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function estimate_accuracy(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(COALESCE(estimate_stats.revision_count, 0)) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as revision_count
        FROM claim_estimates ce
        WHERE ce.claim_id = c.id
      ) estimate_stats ON TRUE
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function depreciation_ratio(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(
          CASE
            WHEN cpol.replacement_cost_value > 0
              THEN COALESCE(cpol.actual_cash_value, 0) / cpol.replacement_cost_value
            ELSE NULL
          END
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE ${where}
        AND (cpol.replacement_cost_value IS NULL OR cpol.replacement_cost_value > 0)
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function net_claim_amount_trend(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(
          COALESCE(cpol.replacement_cost_value, 0)
          - COALESCE(cpol.deductible, 0)
          - COALESCE(cpol.actual_cash_value, 0)
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function total_expenses_per_claim(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        AVG(billing_stats.total_expenses) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM claim_billing cb
        WHERE cb.claim_id = c.id
      ) billing_stats ON TRUE
      WHERE ${where}
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "time_series",
  };
}

export function expense_type_breakdown(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error("Invalid input parameters");
  }
  const timeGrain = validateTimeGrain(p.timeGrain);
  const where = buildAdditionsWhere(p.clientId, p.startDate, p.endDate, "c.fnol_date");
  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.fnol_date) AS label,
        COALESCE(cb.billing_type, 'unclassified') AS dimension,
        SUM(cb.amount) AS value
      FROM claims c
      LEFT JOIN claim_billing cb ON c.id = cb.claim_id
      WHERE ${where}
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ""}
    `,
    formatType: "dimensional",
  };
}

export const ENHANCED_METRIC_QUERIES: Record<
  string,
  (params: QueryParams) => QueryResult
> = {
  photo_count_per_claim,
  areas_documented,
  damage_type_coverage,
  coverage_type_distribution,
  endorsement_frequency,
  roof_coverage_rate,
  estimate_accuracy,
  depreciation_ratio,
  net_claim_amount_trend,
  total_expenses_per_claim,
  expense_type_breakdown,
};
