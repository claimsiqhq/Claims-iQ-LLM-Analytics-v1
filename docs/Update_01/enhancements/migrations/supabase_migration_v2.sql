-- ============================================================================
-- Claims iQ Analytics: Enhancement Migration V2
-- ============================================================================
-- This migration adds support for:
--   1. Alert rules and anomaly detection
--   2. Morning briefs and scheduled reporting
--   3. Thread collaboration features
--   4. Webhook integrations
--   5. Query result caching
--   6. Document-related tables (fallback)
--   7. New metrics across documentation, policy, and financial categories
--
-- All operations are idempotent (IF NOT EXISTS / ON CONFLICT).
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ENHANCEMENT TABLES
-- ============================================================================

-- Alert Rules: User-defined metric thresholds that trigger notifications
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_slug TEXT NOT NULL REFERENCES metric_definitions(slug) ON DELETE RESTRICT,
  condition TEXT NOT NULL CHECK (condition IN ('gt', 'lt', 'eq', 'change_pct')),
  threshold NUMERIC(12, 2) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, metric_slug, condition, threshold)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_client_id ON alert_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user_id ON alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_metric_slug ON alert_rules(metric_slug);
CREATE INDEX IF NOT EXISTS idx_alert_rules_is_active ON alert_rules(is_active);

-- Anomaly Events: Detected statistical anomalies in metrics
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_slug TEXT NOT NULL REFERENCES metric_definitions(slug) ON DELETE RESTRICT,
  detected_at TIMESTAMPTZ NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('spike', 'drop')),
  z_score NUMERIC(8, 2) NOT NULL,
  current_value NUMERIC(12, 2) NOT NULL,
  baseline_mean NUMERIC(12, 2) NOT NULL,
  baseline_stddev NUMERIC(12, 2) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_client_id ON anomaly_events(client_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_metric_slug ON anomaly_events(metric_slug);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_detected_at ON anomaly_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_dismissed ON anomaly_events(dismissed);

-- Morning Briefs: Daily AI-generated intelligence summaries
CREATE TABLE IF NOT EXISTS morning_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,
  content TEXT NOT NULL,
  metrics_snapshot JSONB,
  anomaly_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, user_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_morning_briefs_client_id ON morning_briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_user_id ON morning_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_brief_date ON morning_briefs(brief_date DESC);

-- Thread Shares: Collaboration through thread sharing
CREATE TABLE IF NOT EXISTS thread_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'comment')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_thread_shares_thread_id ON thread_shares(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_shares_shared_by ON thread_shares(shared_by);
CREATE INDEX IF NOT EXISTS idx_thread_shares_shared_with ON thread_shares(shared_with);

-- Thread Annotations: Metadata annotations on specific data points
CREATE TABLE IF NOT EXISTS thread_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  turn_id UUID NOT NULL REFERENCES thread_turns(id) ON DELETE CASCADE,
  annotation_text TEXT NOT NULL,
  data_point_ref JSONB,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_annotations_thread_id ON thread_annotations(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_annotations_turn_id ON thread_annotations(turn_id);
CREATE INDEX IF NOT EXISTS idx_thread_annotations_created_by ON thread_annotations(created_by);

-- Scheduled Reports: Automated report delivery from pinned threads
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  schedule TEXT NOT NULL CHECK (schedule IN ('daily', 'weekly', 'monthly')),
  delivery TEXT NOT NULL CHECK (delivery IN ('email', 'slack')),
  recipients TEXT[] NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_client_id ON scheduled_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_user_id ON scheduled_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_thread_id ON scheduled_reports(thread_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run_at ON scheduled_reports(next_run_at);

-- Webhook Endpoints: External integrations for events
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_client_id ON webhook_endpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_is_active ON webhook_endpoints(is_active);

-- Query Cache: Performance optimization for repeated metric queries
CREATE TABLE IF NOT EXISTS query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  metric_slug TEXT REFERENCES metric_definitions(slug) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL,
  result_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_query_cache_client_id ON query_cache(client_id);
CREATE INDEX IF NOT EXISTS idx_query_cache_metric_slug ON query_cache(metric_slug);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires_at ON query_cache(expires_at);

-- ============================================================================
-- SECTION 2: CLAIM DOCUMENT TABLES (FALLBACK)
-- ============================================================================
-- These tables are included here in case the original v1 migration did not
-- deploy them. They are essential for the new documentation and financial metrics.

-- Claim Photos: Photo documentation and metadata
CREATE TABLE IF NOT EXISTS claim_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_category TEXT NOT NULL,
  area_documented TEXT,
  damage_type TEXT,
  damage_severity TEXT CHECK (damage_severity IN ('minor', 'moderate', 'severe')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_photos_claim_id ON claim_photos(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_damage_type ON claim_photos(damage_type);

-- Claim Policies: Policy and coverage information
CREATE TABLE IF NOT EXISTS claim_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  policy_number TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  coverage_type TEXT NOT NULL,
  coverage_amount NUMERIC(12, 2),
  deductible NUMERIC(12, 2),
  endorsements TEXT[],
  roof_replacement_included BOOLEAN,
  replacement_cost_value NUMERIC(12, 2),
  actual_cash_value NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_policies_claim_id ON claim_policies(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_policies_coverage_type ON claim_policies(coverage_type);

-- Claim Estimates: Estimate documentation and revisions
CREATE TABLE IF NOT EXISTS claim_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  estimate_number TEXT NOT NULL,
  estimate_version INTEGER NOT NULL DEFAULT 1,
  estimated_amount NUMERIC(12, 2) NOT NULL,
  depreciation_amount NUMERIC(12, 2),
  replacement_cost NUMERIC(12, 2),
  line_items JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_estimates_claim_id ON claim_estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_estimates_estimate_version ON claim_estimates(estimate_version);

-- Claim Billing: Expenses and billing records
CREATE TABLE IF NOT EXISTS claim_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  billing_type TEXT NOT NULL,
  expense_category TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT,
  vendor_name TEXT,
  invoice_number TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_billing_claim_id ON claim_billing(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_billing_billing_type ON claim_billing(billing_type);

-- ============================================================================
-- SECTION 3: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Note: Assumes RLS is enabled on these tables at database level.
-- Run: ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

-- Alert Rules: Users can only see alerts for their client
CREATE POLICY IF NOT EXISTS alert_rules_client_isolation
  ON alert_rules FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
    AND uca.client_id = alert_rules.client_id
  ));

-- Anomaly Events: Client-level isolation
CREATE POLICY IF NOT EXISTS anomaly_events_client_isolation
  ON anomaly_events FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
    AND uca.client_id = anomaly_events.client_id
  ));

-- Morning Briefs: Users can only see their own briefs
CREATE POLICY IF NOT EXISTS morning_briefs_user_isolation
  ON morning_briefs FOR SELECT
  USING (user_id = auth.uid());

-- Thread Shares: Shared users can access
CREATE POLICY IF NOT EXISTS thread_shares_access
  ON thread_shares FOR SELECT
  USING (shared_with = auth.uid() OR shared_by = auth.uid());

-- Thread Annotations: Based on thread access
CREATE POLICY IF NOT EXISTS thread_annotations_isolation
  ON thread_annotations FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM threads t
    WHERE t.id = thread_annotations.thread_id
    AND t.user_id = auth.uid()
  ));

-- Scheduled Reports: Client-level isolation
CREATE POLICY IF NOT EXISTS scheduled_reports_client_isolation
  ON scheduled_reports FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
    AND uca.client_id = scheduled_reports.client_id
  ));

