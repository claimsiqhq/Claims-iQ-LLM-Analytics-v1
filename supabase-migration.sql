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
