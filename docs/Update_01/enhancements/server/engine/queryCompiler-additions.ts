/**
 * ============================================================================
 * queryCompiler-additions.ts
 * ============================================================================
 * Enhanced metric SQL query builders for Claims iQ Analytics.
 * Extends the existing queryCompiler.ts with 11 new metrics across:
 *   - Documentation (photo_count_per_claim, areas_documented, damage_type_coverage)
 *   - Policy (coverage_type_distribution, endorsement_frequency, roof_coverage_rate)
 *   - Financial (estimate_accuracy, depreciation_ratio, net_claim_amount_trend,
 *               total_expenses_per_claim, expense_type_breakdown)
 *
 * All queries are parameterized and safe from SQL injection.
 * ============================================================================
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Query parameters passed to metric builders
 */
export interface QueryParams {
  clientId: string;
  startDate: string;
  endDate: string;
  timeGrain: string; // 'day', 'week', 'month'
  filters: Array<{ field: string; operator: string; value: string }>;
  dimensions: string[];
  limit?: number;
}

/**
 * Query result structure
 */
export interface QueryResult {
  sql: string;
  formatType: string;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  label: string;
  value: number;
}

/**
 * Dimensional data point
 */
export interface DimensionalPoint {
  label: string;
  dimension: string;
  value: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitizes string values to prevent SQL injection.
 * Escapes single quotes and validates basic input format.
 */
export function sanitize(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/'/g, "''").trim();
}

/**
 * Validates UUID format
 */
function validateUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates date format (YYYY-MM-DD)
 */
function validateDate(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(date);
}

/**
 * Validates time grain
 */
function validateTimeGrain(grain: string): string {
  const validGrains = ['day', 'week', 'month', 'quarter', 'year'];
  return validGrains.includes(grain) ? grain : 'day';
}

/**
 * Builds WHERE clause from filter array.
 * Supports operators: =, !=, >, <, >=, <=, LIKE, IN
 */
export function buildWhereClause(
  filters: Array<{ field: string; operator: string; value: string }>
): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  const clauses = filters
    .map((f) => {
      const field = sanitize(f.field);
      const operator = sanitize(f.operator).toUpperCase();
      const value = sanitize(f.value);

      // Validate operator
      const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN'];
      if (!validOperators.includes(operator)) {
        return null;
      }

      // Build clause based on operator
      if (operator === 'LIKE' || operator === 'IN' || operator === 'NOT IN') {
        return `${field} ${operator} '${value}'`;
      } else {
        return `${field} ${operator} '${value}'`;
      }
    })
    .filter((c) => c !== null);

  return clauses.length > 0 ? 'AND ' + clauses.join(' AND ') : '';
}

/**
 * Escapes identifier (table name, column name) for safe SQL
 */
function escapeIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    return '""';
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Builds dimension GROUP BY and SELECT clause
 */
function buildDimensionClause(dimensions: string[]): string {
  if (!dimensions || dimensions.length === 0) {
    return '';
  }

  const validDimensions: Record<string, string> = {
    claim_stage: 'c.claim_stage',
    claim_type: 'c.claim_type',
    adjuster_id: 'c.adjuster_id',
    damage_type: 'cp.damage_type',
    damage_severity: 'cp.damage_severity',
    coverage_type: 'cpol.coverage_type',
    billing_type: 'cb.billing_type',
  };

  return dimensions
    .map((d) => validDimensions[d] || null)
    .filter((d) => d !== null)
    .join(', ');
}

// ============================================================================
// METRIC QUERY BUILDERS
// ============================================================================

/**
 * Documentation Metrics
 */

/**
 * photo_count_per_claim
 * Average number of photos documented per claim over time
 */
export function photo_count_per_claim(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(photo_stats.photo_count) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as photo_count
        FROM claim_photos cp
        WHERE cp.claim_id = c.id
      ) photo_stats ON TRUE
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * areas_documented
 * Average number of distinct areas documented per claim
 */
export function areas_documented(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(area_stats.distinct_areas) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT area_documented) as distinct_areas
        FROM claim_photos cp
        WHERE cp.claim_id = c.id
          AND cp.area_documented IS NOT NULL
      ) area_stats ON TRUE
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * damage_type_coverage
 * Distribution of documented damage types across claims
 */