-- Webhook Endpoints: Client-level isolation
CREATE POLICY IF NOT EXISTS webhook_endpoints_client_isolation
  ON webhook_endpoints FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
    AND uca.client_id = webhook_endpoints.client_id
  ));

-- Query Cache: Client-level isolation
CREATE POLICY IF NOT EXISTS query_cache_client_isolation
  ON query_cache FOR SELECT
  USING (EXISTS(
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
    AND uca.client_id = query_cache.client_id
  ));

-- ============================================================================
-- SECTION 4: METRIC_DEFINITIONS ENHANCEMENTS
-- ============================================================================

-- Add new categories to metric_definitions category constraint
-- First, drop the old constraint if it exists, then add the new one
DO $$
BEGIN
  BEGIN
    ALTER TABLE metric_definitions DROP CONSTRAINT metric_definitions_category_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  ALTER TABLE metric_definitions ADD CONSTRAINT metric_definitions_category_check
    CHECK (category IN (
      'claims_processing',
      'quality_metrics',
      'performance',
      'ai_operations',
      'documentation',
      'policy',
      'financial'
    ));
END $$;

-- ============================================================================
-- SECTION 5: NEW METRICS INSERTION
-- ============================================================================
-- Insert 11 new metrics across documentation, policy, and financial categories.
-- Uses ON CONFLICT DO NOTHING for idempotency.

