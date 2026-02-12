-- Claims IQ Analytics — Supabase Migration
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard > SQL Editor)

-- 1. Helper function for executing raw SQL from the app
CREATE OR REPLACE FUNCTION execute_raw_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || query_text || ') t'
  INTO result;
  RETURN result;
END;
$$;

-- 2. Tenancy & Users
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('claims_manager', 'team_lead', 'adjuster', 'executive', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_client_access (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_id)
);

-- 3. Adjusters
CREATE TABLE IF NOT EXISTS adjusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  full_name TEXT NOT NULL,
  email TEXT,
  team TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Claims (Core Domain)
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  claim_number TEXT NOT NULL,
  claimant_name TEXT,
  peril TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  region TEXT,
  state_code TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'review', 'closed', 'reopened')),
  current_stage TEXT NOT NULL,
  assigned_adjuster_id UUID REFERENCES adjusters(id),
  assigned_at TIMESTAMPTZ,
  fnol_date TIMESTAMPTZ NOT NULL,
  first_touch_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  reserve_amount DECIMAL(12,2),
  paid_amount DECIMAL(12,2),
  sla_target_days INTEGER,
  sla_breached BOOLEAN DEFAULT FALSE,
  has_issues BOOLEAN DEFAULT FALSE,
  issue_types TEXT[],
  reopen_count INTEGER DEFAULT 0,
  source_document_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, claim_number)
);

-- 5. Stage History
CREATE TABLE IF NOT EXISTS claim_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ,
  adjuster_id UUID REFERENCES adjusters(id),
  dwell_days DECIMAL(6,2)
);

-- 6. Reviews
CREATE TABLE IF NOT EXISTS claim_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  reviewer_id UUID REFERENCES adjusters(id),
  outcome TEXT,
  llm_decision TEXT,
  human_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  reviewed_at TIMESTAMPTZ DEFAULT now()
);

-- 7. LLM Usage
CREATE TABLE IF NOT EXISTS claim_llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  stage TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd DECIMAL(8,4),
  latency_ms INTEGER,
  called_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Source Documents
CREATE TABLE IF NOT EXISTS source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  filename TEXT NOT NULL,
  file_path TEXT,
  document_type TEXT,
  page_count INTEGER,
  parsed_at TIMESTAMPTZ,
  parse_status TEXT DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed')),
  parse_errors JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Sessions & Threads
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  title TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  pin_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  user_message TEXT NOT NULL,
  parsed_intent JSONB,
  intent_valid BOOLEAN,
  validation_errors JSONB,
  assumptions JSONB,
  context_stack JSONB,
  chart_data JSONB,
  chart_type TEXT,
  insight_summary TEXT,
  error_type TEXT,
  error_message TEXT,
  suggested_alternatives TEXT[],
  llm_provider TEXT,
  llm_model TEXT,
  llm_latency_ms INTEGER,
  query_latency_ms INTEGER,
  data_freshness_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Metric Registry
CREATE TABLE IF NOT EXISTS metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  calculation TEXT NOT NULL,
  unit TEXT,
  default_chart_type TEXT NOT NULL,
  allowed_dimensions TEXT[] NOT NULL,
  allowed_time_grains TEXT[] DEFAULT ARRAY['day', 'week', 'month'],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Indexes
