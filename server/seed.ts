import { getSupabaseClient } from "./config/supabase";
import XLSX from "xlsx";
import * as path from "path";
import { fileURLToPath } from "url";

const __seed_dirname = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_PATH = path.resolve(__seed_dirname, "../attached_assets/claims_iq_all_50_claims_1770882172302.xlsx");

function readSpreadsheet() {
  const wb = XLSX.readFile(SPREADSHEET_PATH);
  return {
    adjusters: XLSX.utils.sheet_to_json(wb.Sheets["adjusters"]) as any[],
    claims: XLSX.utils.sheet_to_json(wb.Sheets["claims"]) as any[],
    claim_policies: XLSX.utils.sheet_to_json(wb.Sheets["claim_policies"]) as any[],
    claim_estimates: XLSX.utils.sheet_to_json(wb.Sheets["claim_estimates"]) as any[],
    claim_billing: XLSX.utils.sheet_to_json(wb.Sheets["claim_billing"]) as any[],
  };
}

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
  { slug: "reserve_amount", display_name: "Reserve Amount", category: "financial", description: "Total or average reserve amount set for claims", calculation: "SUM/AVG(reserve_amount) FROM claims", unit: "dollars", default_chart_type: "bar", allowed_dimensions: ["peril", "region", "severity", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "paid_amount", display_name: "Paid Amount", category: "financial", description: "Total or average amount paid on claims", calculation: "SUM/AVG(paid_amount) FROM claims", unit: "dollars", default_chart_type: "bar", allowed_dimensions: ["peril", "region", "severity", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "estimate_accuracy", display_name: "Estimate Accuracy", category: "financial", description: "Ratio of estimated amount to actual paid amount, showing estimation precision", calculation: "AVG(estimated_amount / paid_amount) FROM claim_estimates JOIN claims", unit: "percentage", default_chart_type: "bar", allowed_dimensions: ["adjuster", "peril", "severity"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "depreciation_ratio", display_name: "Depreciation Ratio", category: "financial", description: "Average depreciation as a percentage of replacement cost", calculation: "AVG(depreciation_amount / replacement_cost) FROM claim_estimates", unit: "percentage", default_chart_type: "bar", allowed_dimensions: ["peril", "severity"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "coverage_type_distribution", display_name: "Coverage Type Distribution", category: "policy", description: "Breakdown of claims by coverage type (Dwelling, Contents, etc.)", calculation: "COUNT(*) FROM claim_policies GROUP BY coverage_type", unit: "count", default_chart_type: "pie", allowed_dimensions: ["coverage_type"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "total_expenses_per_claim", display_name: "Total Expenses per Claim", category: "financial", description: "Average total billing expenses per claim", calculation: "AVG(SUM(amount)) FROM claim_billing GROUP BY claim_id", unit: "dollars", default_chart_type: "bar", allowed_dimensions: ["expense_category", "vendor_name", "adjuster"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "expense_type_breakdown", display_name: "Expense Type Breakdown", category: "financial", description: "Distribution of billing expenses by category", calculation: "SUM(amount) FROM claim_billing GROUP BY expense_category", unit: "dollars", default_chart_type: "pie", allowed_dimensions: ["expense_category", "vendor_name"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "net_claim_amount_trend", display_name: "Net Claim Amount Trend", category: "financial", description: "Trend of net paid amounts over time", calculation: "SUM(paid_amount) FROM claims GROUP BY time", unit: "dollars", default_chart_type: "line", allowed_dimensions: ["day", "week", "month", "peril", "region"], allowed_time_grains: ["day", "week", "month"] },
  { slug: "deductible_analysis", display_name: "Deductible Analysis", category: "policy", description: "Distribution and average of policy deductibles", calculation: "AVG(deductible) FROM claim_policies", unit: "dollars", default_chart_type: "bar", allowed_dimensions: ["policy_type", "coverage_type"], allowed_time_grains: ["day", "week", "month"] },
];

const STAGES = ["fnol", "investigation", "evaluation", "negotiation", "settlement", "closed"];
const MODELS = ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20250929", "gpt-4o"];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateStageHistory(claims: any[], adjusterIdMap: Map<string, string>): any[] {
  const history: any[] = [];
  for (const claim of claims) {
    const stageIdx = STAGES.indexOf(claim.current_stage);
    if (stageIdx < 0) continue;
    if (!claim.fnol_date && !claim.date_of_loss && !claim.assigned_at) continue;
    const fnolDate = new Date(claim.fnol_date || claim.date_of_loss || claim.assigned_at);
    let currentTime = fnolDate;
    const closedAt = claim.closed_at ? new Date(claim.closed_at) : null;
    const totalDays = closedAt
      ? (closedAt.getTime() - fnolDate.getTime()) / 86400000
      : (Date.now() - fnolDate.getTime()) / 86400000;
    const stagesCount = stageIdx + 1;
    const avgDwell = totalDays / stagesCount;

    for (let s = 0; s <= stageIdx; s++) {
      const isLast = s === stageIdx;
      const dwellDays = isLast && !closedAt
        ? (Date.now() - currentTime.getTime()) / 86400000
        : Math.max(0.5, avgDwell * (0.5 + Math.random()));
      const exitTime = isLast && !closedAt
        ? null
        : new Date(currentTime.getTime() + dwellDays * 86400000);
      history.push({
        claim_id: claim._dbId,
        stage: STAGES[s],
        entered_at: currentTime.toISOString(),
        exited_at: exitTime?.toISOString() || null,
        adjuster_id: adjusterIdMap.get(claim.assigned_adjuster_id) || null,
        dwell_days: Math.round(dwellDays * 100) / 100,
      });
      if (exitTime) currentTime = exitTime;
    }
  }
  return history;
}

function generateLLMUsage(claims: any[]): any[] {
  const usage: any[] = [];
  for (const claim of claims) {
    const stageIdx = STAGES.indexOf(claim.current_stage);
    if (stageIdx < 0) continue;
    for (let s = 0; s <= Math.min(stageIdx, 3); s++) {
      const callCount = randomInt(1, 3);
      for (let c = 0; c < callCount; c++) {
        const model = randomChoice(MODELS);
        const inputTokens = randomInt(500, 4000);
        const outputTokens = randomInt(200, 2000);
        const costRate = model.includes("haiku") ? 0.00025 : model.includes("sonnet") ? 0.003 : 0.005;
        const cost = ((inputTokens + outputTokens) / 1000) * costRate;
        const rawFnol = claim.fnol_date || claim.date_of_loss || claim.assigned_at;
        if (!rawFnol) continue;
        const fnolDate = new Date(rawFnol);
        if (isNaN(fnolDate.getTime())) continue;
        const endDate = claim.closed_at ? new Date(claim.closed_at) : new Date();
        const calledAt = new Date(fnolDate.getTime() + Math.random() * (endDate.getTime() - fnolDate.getTime()));
        usage.push({
          claim_id: claim._dbId,
          model,
          stage: STAGES[s],
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: Math.round(cost * 10000) / 10000,
          latency_ms: randomInt(200, 5000),
          called_at: calledAt.toISOString(),
        });
      }
    }
  }
  return usage;
}

function generateReviews(claims: any[], adjusterDbIds: string[]): any[] {
  const reviews: any[] = [];
  for (const claim of claims) {
    const reviewCount = Math.random() < 0.4 ? randomInt(1, 3) : 0;
    for (let r = 0; r < reviewCount; r++) {
      const reviewTypes = ["quality_review", "supervisor_review", "re_review"];
      const outcomes = ["approved", "returned", "escalated"];
      const llmDecisions = ["approve", "flag_for_review", "escalate", "request_documentation"];
      const humanOverride = Math.random() < 0.2;
      const rawFnol = claim.fnol_date || claim.date_of_loss || claim.assigned_at;
      if (!rawFnol) continue;
      const fnolDate = new Date(rawFnol);
      if (isNaN(fnolDate.getTime())) continue;
      const endDate = claim.closed_at ? new Date(claim.closed_at) : new Date();
      const reviewedAt = new Date(fnolDate.getTime() + Math.random() * (endDate.getTime() - fnolDate.getTime()));
      reviews.push({
        claim_id: claim._dbId,
        review_type: randomChoice(reviewTypes),
        reviewer_id: randomChoice(adjusterDbIds),
        outcome: randomChoice(outcomes),
        llm_decision: randomChoice(llmDecisions),
        human_override: humanOverride,
        override_reason: humanOverride ? "Adjuster disagreed with LLM assessment" : null,
        reviewed_at: reviewedAt.toISOString(),
      });
    }
  }
  return reviews;
}

const SEVERITY_MAP: Record<string, string> = {
  minor: "low",
  moderate: "medium",
  major: "high",
  severe: "critical",
  none: "low",
};

const STATUS_MAP: Record<string, string> = {
  open: "open",
  closed: "closed",
  closed_no_payment: "closed",
  denied: "closed",
  in_progress: "in_progress",
  review: "review",
  reopened: "reopened",
};

function mapSeverity(val: string | undefined): string {
  if (!val) return "low";
  return SEVERITY_MAP[val.toLowerCase()] || val.toLowerCase();
}

function mapStatus(val: string | undefined): string {
  if (!val) return "open";
  return STATUS_MAP[val.toLowerCase()] || val.toLowerCase();
}

function excelDateToJSDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400000);
}

function fillMissingDates(claims: any[]): void {
  const catCodeDates: Record<string, string[]> = {};
  claims.filter(c => c.cat_code && c.date_of_loss).forEach(c => {
    if (!catCodeDates[c.cat_code]) catCodeDates[c.cat_code] = [];
    catCodeDates[c.cat_code].push(c.date_of_loss);
  });

  const withDOL = claims.filter(c => c.date_of_loss);
  const dolDates = withDOL.map(c => new Date(c.date_of_loss).getTime()).sort((a, b) => a - b);
  const minDate = dolDates[0] || new Date("2024-01-01").getTime();
  const maxDate = dolDates[dolDates.length - 1] || new Date("2025-08-01").getTime();

  for (const c of claims) {
    if (!c.date_of_loss) {
      if (c.cat_code && catCodeDates[c.cat_code]?.length) {
        const catDates = catCodeDates[c.cat_code];
        const baseDate = new Date(catDates[0]);
        const offsetDays = randomInt(-2, 5);
        c.date_of_loss = new Date(baseDate.getTime() + offsetDays * 86400000).toISOString().split("T")[0];
      } else if (c.closed_at) {
        const closed = new Date(c.closed_at);
        const daysBeforeClose = randomInt(10, 30);
        c.date_of_loss = new Date(closed.getTime() - daysBeforeClose * 86400000).toISOString().split("T")[0];
      } else {
        const randomTime = minDate + Math.random() * (maxDate - minDate);
        c.date_of_loss = new Date(randomTime).toISOString().split("T")[0];
      }
    }

    if (!c.fnol_date) {
      const dol = new Date(c.date_of_loss);
      const daysAfterLoss = randomInt(0, 3);
      c.fnol_date = new Date(dol.getTime() + daysAfterLoss * 86400000).toISOString().split("T")[0];
    }

    if (!c.assigned_at) {
      const fnol = new Date(c.fnol_date);
      const daysAfter = randomInt(0, 2);
      c.assigned_at = new Date(fnol.getTime() + daysAfter * 86400000).toISOString().split("T")[0];
    }

    if (!c.first_touch_at) {
      const assigned = new Date(c.assigned_at);
      const hoursAfter = randomInt(1, 48);
      c.first_touch_at = new Date(assigned.getTime() + hoursAfter * 3600000).toISOString().split("T")[0];
    }
  }

  console.log(`  Filled dates for ${claims.filter(c => c.fnol_date).length}/${claims.length} claims (all should have date_of_loss and fnol_date now)`);
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = excelDateToJSDate(val);
    return d.toISOString().split("T")[0];
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return null;
}

function parseTimestamp(val: any): string | null {
  const dateStr = parseDate(val);
  if (!dateStr) return null;
  return `${dateStr}T12:00:00.000Z`;
}

async function seedClient(supabase: any, clientId: string, clientName: string, data: ReturnType<typeof readSpreadsheet>): Promise<void> {
  console.log(`\n--- Seeding client: ${clientName} (${clientId}) ---`);

  console.log("  Deleting existing adjusters...");
  await supabase.from("adjusters").delete().eq("client_id", clientId);

  console.log(`  Inserting ${data.adjusters.length} adjusters from spreadsheet...`);
  const adjusterRows = data.adjusters.map((a, idx) => ({
    client_id: clientId,
    full_name: a.full_name,
    email: a.email,
    team: a.team,
    active: a.active !== false,
    adjuster_number: a.adjuster_number ? String(a.adjuster_number) : null,
    adjuster_type: a.adjuster_type || "field",
    company: a.company || clientName,
  }));
  const { data: insertedAdj, error: adjError } = await supabase.from("adjusters").insert(adjusterRows).select("id, full_name");
  if (adjError) {
    console.error(`  Failed to create adjusters: ${adjError.message}`);
    return;
  }
  console.log(`  Created ${insertedAdj.length} adjusters: ${insertedAdj.map((a: any) => a.full_name).join(", ")}`);

  const adjusterIdMap = new Map<string, string>();
  insertedAdj.forEach((a: any, idx: number) => {
    adjusterIdMap.set(`ADJ-${String(idx + 1).padStart(3, "0")}`, a.id);
  });
  const adjusterDbIds = insertedAdj.map((a: any) => a.id);

  console.log("  Cleaning old claim data...");
  const { data: oldClaimIds } = await supabase.from("claims").select("id").eq("client_id", clientId);
  if (oldClaimIds?.length) {
    const ids = oldClaimIds.map((c: any) => c.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("claim_llm_usage").delete().in("claim_id", batch);
      await supabase.from("claim_reviews").delete().in("claim_id", batch);
      await supabase.from("claim_stage_history").delete().in("claim_id", batch);
      await supabase.from("claim_policies").delete().in("claim_id", batch);
      await supabase.from("claim_estimates").delete().in("claim_id", batch);
      await supabase.from("claim_billing").delete().in("claim_id", batch);
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

  console.log(`  Filling missing dates for claims...`);
  fillMissingDates(data.claims);

  console.log(`  Inserting ${data.claims.length} claims from spreadsheet...`);
  const claimRows = data.claims.map((c) => ({
    client_id: clientId,
    claim_number: c.claim_number,
    claimant_name: c.claimant_name || "REDACTED",
    peril: c.peril || "Other",
    severity: mapSeverity(c.severity),
    region: c.region || "Unknown",
    state_code: c.state_code || null,
    status: mapStatus(c.status),
    current_stage: c.current_stage || "review",
    assigned_adjuster_id: adjusterIdMap.get(c.assigned_adjuster_id) || null,
    assigned_at: parseTimestamp(c.assigned_at),
    fnol_date: parseTimestamp(c.fnol_date) || parseTimestamp(c.date_of_loss) || parseTimestamp(c.assigned_at) || new Date().toISOString(),
    first_touch_at: parseTimestamp(c.first_touch_at),
    closed_at: parseTimestamp(c.closed_at),
    reserve_amount: typeof c.reserve_amount === "number" ? Math.round(c.reserve_amount * 100) / 100 : 0,
    paid_amount: typeof c.paid_amount === "number" ? Math.round(c.paid_amount * 100) / 100 : 0,
    sla_target_days: c.sla_target_days || 30,
    sla_breached: c.sla_breached === true || c.sla_breached === "true",
    has_issues: c.has_issues === true || c.has_issues === "true",
    issue_types: [],
    reopen_count: c.reopen_count || 0,
    cat_code: c.cat_code || null,
    date_of_loss: parseDate(c.date_of_loss),
    property_year_built: c.property_year_built || null,
    roof_install_year: c.roof_install_year || null,
    wood_roof: c.wood_roof === true || c.wood_roof === "true",
    description: c.description || null,
  }));

  const batchSize = 25;
  for (let i = 0; i < claimRows.length; i += batchSize) {
    const batch = claimRows.slice(i, i + batchSize);
    const { error } = await supabase.from("claims").upsert(batch, { onConflict: "client_id,claim_number" });
    if (error) {
      console.error(`  Claims batch ${i}: ${error.message}`);
    }
  }

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

  const claimsWithDbId = data.claims.map((c) => ({
    ...c,
    _dbId: claimMap.get(c.claim_number),
  }));

  console.log(`  Inserting ${data.claim_policies.length} claim policies...`);
  const policyRows = data.claim_policies.map((p) => ({
    claim_id: claimMap.get(p.claim_id) || null,
    policy_number: p.policy_number || "REDACTED",
    policy_type: p.policy_type || "HO 03",
    coverage_type: p.coverage_type || "Dwelling",
    coverage_amount: typeof p.coverage_amount === "number" ? p.coverage_amount : null,
    deductible: typeof p.deductible === "number" ? p.deductible : null,
    endorsements: p.endorsements
      ? (typeof p.endorsements === "string"
          ? p.endorsements.replace(/[{}]/g, "").split(",").map((s: string) => s.trim()).filter(Boolean)
          : [])
      : [],
    roof_replacement_included: p.roof_replacement_included === true || p.roof_replacement_included === "true",
    replacement_cost_value: typeof p.replacement_cost_value === "number" ? p.replacement_cost_value : null,
    actual_cash_value: typeof p.actual_cash_value === "number" ? p.actual_cash_value : null,
  })).filter((p) => p.claim_id);

  for (let i = 0; i < policyRows.length; i += batchSize) {
    const batch = policyRows.slice(i, i + batchSize);
    const { error } = await supabase.from("claim_policies").insert(batch);
    if (error) console.error(`  Policies batch ${i}: ${error.message}`);
  }

  console.log(`  Inserting ${data.claim_estimates.length} claim estimates...`);
  const estimateRows = data.claim_estimates.map((e) => ({
    claim_id: claimMap.get(e.claim_id) || null,
    estimate_number: e.estimate_number || null,
    estimate_version: e.estimate_version || 1,
    estimated_amount: typeof e.estimated_amount === "number" ? e.estimated_amount : 0,
    depreciation_amount: typeof e.depreciation_amount === "number" ? e.depreciation_amount : 0,
    replacement_cost: typeof e.replacement_cost === "number" ? e.replacement_cost : 0,
  })).filter((e) => e.claim_id);

  for (let i = 0; i < estimateRows.length; i += batchSize) {
    const batch = estimateRows.slice(i, i + batchSize);
    const { error } = await supabase.from("claim_estimates").insert(batch);
    if (error) console.error(`  Estimates batch ${i}: ${error.message}`);
  }

  console.log(`  Inserting ${data.claim_billing.length} claim billing records...`);
  const billingRows = data.claim_billing.map((b) => ({
    claim_id: claimMap.get(b.claim_id) || null,
    billing_type: b.billing_type || null,
    expense_category: b.expense_category || null,
    amount: typeof b.amount === "number" ? b.amount : 0,
    description: b.description || null,
    vendor_name: b.vendor_name || null,
  })).filter((b) => b.claim_id);

  for (let i = 0; i < billingRows.length; i += batchSize) {
    const batch = billingRows.slice(i, i + batchSize);
    const { error } = await supabase.from("claim_billing").insert(batch);
    if (error) console.error(`  Billing batch ${i}: ${error.message}`);
  }

  console.log("  Generating stage history...");
  const stageHistory = generateStageHistory(claimsWithDbId, adjusterIdMap);
  for (let i = 0; i < stageHistory.length; i += batchSize) {
    const batch = stageHistory.slice(i, i + batchSize).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_stage_history").insert(batch);
      if (error) console.error(`  Stage history batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log("  Generating reviews...");
  const reviews = generateReviews(claimsWithDbId, adjusterDbIds);
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_reviews").insert(batch);
      if (error) console.error(`  Reviews batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log("  Generating LLM usage records...");
  const llmUsage = generateLLMUsage(claimsWithDbId);
  for (let i = 0; i < llmUsage.length; i += batchSize) {
    const batch = llmUsage.slice(i, i + batchSize).filter((r) => r.claim_id);
    if (batch.length) {
      const { error } = await supabase.from("claim_llm_usage").insert(batch);
      if (error) console.error(`  LLM usage batch ${i}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log(`\n  === ${clientName} seeding complete ===`);
  console.log(`  ${data.claims.length} claims, ${data.adjusters.length} adjusters`);
  console.log(`  ${data.claim_policies.length} policies, ${data.claim_estimates.length} estimates, ${data.claim_billing.length} billing records`);
  console.log(`  ${stageHistory.length} stage history, ${reviews.length} reviews, ${llmUsage.length} LLM usage records`);
}

export async function runSeed(): Promise<void> {
  const supabase = getSupabaseClient();
  console.log("Reading spreadsheet data...");
  const spreadsheetData = readSpreadsheet();
  console.log(`  Loaded: ${spreadsheetData.claims.length} claims, ${spreadsheetData.adjusters.length} adjusters, ${spreadsheetData.claim_policies.length} policies, ${spreadsheetData.claim_estimates.length} estimates, ${spreadsheetData.claim_billing.length} billing records`);

  console.log("\nSeeding data into Supabase...");
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
    await seedClient(supabase, client.id, client.name, spreadsheetData);
  }

  console.log("\n=== Seeding complete for all clients! ===");
}
