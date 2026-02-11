-- Migration for EXISTING database schema
-- Run this in Supabase SQL Editor if your DB already has thread_shares, thread_annotations, scheduled_reports with different schemas

-- 1. Token-based thread sharing (separate from user-to-user thread_shares)
CREATE TABLE IF NOT EXISTS thread_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_thread_share_links_thread ON thread_share_links(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_share_links_token ON thread_share_links(share_token);

-- 2. Thread notes (simple annotations; separate from thread_annotations)
CREATE TABLE IF NOT EXISTS thread_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  turn_id UUID REFERENCES thread_turns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_thread_notes_thread ON thread_notes(thread_id);

-- 3. Scheduled metric reports (separate from scheduled_reports which uses thread_id)
CREATE TABLE IF NOT EXISTS scheduled_metric_reports (
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
CREATE INDEX IF NOT EXISTS idx_scheduled_metric_reports_client ON scheduled_metric_reports(client_id);

-- 4. Saved dashboards
CREATE TABLE IF NOT EXISTS saved_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_dashboards_client ON saved_dashboards(client_id);

-- 5. API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);

-- 6. Alert webhook URL
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS webhook_url TEXT;