INSERT INTO metric_definitions (
  slug, display_name, category, description, calculation_sql,
  unit, default_chart_type, allowed_dimensions, allowed_time_grains,
  suggested_prompts, is_active
) VALUES
-- Documentation Metrics
('photo_count_per_claim',
  'Average Photo Count per Claim',
  'documentation',
  'Average number of photos documented per claim',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(photo_stats.photo_count) AS value FROM claims c LEFT JOIN LATERAL (SELECT COUNT(*) as photo_count FROM claim_photos cp WHERE cp.claim_id = c.id) photo_stats ON TRUE WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'photos',
  'line',
  ARRAY['claim_stage', 'adjuster_id'],
  ARRAY['day', 'week', 'month'],
  ARRAY['How many photos are we documenting per claim on average?', 'Is photo documentation improving over time?'],
  TRUE
),

('areas_documented',
  'Average Areas Documented per Claim',
  'documentation',
  'Average number of distinct areas documented per claim',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(area_stats.distinct_areas) AS value FROM claims c LEFT JOIN LATERAL (SELECT COUNT(DISTINCT area_documented) as distinct_areas FROM claim_photos cp WHERE cp.claim_id = c.id AND cp.area_documented IS NOT NULL) area_stats ON TRUE WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'areas',
  'line',
  ARRAY['claim_type'],
  ARRAY['day', 'week', 'month'],
  ARRAY['What is our coverage of documented areas?', 'Which areas are being missed in documentation?'],
  TRUE
),

('damage_type_coverage',
  'Damage Type Coverage Distribution',
  'documentation',
  'Distribution of documented damage types across claims',
  'SELECT date_trunc($1, c.created_at) AS label, cp.damage_type AS dimension, COUNT(*) AS value FROM claims c JOIN claim_photos cp ON c.id = cp.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 AND cp.damage_type IS NOT NULL GROUP BY label, cp.damage_type ORDER BY label, dimension',
  'count',
  'column',
  ARRAY['damage_type', 'damage_severity'],
  ARRAY['day', 'week', 'month'],
  ARRAY['What types of damage are most common?', 'How is damage severity distributed?'],
  TRUE
),

-- Policy Metrics
('coverage_type_distribution',
  'Coverage Type Distribution',
  'policy',
  'Distribution of claims by policy coverage type',
  'SELECT date_trunc($1, c.created_at) AS label, cpol.coverage_type AS dimension, COUNT(*) AS value FROM claims c JOIN claim_policies cpol ON c.id = cpol.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label, cpol.coverage_type ORDER BY label, dimension',
  'count',
  'column',
  ARRAY['coverage_type'],
  ARRAY['day', 'week', 'month'],
  ARRAY['Which coverage types are generating the most claims?', 'How is our claim distribution across coverages?'],
  TRUE
),

('endorsement_frequency',
  'Average Endorsements per Policy',
  'policy',
  'Average number of policy endorsements per claim',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(COALESCE(array_length(cpol.endorsements, 1), 0)) AS value FROM claims c LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'endorsements',
  'line',
  ARRAY[],
  ARRAY['day', 'week', 'month'],
  ARRAY['What is the average endorsement count on our policies?', 'Are endorsement counts increasing?'],
  TRUE
),

('roof_coverage_rate',
  'Roof Coverage Rate',
  'policy',
  'Percentage of claims with roof replacement coverage',
  'SELECT date_trunc($1, c.created_at) AS label, (SUM(CASE WHEN cpol.roof_replacement_included THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC * 100) AS value FROM claims c LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'percent',
  'line',
  ARRAY[],
  ARRAY['day', 'week', 'month'],
  ARRAY['What percentage of our policies include roof coverage?', 'Is roof coverage trending up or down?'],
  TRUE
),

-- Financial Metrics
('estimate_accuracy',
  'Estimate Accuracy (Revision Count)',
  'financial',
  'Average number of estimate revisions per claim',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(estimate_stats.revision_count) AS value FROM claims c LEFT JOIN LATERAL (SELECT COUNT(*) as revision_count FROM claim_estimates ce WHERE ce.claim_id = c.id) estimate_stats ON TRUE WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'revisions',
  'line',
  ARRAY['claim_stage'],
  ARRAY['day', 'week', 'month'],
  ARRAY['How many times are we revising estimates?', 'Is estimate accuracy improving?'],
  TRUE
),

('depreciation_ratio',
  'Depreciation Ratio',
  'financial',
  'Average depreciation to replacement cost ratio',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(CASE WHEN cpol.replacement_cost_value > 0 THEN COALESCE(cpol.actual_cash_value, 0) / cpol.replacement_cost_value ELSE NULL END) AS value FROM claims c LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 AND cpol.replacement_cost_value > 0 GROUP BY label ORDER BY label',
  'ratio',
  'line',
  ARRAY[],
  ARRAY['day', 'week', 'month'],
  ARRAY['What is our average depreciation ratio?', 'How is depreciation impacting settlements?'],
  TRUE
),

