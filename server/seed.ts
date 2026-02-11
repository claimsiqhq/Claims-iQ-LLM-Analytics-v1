import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000001";

const METRIC_DEFINITIONS = [
  { slug: "claims_received", display_name: "Claims Received", category: "throughput", description: "Total number of new claims filed in the selected period", calculation: "COUNT(*) FROM claims WHERE fnol_date BETWEEN start AND end", unit: "count", default_chart_type: "line", allowed_dimensions: ["day", "week", "month", "peril", "region"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "claims_in_progress", display_name: "Claims In Progress", category: "throughput", description: "Number of claims currently being actively worked", calculation: "COUNT(*) FROM claims WHERE status IN (open, in_progress, review)", unit: "count", default_chart_type: "stacked_bar", allowed_dimensions: ["stage", "adjuster", "peril"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "queue_depth", display_name: "Queue Depth", category: "throughput", description: "Number of claims awaiting action in the queue", calculation: "COUNT(*) FROM claims WHERE status IN (open, in_progress)", unit: "count", default_chart_type: "bar", allowed_dimensions: ["priority", "carrier"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "cycle_time_e2e", display_name: "Cycle Time (E2E)", category: "speed_sla", description: "Average days from first notice of loss to claim closure", calculation: "AVG(closed_at - fnol_date) in days", unit: "days", default_chart_type: "line", allowed_dimensions: ["peril", "region", "severity", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "stage_dwell_time", display_name: "Stage Dwell Time", category: "speed_sla", description: "Average days a claim spends in each processing stage", calculation: "AVG(dwell_days) FROM claim_stage_history GROUP BY stage", unit: "days", default_chart_type: "stacked_bar", allowed_dimensions: ["stage", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "time_to_first_touch", display_name: "Time to First Touch", category: "speed_sla", description: "Average hours from FNOL to first action taken on a claim", calculation: "AVG(first_touch_at - fnol_date) in hours", unit: "hours", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "sla_breach_rate", display_name: "SLA Breach Rate", category: "speed_sla", description: "Percentage of claims that exceeded their SLA target days", calculation: "AVG(CASE WHEN sla_breached THEN 1 ELSE 0 END)", unit: "percentage", default_chart_type: "line", allowed_dimensions: ["adjuster", "peril", "region", "stage"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "sla_breach_count", display_name: "SLA Breach Count", category: "speed_sla", description: "Total number of claims that breached SLA thresholds", calculation: "COUNT(*) FROM claims WHERE sla_breached = true", unit: "count", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril", "region", "stage"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "issue_rate", display_name: "Issue Rate", category: "quality", description: "Percentage of claims flagged with one or more issues", calculation: "AVG(CASE WHEN has_issues THEN 1 ELSE 0 END)", unit: "percentage", default_chart_type: "bar", allowed_dimensions: ["issue_type", "adjuster", "stage"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "re_review_count", display_name: "Re-Review Count", category: "quality", description: "Number of claims that required re-review after initial assessment", calculation: "COUNT(*) FROM claim_reviews WHERE review_type = re_review", unit: "count", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril", "severity"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "human_override_rate", display_name: "Human Override Rate", category: "quality", description: "Percentage of LLM recommendations overridden by human reviewers", calculation: "AVG(CASE WHEN human_override THEN 1 ELSE 0 END)", unit: "percentage", default_chart_type: "bar", allowed_dimensions: ["stage", "decision_type"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "tokens_per_claim", display_name: "Tokens per Claim", category: "cost_llm", description: "Average total tokens (input + output) consumed per claim", calculation: "AVG(input_tokens + output_tokens) FROM claim_llm_usage", unit: "tokens", default_chart_type: "bar", allowed_dimensions: ["stage", "model"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "cost_per_claim", display_name: "Cost per Claim", category: "cost_llm", description: "Average LLM processing cost in USD per claim", calculation: "AVG(cost_usd) FROM claim_llm_usage GROUP BY claim_id", unit: "dollars", default_chart_type: "line", allowed_dimensions: ["stage", "peril", "model"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "model_mix", display_name: "Model Mix", category: "cost_llm", description: "Distribution of LLM calls across different models", calculation: "COUNT(*) FROM claim_llm_usage GROUP BY model", unit: "count", default_chart_type: "pie", allowed_dimensions: ["stage"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "llm_latency", display_name: "LLM Latency", category: "cost_llm", description: "Average response time of LLM calls in milliseconds", calculation: "AVG(latency_ms) FROM claim_llm_usage", unit: "milliseconds", default_chart_type: "line", allowed_dimensions: ["model", "stage"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "severity_distribution", display_name: "Severity Distribution", category: "risk", description: "Breakdown of claims by severity level", calculation: "COUNT(*) FROM claims GROUP BY severity", unit: "count", default_chart_type: "bar", allowed_dimensions: ["peril", "region"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "high_severity_trend", display_name: "High-Severity Trend", category: "risk", description: "Trend of high and critical severity claims over time", calculation: "COUNT(*) FROM claims WHERE severity IN (high, critical) GROUP BY month", unit: "count", default_chart_type: "line", allowed_dimensions: ["peril", "region"], allowed_time_grains: ["day", "week", "month"] },
];

const ADJUSTERS = [
  { id: "00000000-0000-0000-0000-000000000101", full_name: "Sarah Chen", email: "sarah.chen@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000102", full_name: "Mike Torres", email: "mike.torres@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000103", full_name: "Lisa Park", email: "lisa.park@acme.com", team: "Team Beta" },
  { id: "00000000-0000-0000-0000-000000000104", full_name: "James Wilson", email: "james.wilson@acme.com", team: "Team Beta" },
  { id: "00000000-0000-0000-0000-000000000105", full_name: "Maria Garcia", email: "maria.garcia@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000106", full_name: "David Kim", email: "david.kim@acme.com", team: "Team Beta" },
  { id: "00000000-0000-0000-0000-000000000107", full_name: "Rachel Adams", email: "rachel.adams@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000108", full_name: "Tom Rodriguez", email: "tom.rodriguez@acme.com", team: "Team Beta" },
  { id: "00000000-0000-0000-0000-000000000109", full_name: "Amy Liu", email: "amy.liu@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000110", full_name: "Chris Johnson", email: "chris.johnson@acme.com", team: "Team Beta" },
  { id: "00000000-0000-0000-0000-000000000111", full_name: "Nina Patel", email: "nina.patel@acme.com", team: "Team Alpha" },
  { id: "00000000-0000-0000-0000-000000000112", full_name: "Brian Murphy", email: "brian.murphy@acme.com", team: "Team Beta" },
];

const PERILS = ["Water Damage", "Fire", "Theft", "Wind/Hail", "Liability"];
const SEVERITIES: Array<"low" | "medium" | "high" | "critical"> = ["low", "medium", "high", "critical"];
const REGIONS = ["Southeast", "Northeast", "Midwest", "West"];
const STATES: Record<string, string[]> = {
  Southeast: ["FL", "GA", "SC", "NC", "AL"],
  Northeast: ["NY", "NJ", "PA", "CT", "MA"],
  Midwest: ["OH", "IL", "MI", "IN", "WI"],
  West: ["CA", "WA", "OR", "CO", "AZ"],
};
const STATUSES: Array<"open" | "in_progress" | "review" | "closed" | "reopened"> = ["open", "in_progress", "review", "closed", "reopened"];
const STAGES = ["fnol", "investigation", "evaluation", "negotiation", "settlement", "closed"];
const ISSUE_TYPES = ["documentation_gap", "coverage_dispute", "fraud_indicator", "missing_evidence", "late_notification"];
const MODELS = ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20250929", "gpt-4o"];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateClaims(count: number): any[] {
  const claims: any[] = [];
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  for (let i = 0; i < count; i++) {
    const region = randomChoice(REGIONS);
    const state_code = randomChoice(STATES[region]);
    const severity = randomChoice(SEVERITIES);
    const fnol_date = randomDate(yearAgo, now);
    const isClosedChance = Math.random();
    const isClosed = isClosedChance < 0.55;
    const status = isClosed ? "closed" : randomChoice(["open", "in_progress", "review", "reopened"]);
    const stageIdx = isClosed ? STAGES.length - 1 : randomInt(0, STAGES.length - 2);
    const current_stage = STAGES[stageIdx];

    const sla_target_days = severity === "critical" ? 14 : severity === "high" ? 21 : severity === "medium" ? 30 : 45;
    const daysOpen = (now.getTime() - fnol_date.getTime()) / 86400000;
    const closed_at = isClosed
      ? new Date(fnol_date.getTime() + randomInt(3, Math.max(5, sla_target_days + 20)) * 86400000)
      : null;
    const actualDays = closed_at
      ? (closed_at.getTime() - fnol_date.getTime()) / 86400000
      : daysOpen;
    const sla_breached = actualDays > sla_target_days;

    const first_touch_at = new Date(fnol_date.getTime() + randomInt(1, 48) * 3600000);
    const assigned_at = new Date(fnol_date.getTime() + randomInt(0, 24) * 3600000);
    const reserve_amount = randomInt(1000, 250000) + Math.random() * 100;
    const paid_amount = isClosed ? reserve_amount * (0.3 + Math.random() * 0.7) : 0;

    const hasIssues = Math.random() < 0.25;
    const issue_types = hasIssues
      ? Array.from(new Set(Array.from({ length: randomInt(1, 3) }, () => randomChoice(ISSUE_TYPES))))
      : [];
    const reopen_count = status === "reopened" ? randomInt(1, 3) : 0;

    claims.push({
      client_id: CLIENT_ID,
      claim_number: `CLM-${fnol_date.getFullYear()}-${String(i + 1).padStart(5, "0")}`,
      claimant_name: `Claimant ${i + 1}`,
      peril: randomChoice(PERILS),
      severity,
      region,
      state_code,
      status,
      current_stage,
      assigned_adjuster_id: randomChoice(ADJUSTERS).id,
      assigned_at: assigned_at.toISOString(),
      fnol_date: fnol_date.toISOString(),
      first_touch_at: first_touch_at.toISOString(),
      closed_at: closed_at?.toISOString() || null,
      reserve_amount: Math.round(reserve_amount * 100) / 100,
      paid_amount: Math.round(paid_amount * 100) / 100,
      sla_target_days,
      sla_breached,
      has_issues: hasIssues,
      issue_types,
      reopen_count,
    });
  }
  return claims;
}

function generateStageHistory(claims: any[]): any[] {
  const history: any[] = [];
  for (const claim of claims) {
    const stageIdx = STAGES.indexOf(claim.current_stage);
    let currentTime = new Date(claim.fnol_date);
    for (let s = 0; s <= stageIdx; s++) {
      const isCurrentStage = s === stageIdx && claim.status !== "closed";
      const dwellHours = randomInt(12, 240);
      const exitTime = isCurrentStage
        ? null
        : new Date(currentTime.getTime() + dwellHours * 3600000);

      history.push({
        claim_id: null,
        claim_number: claim.claim_number,
        stage: STAGES[s],
        entered_at: currentTime.toISOString(),
        exited_at: exitTime?.toISOString() || null,
        adjuster_id: claim.assigned_adjuster_id,
      });

      if (exitTime) currentTime = exitTime;
    }
  }
  return history;
}

function generateReviews(claims: any[]): any[] {
  const reviews: any[] = [];
  for (const claim of claims) {
    const reviewCount = Math.random() < 0.4 ? randomInt(1, 3) : 0;
    for (let r = 0; r < reviewCount; r++) {
      const reviewTypes = ["quality_review", "supervisor_review", "re_review"];
      const outcomes = ["approved", "returned", "escalated"];
      const llmDecisions = ["approve", "flag_for_review", "escalate", "request_documentation"];
      const humanOverride = Math.random() < 0.2;

      reviews.push({
        claim_id: null,
        claim_number: claim.claim_number,
        review_type: randomChoice(reviewTypes),
        reviewer_id: randomChoice(ADJUSTERS).id,
        outcome: randomChoice(outcomes),
        llm_decision: randomChoice(llmDecisions),
        human_override: humanOverride,
        override_reason: humanOverride ? "Adjuster disagreed with LLM assessment based on field experience" : null,
        reviewed_at: randomDate(new Date(claim.fnol_date), new Date()).toISOString(),
      });
    }
  }
  return reviews;
}

function generateLLMUsage(claims: any[]): any[] {
  const usage: any[] = [];
  for (const claim of claims) {
    const stageIdx = STAGES.indexOf(claim.current_stage);
    for (let s = 0; s <= Math.min(stageIdx, 3); s++) {
      const callCount = randomInt(1, 3);
      for (let c = 0; c < callCount; c++) {
        const model = randomChoice(MODELS);
        const inputTokens = randomInt(500, 4000);
        const outputTokens = randomInt(200, 2000);
        const costRate = model.includes("haiku") ? 0.00025 : model.includes("sonnet") ? 0.003 : 0.005;
        const cost = ((inputTokens + outputTokens) / 1000) * costRate;

        usage.push({
          claim_id: null,
          claim_number: claim.claim_number,
          model,
          stage: STAGES[s],
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: Math.round(cost * 10000) / 10000,
          latency_ms: randomInt(200, 5000),
          called_at: randomDate(new Date(claim.fnol_date), new Date()).toISOString(),
        });
      }
    }
  }
  return usage;
}

async function createTables(): Promise<void> {
  console.log("Creating tables in Supabase...");

  const tableSQL = `
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

    CREATE TABLE IF NOT EXISTS adjusters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id),
      full_name TEXT NOT NULL,
      email TEXT,
      team TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

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

    CREATE TABLE IF NOT EXISTS claim_stage_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      entered_at TIMESTAMPTZ NOT NULL,
      exited_at TIMESTAMPTZ,
      adjuster_id UUID REFERENCES adjusters(id),
      dwell_days DECIMAL(6,2) GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at)) / 86400.0
      ) STORED
    );

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
  `;

  const { error } = await supabase.rpc("exec_sql", { sql: tableSQL });
  if (error) {
    console.log("RPC exec_sql not available, creating tables individually...");
    const statements = tableSQL.split(";").filter((s) => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        const { error: stmtError } = await supabase.rpc("exec_sql", { sql: stmt + ";" });
        if (stmtError) {
          console.log(`Note: ${stmtError.message.slice(0, 100)}`);
        }
      }
    }
  }
}

async function seedData(): Promise<void> {
  console.log("Seeding data...");

  console.log("  Inserting client...");
  await supabase.from("clients").upsert({
    id: CLIENT_ID,
    name: "Acme Insurance Group",
    slug: "acme-insurance",
    config: {},
  }, { onConflict: "id" });

  console.log("  Inserting user...");
  await supabase.from("users").upsert({
    id: USER_ID,
    email: "admin@claimsiq.com",
    full_name: "Claims Manager",
    role: "claims_manager",
  }, { onConflict: "id" });

  console.log("  Inserting user-client access...");
  await supabase.from("user_client_access").upsert({
    user_id: USER_ID,
    client_id: CLIENT_ID,
  }, { onConflict: "user_id,client_id" });

  console.log("  Inserting adjusters...");
  for (const adj of ADJUSTERS) {
    await supabase.from("adjusters").upsert({
      ...adj,
      client_id: CLIENT_ID,
      active: true,
    }, { onConflict: "id" });
  }

  console.log("  Inserting metric definitions...");
  for (const metric of METRIC_DEFINITIONS) {
    await supabase.from("metric_definitions").upsert(
      { ...metric, is_active: true },
      { onConflict: "slug" }
    );
  }

  console.log("  Generating claims...");
  const claims = generateClaims(500);

  console.log("  Inserting claims in batches...");
  const batchSize = 50;
  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);
    const { error } = await supabase.from("claims").upsert(batch, {
      onConflict: "client_id,claim_number",
    });
    if (error) {
      console.error(`  Error inserting claims batch ${i}: ${error.message}`);
    } else {
      console.log(`  Inserted claims ${i + 1}-${Math.min(i + batchSize, claims.length)}`);
    }
  }

  console.log("  Fetching claim IDs for related data...");
  const { data: insertedClaims } = await supabase
    .from("claims")
    .select("id, claim_number, fnol_date, current_stage, status, assigned_adjuster_id")
    .eq("client_id", CLIENT_ID);

  if (!insertedClaims?.length) {
    console.error("No claims found after insert!");
    return;
  }

  const claimMap = new Map(insertedClaims.map((c) => [c.claim_number, c.id]));

  console.log("  Generating stage history...");
  const stageHistory = generateStageHistory(claims);
  for (let i = 0; i < stageHistory.length; i += batchSize) {
    const batch = stageHistory.slice(i, i + batchSize).map((sh) => ({
      ...sh,
      claim_id: claimMap.get(sh.claim_number),
      claim_number: undefined,
    }));
    const cleanBatch = batch.map(({ claim_number, ...rest }) => rest);
    const { error } = await supabase.from("claim_stage_history").insert(cleanBatch);
    if (error) console.log(`  Stage history batch ${i} error: ${error.message.slice(0, 80)}`);
  }

  console.log("  Generating reviews...");
  const reviews = generateReviews(claims);
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize).map((r) => {
      const { claim_number, ...rest } = r;
      return { ...rest, claim_id: claimMap.get(claim_number) };
    });
    const { error } = await supabase.from("claim_reviews").insert(batch);
    if (error) console.log(`  Reviews batch ${i} error: ${error.message.slice(0, 80)}`);
  }

  console.log("  Generating LLM usage...");
  const llmUsage = generateLLMUsage(claims);
  for (let i = 0; i < llmUsage.length; i += batchSize) {
    const batch = llmUsage.slice(i, i + batchSize).map((u) => {
      const { claim_number, ...rest } = u;
      return { ...rest, claim_id: claimMap.get(claim_number) };
    });
    const { error } = await supabase.from("claim_llm_usage").insert(batch);
    if (error) console.log(`  LLM usage batch ${i} error: ${error.message.slice(0, 80)}`);
  }

  console.log("Seeding complete!");
}

async function createRawSQLFunction(): Promise<void> {
  console.log("Creating execute_raw_sql function...");
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
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
    `
  });
  if (error) {
    console.log("Note: exec_sql function may not exist yet. You may need to create the execute_raw_sql function manually in Supabase SQL Editor.");
    console.log("Error:", error.message);
  }
}

export async function runSeed(): Promise<void> {
  try {
    await createTables();
    await createRawSQLFunction();
    await seedData();
    console.log("\n✅ Database seeded successfully!");
  } catch (err) {
    console.error("Seed error:", err);
    throw err;
  }
}

if (require.main === module || process.argv[1]?.includes("seed")) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
