import { getSupabaseClient } from "./config/supabase";

const METRIC_DEFINITIONS = [
  { slug: "claims_received", display_name: "Claims Received", category: "throughput", description: "Total number of new claims filed in the selected period", calculation: "COUNT(*) FROM claims WHERE fnol_date BETWEEN start AND end", unit: "count", default_chart_type: "line", allowed_dimensions: ["day", "week", "month", "peril", "region"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "claims_in_progress", display_name: "Claims In Progress", category: "throughput", description: "Number of claims currently being actively worked", calculation: "COUNT(*) FROM claims WHERE status IN (open, in_progress, review)", unit: "count", default_chart_type: "stacked_bar", allowed_dimensions: ["stage", "adjuster", "peril"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "queue_depth", display_name: "Queue Depth", category: "throughput", description: "Number of claims awaiting action in the queue", calculation: "COUNT(*) FROM claims WHERE status IN (open, in_progress)", unit: "count", default_chart_type: "bar", allowed_dimensions: ["priority", "carrier", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "cycle_time_e2e", display_name: "Cycle Time (E2E)", category: "speed_sla", description: "Average days from first notice of loss to claim closure", calculation: "AVG(closed_at - fnol_date) in days", unit: "days", default_chart_type: "line", allowed_dimensions: ["peril", "region", "severity", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "stage_dwell_time", display_name: "Stage Dwell Time", category: "speed_sla", description: "Average days a claim spends in each processing stage", calculation: "AVG(dwell_days) FROM claim_stage_history GROUP BY stage", unit: "days", default_chart_type: "stacked_bar", allowed_dimensions: ["stage", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "time_to_first_touch", display_name: "Time to First Touch", category: "speed_sla", description: "Average hours from FNOL to first action taken on a claim", calculation: "AVG(first_touch_at - fnol_date) in hours", unit: "hours", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "sla_breach_rate", display_name: "SLA Breach Rate", category: "speed_sla", description: "Percentage of claims that exceeded their SLA target days", calculation: "AVG(CASE WHEN sla_breached THEN 1 ELSE 0 END)", unit: "percentage", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril", "region", "stage"], allowed_time_grains: ["day", "week", "month"] },
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

const PERILS = ["Water Damage", "Fire", "Theft", "Wind/Hail", "Liability"];
const SEVERITIES: Array<"low" | "medium" | "high" | "critical"> = ["low", "medium", "high", "critical"];
const REGIONS = ["Southeast", "Northeast", "Midwest", "West"];
const STATES: Record<string, string[]> = {
  Southeast: ["FL", "GA", "SC", "NC", "AL"],
  Northeast: ["NY", "NJ", "PA", "CT", "MA"],
  Midwest: ["OH", "IL", "MI", "IN", "WI"],
  West: ["CA", "WA", "OR", "CO", "AZ"],
};
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

function generateClaims(count: number, clientId: string, adjusterIds: string[]): any[] {
  const claims: any[] = [];
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  for (let i = 0; i < count; i++) {
    const region = randomChoice(REGIONS);
    const state_code = randomChoice(STATES[region]);
    const severity = randomChoice(SEVERITIES);
    const fnol_date = randomDate(yearAgo, now);
    const status = "open";
    const roll = Math.random();
    let stageIdx: number;
    if (roll < 0.80) {
      stageIdx = randomInt(0, 3);
    } else if (roll < 0.95) {
      stageIdx = 4;
    } else {
      stageIdx = 5;
    }
    const current_stage = STAGES[stageIdx];
    const sla_target_days = severity === "critical" ? 14 : severity === "high" ? 21 : severity === "medium" ? 30 : 45;
    const daysOpen = (now.getTime() - fnol_date.getTime()) / 86400000;
    const closed_at = null;
    const actualDays = daysOpen;
    const sla_breached = actualDays > sla_target_days;
    const first_touch_at = new Date(fnol_date.getTime() + randomInt(1, 48) * 3600000);
    const assigned_at = new Date(fnol_date.getTime() + randomInt(0, 24) * 3600000);
    const reserve_amount = randomInt(1000, 250000) + Math.random() * 100;
    const paid_amount = 0;
    const hasIssues = Math.random() < 0.25;
    const issue_types = hasIssues ? Array.from(new Set(Array.from({ length: randomInt(1, 3) }, () => randomChoice(ISSUE_TYPES)))) : [];
    const reopen_count = 0;

    const monthNum = String(fnol_date.getMonth() + 1).padStart(2, "0");
    claims.push({
      client_id: clientId,
      claim_number: `CLM-${fnol_date.getFullYear()}-${monthNum}-${String(i + 1).padStart(3, "0")}`,
      claimant_name: `Claimant ${i + 1}`,
      peril: randomChoice(PERILS),
      severity, region, state_code, status, current_stage,
      assigned_adjuster_id: randomChoice(adjusterIds),
      assigned_at: assigned_at.toISOString(),
      fnol_date: fnol_date.toISOString(),
      first_touch_at: first_touch_at.toISOString(),
      closed_at: null,
      reserve_amount: Math.round(reserve_amount * 100) / 100,
      paid_amount: Math.round(paid_amount * 100) / 100,
      sla_target_days, sla_breached, has_issues: hasIssues,
      issue_types, reopen_count,
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
      const exitTime = isCurrentStage ? null : new Date(currentTime.getTime() + dwellHours * 3600000);
      history.push({
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

function generateReviews(claims: any[], adjusterIds: string[]): any[] {
  const reviews: any[] = [];
  for (const claim of claims) {
    const reviewCount = Math.random() < 0.4 ? randomInt(1, 3) : 0;
    for (let r = 0; r < reviewCount; r++) {
      const reviewTypes = ["quality_review", "supervisor_review", "re_review"];
      const outcomes = ["approved", "returned", "escalated"];
      const llmDecisions = ["approve", "flag_for_review", "escalate", "request_documentation"];
      const humanOverride = Math.random() < 0.2;
      reviews.push({
        claim_number: claim.claim_number,
        review_type: randomChoice(reviewTypes),
        reviewer_id: randomChoice(adjusterIds),
        outcome: randomChoice(outcomes),
        llm_decision: randomChoice(llmDecisions),
        human_override: humanOverride,
        override_reason: humanOverride ? "Adjuster disagreed with LLM assessment" : null,
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
          claim_number: claim.claim_number,
          model, stage: STAGES[s],
          input_tokens: inputTokens, output_tokens: outputTokens,
          cost_usd: Math.round(cost * 10000) / 10000,
          latency_ms: randomInt(200, 5000),
          called_at: randomDate(new Date(claim.fnol_date), new Date()).toISOString(),
        });
      }
    }
  }
  return usage;
}

const ADJUSTER_NAMES = [
  { first: "James", last: "Mitchell" }, { first: "Sarah", last: "Chen" },
  { first: "Marcus", last: "Williams" }, { first: "Elena", last: "Rodriguez" },
  { first: "David", last: "Park" }, { first: "Rachel", last: "Thompson" },
  { first: "Kevin", last: "O'Brien" }, { first: "Aisha", last: "Patel" },
  { first: "Tyler", last: "Anderson" }, { first: "Maria", last: "Gonzalez" },
  { first: "Brian", last: "Foster" }, { first: "Linda", last: "Kim" },
];
const TEAMS = ["Team Alpha", "Team Bravo"];

async function seedClient(supabase: any, clientId: string, clientName: string): Promise<void> {
  console.log(`\n--- Seeding client: ${clientName} (${clientId}) ---`);

  let { data: existingAdjusters } = await supabase.from("adjusters").select("id").eq("client_id", clientId);
  if (!existingAdjusters?.length) {
    console.log(`  No adjusters found for ${clientName} — creating ${ADJUSTER_NAMES.length} adjusters...`);
    const newAdjusters = ADJUSTER_NAMES.map((name, idx) => ({
      client_id: clientId,
      full_name: `${name.first} ${name.last}`,
      email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}@${clientName.toLowerCase().replace(/\s+/g, "")}.com`,
      team: TEAMS[idx < 6 ? 0 : 1],
    }));
    const { data: inserted, error } = await supabase.from("adjusters").insert(newAdjusters).select("id");
    if (error) {
      console.error(`  Failed to create adjusters: ${error.message}`);
      return;
    }
    existingAdjusters = inserted;
    console.log(`  Created ${inserted.length} adjusters`);
  }
  const adjusterIds = existingAdjusters.map((a: any) => a.id);
  console.log(`  Using ${adjusterIds.length} adjusters`);

  console.log("  Cleaning old claim data...");
  const { data: oldClaimIds } = await supabase.from("claims").select("id").eq("client_id", clientId);
  if (oldClaimIds?.length) {
    const ids = oldClaimIds.map((c: any) => c.id);
    const cleanBatch = 100;
    for (let i = 0; i < ids.length; i += cleanBatch) {
      const batch = ids.slice(i, i + cleanBatch);
      await supabase.from("claim_llm_usage").delete().in("claim_id", batch);
      await supabase.from("claim_reviews").delete().in("claim_id", batch);
      await supabase.from("claim_stage_history").delete().in("claim_id", batch);
    }
    await supabase.from("claims").delete().eq("client_id", clientId);
    console.log(`  Cleaned ${oldClaimIds.length} old claims and related data`);
  }

  await supabase.from("morning_briefs").delete().eq("client_id", clientId);
  const threadIds = (await supabase.from("threads").select("id").eq("client_id", clientId)).data?.map((t: any) => t.id) || [];
  if (threadIds.length) {
    await supabase.from("thread_turns").delete().in("thread_id", threadIds);
  }
  await supabase.from("threads").delete().eq("client_id", clientId);

  const claimCount = 500;
  console.log(`  Generating ${claimCount} claims...`);
  const claims = generateClaims(claimCount, clientId, adjusterIds);

  console.log("  Inserting claims...");
  const batchSize = 50;
  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);
    const { error } = await supabase.from("claims").upsert(batch, { onConflict: "client_id,claim_number" });
    if (error) {
      console.error(`  Claims batch ${i}: ${error.message}`);
    } else {
      console.log(`  Claims ${i + 1}-${Math.min(i + batchSize, claims.length)} inserted`);
    }
  }

  console.log("  Fetching claim IDs...");
  const { data: insertedClaims } = await supabase
    .from("claims")
    .select("id, claim_number")
    .eq("client_id", clientId);

  if (!insertedClaims?.length) {
    console.error("  No claims found after insert!");
    return;
  }

  const claimMap = new Map(insertedClaims.map((c: any) => [c.claim_number, c.id]));
  console.log(`  Mapped ${claimMap.size} claims`);

  console.log("  Inserting stage history...");
  const stageHistory = generateStageHistory(claims);
  for (let i = 0; i < stageHistory.length; i += batchSize) {
    const batch = stageHistory.slice(i, i + batchSize).map((sh) => ({
      claim_id: claimMap.get(sh.claim_number),
      stage: sh.stage,
      entered_at: sh.entered_at,
      exited_at: sh.exited_at,
      adjuster_id: sh.adjuster_id,
      dwell_days: sh.exited_at
        ? Math.round(((new Date(sh.exited_at).getTime() - new Date(sh.entered_at).getTime()) / 86400000) * 100) / 100
        : Math.round(((Date.now() - new Date(sh.entered_at).getTime()) / 86400000) * 100) / 100,
    })).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_stage_history").insert(batch);
      if (error) console.log(`  Stage history batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log("  Inserting reviews...");
  const reviews = generateReviews(claims, adjusterIds);
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize).map((r) => ({
      claim_id: claimMap.get(r.claim_number),
      review_type: r.review_type,
      reviewer_id: r.reviewer_id,
      outcome: r.outcome,
      llm_decision: r.llm_decision,
      human_override: r.human_override,
      override_reason: r.override_reason,
      reviewed_at: r.reviewed_at,
    })).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_reviews").insert(batch);
      if (error) console.log(`  Reviews batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log("  Inserting LLM usage...");
  const llmUsage = generateLLMUsage(claims);
  for (let i = 0; i < llmUsage.length; i += batchSize) {
    const batch = llmUsage.slice(i, i + batchSize).map((u) => ({
      claim_id: claimMap.get(u.claim_number),
      model: u.model,
      stage: u.stage,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cost_usd: u.cost_usd,
      latency_ms: u.latency_ms,
      called_at: u.called_at,
    })).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_llm_usage").insert(batch);
      if (error) console.log(`  LLM usage batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log(`  Done! ${clientName}: ${claims.length} claims, ${stageHistory.length} stage records, ${reviews.length} reviews, ${llmUsage.length} LLM usage records`);
}

export async function runSeed(): Promise<void> {
  const supabase = getSupabaseClient();
  console.log("Seeding data into Supabase...");

  const { data: existingClients } = await supabase.from("clients").select("id, name").order("created_at", { ascending: true });
  if (!existingClients?.length) {
    throw new Error("No clients found in database. Please create a client first.");
  }
  console.log(`Found ${existingClients.length} clients to seed`);

  const { data: existingUsers } = await supabase.from("users").select("id, email").order("created_at", { ascending: true }).limit(1);
  if (!existingUsers?.length) {
    throw new Error("No users found in database. Please create a user first.");
  }
  console.log(`  Using user: ${existingUsers[0].email} (${existingUsers[0].id})`);

  console.log("  Upserting metric definitions...");
  for (const metric of METRIC_DEFINITIONS) {
    const { error } = await supabase.from("metric_definitions").upsert(
      { ...metric, is_active: true },
      { onConflict: "slug" }
    );
    if (error) console.log(`  Metric ${metric.slug}: ${error.message}`);
  }

  for (const client of existingClients) {
    await seedClient(supabase, client.id, client.name);
  }

  console.log("\n=== Seeding complete for all clients! ===");
}