('net_claim_amount_trend',
  'Net Claim Amount Trend',
  'financial',
  'Average net claim amount (replacement cost minus deductible and depreciation)',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(COALESCE(cpol.replacement_cost_value - COALESCE(cpol.deductible, 0) - COALESCE(cpol.actual_cash_value, 0), 0)) AS value FROM claims c LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'currency',
  'line',
  ARRAY['claim_type'],
  ARRAY['day', 'week', 'month'],
  ARRAY['What is the trend in net claim amounts?', 'Are settlements increasing or decreasing?'],
  TRUE
),

('total_expenses_per_claim',
  'Total Expenses per Claim',
  'financial',
  'Average total billed expenses per claim',
  'SELECT date_trunc($1, c.created_at) AS label, AVG(billing_stats.total_expenses) AS value FROM claims c LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) as total_expenses FROM claim_billing cb WHERE cb.claim_id = c.id) billing_stats ON TRUE WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label ORDER BY label',
  'currency',
  'line',
  ARRAY['claim_stage'],
  ARRAY['day', 'week', 'month'],
  ARRAY['What are our average expenses per claim?', 'Are expenses trending up?'],
  TRUE
),

('expense_type_breakdown',
  'Expense Type Breakdown',
  'financial',
  'Distribution of expenses by billing type',
  'SELECT date_trunc($1, c.created_at) AS label, cb.billing_type AS dimension, SUM(cb.amount) AS value FROM claims c JOIN claim_billing cb ON c.id = cb.claim_id WHERE c.client_id = $2 AND c.created_at BETWEEN $3 AND $4 GROUP BY label, cb.billing_type ORDER BY label, dimension',
  'currency',
  'stacked_column',
  ARRAY['billing_type'],
  ARRAY['day', 'week', 'month'],
  ARRAY['How are expenses distributed by type?', 'Which expense categories dominate our costs?'],
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SECTION 6: VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Summary view for claim photos
CREATE OR REPLACE VIEW claim_photo_summary AS
SELECT
  cp.claim_id,
  COUNT(*) as total_photos,
  COUNT(DISTINCT cp.area_documented) as distinct_areas,
  COUNT(DISTINCT cp.damage_type) as damage_type_count,
  MAX(cp.created_at) as last_photo_at
FROM claim_photos cp
GROUP BY cp.claim_id;

-- Flag view for coverage analysis
CREATE OR REPLACE VIEW claim_coverage_flags AS
SELECT
  c.id as claim_id,
  cpol.policy_number,
  cpol.coverage_type,
  CASE WHEN cpol.roof_replacement_included THEN 'roof_covered' ELSE 'roof_not_covered' END as roof_flag,
  CASE WHEN COALESCE(array_length(cpol.endorsements, 1), 0) > 0 THEN 'has_endorsements' ELSE 'no_endorsements' END as endorsement_flag,
  CASE WHEN cps.total_photos = 0 THEN 'under_documented' WHEN cps.total_photos < 3 THEN 'minimal_photos' ELSE 'well_documented' END as documentation_flag
FROM claims c
LEFT JOIN claim_policies cpol ON c.id = cpol.claim_id
LEFT JOIN claim_photo_summary cps ON c.id = cps.claim_id;

-- Recent anomalies summary
CREATE OR REPLACE VIEW metric_anomaly_summary AS
SELECT
  ae.client_id,
  ae.metric_slug,
  ae.direction,
  ae.severity,
  COUNT(*) as anomaly_count,
  MAX(ae.detected_at) as last_anomaly_at,
  AVG(ae.z_score) as avg_z_score
FROM anomaly_events ae
WHERE ae.dismissed = FALSE
  AND ae.detected_at > NOW() - INTERVAL '30 days'
GROUP BY ae.client_id, ae.metric_slug, ae.direction, ae.severity;

-- ============================================================================
-- SECTION 7: MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_query_cache()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM query_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_cache_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE query_cache
  SET hit_count = hit_count + 1
  WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 8: MIGRATION COMPLETION
-- ============================================================================

COMMIT;

-- Post-migration notes:
-- 1. Enable RLS on all new tables if not already enabled:
--    ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
--    ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
--    (etc. for all new tables)
--
-- 2. Run periodic cleanup: SELECT cleanup_query_cache();
--    Consider scheduling this via pg_cron or a background job.
--
-- 3. Verify metrics are available in the application layer.
--
-- 4. Test RLS policies with sample client/user access patterns.