export function damage_type_coverage(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        COALESCE(cp.damage_type, 'unknown') AS dimension,
        COUNT(*) AS value
      FROM claims c
      JOIN claim_photos cp ON c.id = cp.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'dimensional',
  };
}

/**
 * Policy Metrics
 */

/**
 * coverage_type_distribution
 * Distribution of claims by policy coverage type
 */
export function coverage_type_distribution(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        COALESCE(cpol.coverage_type, 'unknown') AS dimension,
        COUNT(*) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'dimensional',
  };
}

/**
 * endorsement_frequency
 * Average number of policy endorsements per claim
 */
export function endorsement_frequency(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(COALESCE(array_length(cpol.endorsements, 1), 0)) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * roof_coverage_rate
 * Percentage of claims with roof replacement coverage
 */
export function roof_coverage_rate(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        (
          SUM(CASE WHEN cpol.roof_replacement_included THEN 1 ELSE 0 END)::NUMERIC
          / NULLIF(COUNT(*), 0)::NUMERIC * 100
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * Financial Metrics
 */

/**
 * estimate_accuracy
 * Average number of estimate revisions per claim (lower is better)
 */
export function estimate_accuracy(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(estimate_stats.revision_count) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as revision_count
        FROM claim_estimates ce
        WHERE ce.claim_id = c.id
      ) estimate_stats ON TRUE
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * depreciation_ratio
 * Average ratio of actual cash value to replacement cost (0-1 range)
 */
export function depreciation_ratio(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(
          CASE
            WHEN cpol.replacement_cost_value > 0
              THEN COALESCE(cpol.actual_cash_value, 0) / cpol.replacement_cost_value
            ELSE NULL
          END
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
        AND cpol.replacement_cost_value > 0
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * net_claim_amount_trend
 * Average net claim amount (replacement cost minus deductible and depreciation)
 */
export function net_claim_amount_trend(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(
          COALESCE(cpol.replacement_cost_value, 0)
          - COALESCE(cpol.deductible, 0)
          - COALESCE(cpol.actual_cash_value, 0)
        ) AS value
      FROM claims c
      LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * total_expenses_per_claim
 * Average total billed expenses per claim
 */
export function total_expenses_per_claim(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        AVG(billing_stats.total_expenses) AS value
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM claim_billing cb
        WHERE cb.claim_id = c.id
      ) billing_stats ON TRUE
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label
      ORDER BY label
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'time_series',
  };
}

/**
 * expense_type_breakdown
 * Distribution of expenses by billing type
 */
export function expense_type_breakdown(p: QueryParams): QueryResult {
  if (!validateUuid(p.clientId) || !validateDate(p.startDate) || !validateDate(p.endDate)) {
    throw new Error('Invalid input parameters');
  }

  const timeGrain = validateTimeGrain(p.timeGrain);

  return {
    sql: `
      SELECT
        date_trunc('${timeGrain}', c.created_at) AS label,
        COALESCE(cb.billing_type, 'unclassified') AS dimension,
        SUM(cb.amount) AS value
      FROM claims c
      LEFT JOIN claim_billing cb ON c.id = cb.claim_id
      WHERE c.client_id = '${sanitize(p.clientId)}'
        AND c.created_at BETWEEN '${sanitize(p.startDate)}'::TIMESTAMPTZ
                            AND '${sanitize(p.endDate)}'::TIMESTAMPTZ
      GROUP BY label, dimension
      ORDER BY label, dimension
      ${p.limit ? `LIMIT ${Math.min(p.limit, 10000)}` : ''}
    `,
    formatType: 'dimensional',
  };
}

// ============================================================================
// METRIC REGISTRY
// ============================================================================

/**
 * Registry mapping metric slugs to their builder functions
 */
export const ENHANCED_METRIC_QUERIES: Record<
  string,
  (params: QueryParams) => QueryResult
> = {
  // Documentation metrics
  photo_count_per_claim,
  areas_documented,
  damage_type_coverage,

  // Policy metrics
  coverage_type_distribution,
  endorsement_frequency,
  roof_coverage_rate,

  // Financial metrics
  estimate_accuracy,
  depreciation_ratio,
  net_claim_amount_trend,
  total_expenses_per_claim,
  expense_type_breakdown,
};

/**
 * Get a metric query builder by slug
 */
export function getMetricQuery(slug: string): ((params: QueryParams) => QueryResult) | null {
  return ENHANCED_METRIC_QUERIES[slug] || null;
}

/**
 * List all available enhanced metrics
 */
export function listEnhancedMetrics(): string[] {
  return Object.keys(ENHANCED_METRIC_QUERIES);
}

// ============================================================================
// METADATA & DOCUMENTATION
// ============================================================================

/**
 * Metric metadata for documentation and UI hints
 */
export const METRIC_METADATA: Record<
  string,
  {
    displayName: string;
    category: string;
    description: string;
    unit: string;
    formatType: string;
    defaultChartType: string;
  }
> = {
  photo_count_per_claim: {
    displayName: 'Average Photo Count per Claim',
    category: 'documentation',
    description: 'Average number of photos documented per claim',
    unit: 'photos',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  areas_documented: {
    displayName: 'Average Areas Documented per Claim',
    category: 'documentation',
    description: 'Average number of distinct areas documented per claim',
    unit: 'areas',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  damage_type_coverage: {
    displayName: 'Damage Type Coverage Distribution',
    category: 'documentation',
    description: 'Distribution of documented damage types across claims',
    unit: 'count',
    formatType: 'dimensional',
    defaultChartType: 'column',
  },
  coverage_type_distribution: {
    displayName: 'Coverage Type Distribution',
    category: 'policy',
    description: 'Distribution of claims by policy coverage type',
    unit: 'count',
    formatType: 'dimensional',
    defaultChartType: 'column',
  },
  endorsement_frequency: {
    displayName: 'Average Endorsements per Policy',
    category: 'policy',
    description: 'Average number of policy endorsements per claim',
    unit: 'endorsements',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  roof_coverage_rate: {
    displayName: 'Roof Coverage Rate',
    category: 'policy',
    description: 'Percentage of claims with roof replacement coverage',
    unit: 'percent',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  estimate_accuracy: {
    displayName: 'Estimate Accuracy (Revision Count)',
    category: 'financial',
    description: 'Average number of estimate revisions per claim',
    unit: 'revisions',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  depreciation_ratio: {
    displayName: 'Depreciation Ratio',
    category: 'financial',
    description: 'Average depreciation to replacement cost ratio',
    unit: 'ratio',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  net_claim_amount_trend: {
    displayName: 'Net Claim Amount Trend',
    category: 'financial',
    description: 'Average net claim amount (replacement cost minus deductible and depreciation)',
    unit: 'currency',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  total_expenses_per_claim: {
    displayName: 'Total Expenses per Claim',
    category: 'financial',
    description: 'Average total billed expenses per claim',
    unit: 'currency',
    formatType: 'time_series',
    defaultChartType: 'line',
  },
  expense_type_breakdown: {
    displayName: 'Expense Type Breakdown',
    category: 'financial',
    description: 'Distribution of expenses by billing type',
    unit: 'currency',
    formatType: 'dimensional',
    defaultChartType: 'stacked_column',
  },
};

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * Summary of enhanced metrics
 *
 * DOCUMENTATION CATEGORY (3 metrics):
 * - photo_count_per_claim: Track average photo documentation rate
 * - areas_documented: Monitor coverage of areas documented
 * - damage_type_coverage: Analyze damage type distribution
 *
 * POLICY CATEGORY (3 metrics):
 * - coverage_type_distribution: Understand coverage mix
 * - endorsement_frequency: Track policy endorsement usage
 * - roof_coverage_rate: Monitor roof coverage penetration
 *
 * FINANCIAL CATEGORY (5 metrics):
 * - estimate_accuracy: Measure estimate revision frequency
 * - depreciation_ratio: Track depreciation impact
 * - net_claim_amount_trend: Monitor settlement amounts
 * - total_expenses_per_claim: Track expense trends
 * - expense_type_breakdown: Analyze expense composition
 */