CREATE INDEX IF NOT EXISTS idx_claims_client_id ON claims(client_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(client_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_fnol_date ON claims(client_id, fnol_date);
CREATE INDEX IF NOT EXISTS idx_claims_peril ON claims(client_id, peril);
CREATE INDEX IF NOT EXISTS idx_claims_region ON claims(client_id, region);
CREATE INDEX IF NOT EXISTS idx_claims_adjuster ON claims(client_id, assigned_adjuster_id);
CREATE INDEX IF NOT EXISTS idx_claims_severity ON claims(client_id, severity);
CREATE INDEX IF NOT EXISTS idx_claims_sla ON claims(client_id, sla_breached);
CREATE INDEX IF NOT EXISTS idx_claims_stage ON claims(client_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_claim ON claim_stage_history(claim_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_stage ON claim_stage_history(stage, entered_at);
CREATE INDEX IF NOT EXISTS idx_threads_user_client ON threads(user_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_pinned ON threads(user_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_turns_thread ON thread_turns(thread_id, turn_index);

-- 12. Document Tables (required for enhanced metrics)
CREATE TABLE IF NOT EXISTS claim_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  area_documented TEXT,
  damage_type TEXT,
  damage_severity TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  coverage_type TEXT,
  endorsements TEXT[] DEFAULT '{}',
  roof_replacement_included BOOLEAN DEFAULT FALSE,
  replacement_cost_value DECIMAL(12,2),
  actual_cash_value DECIMAL(12,2),
  deductible DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  estimate_amount DECIMAL(12,2),
  revision_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  billing_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_photos_claim ON claim_photos(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_policies_claim ON claim_policies(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_estimates_claim ON claim_estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_billing_claim ON claim_billing(claim_id);

-- 13. Enhancement Tables (anomaly detection, alerts, morning briefs, query cache)
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_slug TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('spike', 'drop')),
  z_score DECIMAL(10,4) NOT NULL,
  current_value DECIMAL(12,4) NOT NULL,
  baseline_mean DECIMAL(12,4) NOT NULL,
  baseline_stddev DECIMAL(12,4) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_slug TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('gt', 'lt', 'eq', 'change_pct')),
  threshold DECIMAL(12,4) NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morning_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  brief_date DATE NOT NULL,
  content TEXT NOT NULL,
  metrics_snapshot JSONB,
  anomaly_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, brief_date)
);

CREATE TABLE IF NOT EXISTS query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL,
  cache_key TEXT UNIQUE NOT NULL,
  metric_slug TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  result_data JSONB NOT NULL,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_client ON anomaly_events(client_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_detected ON anomaly_events(client_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_client ON alert_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_client_date ON morning_briefs(client_id, brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_query_cache_key ON query_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at);

-- 13b. Thread Sharing & Annotations
CREATE TABLE IF NOT EXISTS thread_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS thread_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  turn_id UUID REFERENCES thread_turns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_shares_thread ON thread_shares(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_shares_token ON thread_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_thread_annotations_thread ON thread_annotations(thread_id);

-- 14. Ingestion Jobs (PDF document processing)
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_size INTEGER,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  extraction_results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_client ON ingestion_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_started ON ingestion_jobs(client_id, started_at DESC);

-- 15. Enhanced metric definitions (11 new metrics)
INSERT INTO metric_definitions (slug, display_name, category, description, calculation, unit, default_chart_type, allowed_dimensions, allowed_time_grains, is_active)
VALUES
  ('photo_count_per_claim', 'Average Photo Count per Claim', 'documentation', 'Average number of photos documented per claim', 'AVG(photo_count)', 'photos', 'line', '{}', ARRAY['day','week','month'], true),
  ('areas_documented', 'Average Areas Documented per Claim', 'documentation', 'Average number of distinct areas documented per claim', 'AVG(distinct_areas)', 'areas', 'line', '{}', ARRAY['day','week','month'], true),
  ('damage_type_coverage', 'Damage Type Coverage Distribution', 'documentation', 'Distribution of documented damage types across claims', 'COUNT by damage_type', 'count', 'column', '{}', ARRAY['day','week','month'], true),
  ('coverage_type_distribution', 'Coverage Type Distribution', 'policy', 'Distribution of claims by policy coverage type', 'COUNT by coverage_type', 'count', 'column', '{}', ARRAY['day','week','month'], true),
  ('endorsement_frequency', 'Average Endorsements per Policy', 'policy', 'Average number of policy endorsements per claim', 'AVG(endorsements)', 'endorsements', 'line', '{}', ARRAY['day','week','month'], true),
  ('roof_coverage_rate', 'Roof Coverage Rate', 'policy', 'Percentage of claims with roof replacement coverage', 'SUM(roof_included)/COUNT*100', 'percent', 'line', '{}', ARRAY['day','week','month'], true),
  ('estimate_accuracy', 'Estimate Accuracy (Revision Count)', 'financial', 'Average number of estimate revisions per claim', 'AVG(revision_count)', 'revisions', 'line', '{}', ARRAY['day','week','month'], true),
  ('depreciation_ratio', 'Depreciation Ratio', 'financial', 'Average depreciation to replacement cost ratio', 'AVG(acv/rcv)', 'ratio', 'line', '{}', ARRAY['day','week','month'], true),
  ('net_claim_amount_trend', 'Net Claim Amount Trend', 'financial', 'Average net claim amount (replacement cost minus deductible and depreciation)', 'AVG(net_amount)', 'currency', 'line', '{}', ARRAY['day','week','month'], true),
  ('total_expenses_per_claim', 'Total Expenses per Claim', 'financial', 'Average total billed expenses per claim', 'AVG(total_expenses)', 'currency', 'line', '{}', ARRAY['day','week','month'], true),
  ('expense_type_breakdown', 'Expense Type Breakdown', 'financial', 'Distribution of expenses by billing type', 'SUM by billing_type', 'currency', 'stacked_bar', '{}', ARRAY['day','week','month'], true)
ON CONFLICT (slug) DO NOTHING;

-- 16. Phase 4 & 5: Scheduled reports, dashboards, API keys, alert webhooks
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS webhook_url TEXT;

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  metric_slug TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,
  recipients JSONB DEFAULT '[]',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_client ON scheduled_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next ON scheduled_reports(next_run_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_saved_dashboards_client ON saved_dashboards(client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);

-- 17. Client preferences (chart defaults, theme, voice agent settings)
CREATE TABLE IF NOT EXISTS client_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  default_chart_type TEXT DEFAULT 'bar',
  default_time_range TEXT DEFAULT '30d',
  theme TEXT DEFAULT 'system',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  auto_refresh_interval INTEGER DEFAULT 300,
  voice_voice TEXT DEFAULT 'ash',
  voice_turn_sensitivity DECIMAL(3,2) DEFAULT 0.8,
  voice_silence_duration INTEGER DEFAULT 800,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_preferences_client ON client_preferences(client_id);

-- Add voice columns if table already exists without them
ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS voice_voice TEXT DEFAULT 'ash';
ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS voice_turn_sensitivity DECIMAL(3,2) DEFAULT 0.8;
ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS voice_silence_duration INTEGER DEFAULT 800;
