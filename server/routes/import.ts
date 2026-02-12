import { Router } from "express";
import { getSupabaseClient } from "../config/supabase";
import path from "path";
import { createRequire } from "module";

const _require = typeof require !== "undefined" ? require : createRequire(import.meta.url);
const XLSX = _require("xlsx");

export const importRouter = Router();

const SEVERITY_MAP: Record<string, string> = {
  severe: "critical",
  major: "high",
  moderate: "medium",
  minor: "low",
  none: "low",
};

const PERILS = ["Wind", "Hail", "Water", "Fire", "Tornado", "Wind/Hail"];

importRouter.post("/api/import-spreadsheet", async (_req, res) => {
  try {
    const supabase = getSupabaseClient();
    const filePath = path.resolve("attached_assets/claims_iq_all_50_claims_1770882172302.xlsx");
    const wb = XLSX.readFile(filePath);

    const claimsSheet = XLSX.utils.sheet_to_json(wb.Sheets["claims"]) as any[];
    const adjustersSheet = XLSX.utils.sheet_to_json(wb.Sheets["adjusters"]) as any[];
    const policiesSheet = XLSX.utils.sheet_to_json(wb.Sheets["claim_policies"]) as any[];
    const estimatesSheet = XLSX.utils.sheet_to_json(wb.Sheets["claim_estimates"]) as any[];
    const billingSheet = XLSX.utils.sheet_to_json(wb.Sheets["claim_billing"]) as any[];

    console.log(`[import] Loaded: ${claimsSheet.length} claims, ${adjustersSheet.length} adjusters, ${policiesSheet.length} policies, ${estimatesSheet.length} estimates, ${billingSheet.length} billing records`);

    const { data: clients } = await supabase.from("clients").select("id, name");
    const pilotClient = clients?.find((c: any) => c.name.includes("Pilot"));
    if (!pilotClient) {
      return res.status(400).json({ error: "Pilot Catastrophe Services client not found" });
    }
    const clientId = pilotClient.id;
    console.log(`[import] Using client: ${pilotClient.name} (${clientId})`);

    // Step 1: Purge ALL existing data for this client
    console.log("[import] Purging existing data for client...");

    const { data: oldClaims } = await supabase.from("claims").select("id").eq("client_id", clientId);
    if (oldClaims?.length) {
      const ids = oldClaims.map((c: any) => c.id);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await supabase.from("claim_llm_usage").delete().in("claim_id", batch);
        await supabase.from("claim_reviews").delete().in("claim_id", batch);
        await supabase.from("claim_stage_history").delete().in("claim_id", batch);
        await supabase.from("claim_policies").delete().in("claim_id", batch).then(() => {});
        await supabase.from("claim_estimates").delete().in("claim_id", batch).then(() => {});
        await supabase.from("claim_billing").delete().in("claim_id", batch).then(() => {});
      }
      await supabase.from("claims").delete().eq("client_id", clientId);
      console.log(`[import] Purged ${oldClaims.length} old claims and related data`);
    }

    await supabase.from("adjusters").delete().eq("client_id", clientId);
    await supabase.from("morning_briefs").delete().eq("client_id", clientId);

    const { data: threadData } = await supabase.from("threads").select("id").eq("client_id", clientId);
    if (threadData?.length) {
      for (const t of threadData) {
        await supabase.from("thread_turns").delete().eq("thread_id", t.id);
      }
      await supabase.from("threads").delete().eq("client_id", clientId);
    }

    console.log("[import] Purge complete");

    // Step 2: Insert adjusters and build ID map (ADJ-001 -> uuid)
    const adjusterIdMap: Record<string, string> = {};
    for (let i = 0; i < adjustersSheet.length; i++) {
      const adj = adjustersSheet[i];
      const adjCode = `ADJ-${String(i + 1).padStart(3, "0")}`;

      const { data: inserted, error } = await supabase
        .from("adjusters")
        .insert({
          client_id: clientId,
          full_name: adj.full_name,
          email: adj.email,
          team: adj.team,
        })
        .select("id")
        .single();
      if (error) {
        console.log(`[import] Adjuster ${adjCode} error: ${error.message}`);
        continue;
      }
      adjusterIdMap[adjCode] = inserted.id;
      console.log(`[import] Adjuster ${adjCode} (${adj.full_name}) -> ${inserted.id}`);
    }

    // Step 3: Insert claims — handle nullable fields with sensible defaults
    const now = new Date();
    const claimsToInsert = claimsSheet.map((row: any) => {
      const adjUuid = adjusterIdMap[row.assigned_adjuster_id] || null;

      let status = row.status || "open";
      if (status === "closed_no_payment") status = "closed";
      if (status === "denied") status = "closed";

      const rawSeverity = (row.severity || "").toLowerCase();
      const severity = SEVERITY_MAP[rawSeverity] || "medium";

      const peril = row.peril || row.description?.split(" ")[0] || "Other";
      const fnolDate = row.fnol_date ? new Date(row.fnol_date).toISOString() : (row.date_of_loss ? new Date(row.date_of_loss).toISOString() : now.toISOString());
      const assignedAt = row.assigned_at ? new Date(row.assigned_at).toISOString() : fnolDate;
      const firstTouchAt = row.first_touch_at ? new Date(row.first_touch_at).toISOString() : fnolDate;

      return {
        client_id: clientId,
        claim_number: row.claim_number,
        claimant_name: row.claimant_name || "REDACTED",
        peril,
        severity,
        region: row.region || "Unknown",
        state_code: row.state_code || "XX",
        status,
        current_stage: row.current_stage || "fnol",
        assigned_adjuster_id: adjUuid,
        assigned_at: assignedAt,
        fnol_date: fnolDate,
        first_touch_at: firstTouchAt,
        closed_at: row.closed_at ? new Date(row.closed_at).toISOString() : null,
        reserve_amount: row.reserve_amount ?? 0,
        paid_amount: row.paid_amount ?? 0,
        sla_target_days: row.sla_target_days ?? 30,
        sla_breached: row.sla_breached ?? false,
        has_issues: row.has_issues ?? false,
        issue_types: [],
        reopen_count: row.reopen_count ?? 0,
      };
    });

    let claimsInserted = 0;
    const claimErrors: string[] = [];
    for (let i = 0; i < claimsToInsert.length; i += 25) {
      const batch = claimsToInsert.slice(i, i + 25);
      const { error } = await supabase.from("claims").insert(batch);
      if (error) {
        console.log(`[import] Claims batch ${i}-${i + batch.length} error: ${error.message}`);
        claimErrors.push(error.message);
      } else {
        claimsInserted += batch.length;
        console.log(`[import] Claims ${i + 1}-${i + batch.length} inserted`);
      }
    }

    // Step 4: Build claim_number -> UUID map
    const { data: insertedClaims } = await supabase
      .from("claims")
      .select("id, claim_number")
      .eq("client_id", clientId);

    const claimMap = new Map<string, string>();
    if (insertedClaims) {
      for (const c of insertedClaims) {
        claimMap.set(c.claim_number, c.id);
      }
    }
    console.log(`[import] Mapped ${claimMap.size} claims (number -> UUID)`);

    // Step 5: Generate and insert stage history using UUIDs
    const STAGES = ["fnol", "investigation", "evaluation", "negotiation", "settlement", "closed"];
    const stageHistory: any[] = [];

    for (const row of claimsSheet) {
      const claimUuid = claimMap.get(row.claim_number);
      if (!claimUuid) continue;

      const stageIdx = STAGES.indexOf(row.current_stage || "fnol");
      if (stageIdx < 0) continue;

      const adjUuid = adjusterIdMap[row.assigned_adjuster_id] || null;
      const fnolDate = row.fnol_date ? new Date(row.fnol_date) : (row.date_of_loss ? new Date(row.date_of_loss) : new Date());
      const closedAt = row.closed_at ? new Date(row.closed_at) : null;
      const normalizedStatus = row.status === "closed_no_payment" || row.status === "denied" ? "closed" : row.status;

      for (let s = 0; s <= stageIdx; s++) {
        const isCurrentStage = s === stageIdx && normalizedStatus !== "closed";
        const totalSpan = closedAt ? closedAt.getTime() - fnolDate.getTime() : (Date.now() - fnolDate.getTime());
        const stageSpan = Math.max(totalSpan / (stageIdx + 1), 3600000);
        const enteredAt = new Date(fnolDate.getTime() + s * stageSpan);
        const exitedAt = isCurrentStage ? null : new Date(fnolDate.getTime() + (s + 1) * stageSpan);
        const dwellDays = exitedAt
          ? (exitedAt.getTime() - enteredAt.getTime()) / 86400000
          : (Date.now() - enteredAt.getTime()) / 86400000;

        stageHistory.push({
          claim_id: claimUuid,
          stage: STAGES[s],
          entered_at: enteredAt.toISOString(),
          exited_at: exitedAt?.toISOString() || null,
          dwell_days: Math.round(dwellDays * 100) / 100,
          adjuster_id: adjUuid,
        });
      }
    }

    let stageInserted = 0;
    for (let i = 0; i < stageHistory.length; i += 50) {
      const batch = stageHistory.slice(i, i + 50);
      const { error } = await supabase.from("claim_stage_history").insert(batch);
      if (error) {
        console.log(`[import] Stage history batch error: ${error.message}`);
      } else {
        stageInserted += batch.length;
      }
    }
    console.log(`[import] Inserted ${stageInserted} stage history records`);

    // Step 6: Insert policies, estimates, billing using UUID claim_ids
    let policiesInserted = 0;
    let estimatesInserted = 0;
    let billingInserted = 0;

    // Policies
    const policiesToInsert = policiesSheet
      .map((row: any) => {
        const claimUuid = claimMap.get(row.claim_id);
        if (!claimUuid) return null;
        let endorsements: string[] = [];
        if (row.endorsements) {
          const raw = String(row.endorsements).replace(/^\{|\}$/g, "");
          endorsements = raw.split(",").map((e: string) => e.trim()).filter(Boolean);
        }
        return {
          claim_id: claimUuid,
          policy_number: row.policy_number || "REDACTED",
          policy_type: row.policy_type || "Unknown",
          coverage_type: row.coverage_type || "Unknown",
          coverage_amount: row.coverage_amount ?? 0,
          deductible: row.deductible ?? 0,
          endorsements,
          roof_replacement_included: row.roof_replacement_included ?? false,
          replacement_cost_value: row.replacement_cost_value ?? 0,
          actual_cash_value: row.actual_cash_value ?? 0,
        };
      })
      .filter(Boolean);

    for (let i = 0; i < policiesToInsert.length; i += 25) {
      const batch = policiesToInsert.slice(i, i + 25);
      const { error } = await supabase.from("claim_policies").insert(batch);
      if (error) {
        console.log(`[import] Policies error: ${error.message}`);
      } else {
        policiesInserted += batch.length;
      }
    }
    console.log(`[import] Inserted ${policiesInserted} policy records`);

    // Estimates
    const estimatesToInsert = estimatesSheet
      .map((row: any) => {
        const claimUuid = claimMap.get(row.claim_id);
        if (!claimUuid) return null;
        return {
          claim_id: claimUuid,
          estimate_number: row.estimate_number || `EST-${row.claim_id}-001`,
          estimate_version: row.estimate_version ?? 1,
          estimated_amount: row.estimated_amount ?? 0,
          depreciation_amount: row.depreciation_amount ?? 0,
          replacement_cost: row.replacement_cost ?? 0,
        };
      })
      .filter(Boolean);

    for (let i = 0; i < estimatesToInsert.length; i += 25) {
      const batch = estimatesToInsert.slice(i, i + 25);
      const { error } = await supabase.from("claim_estimates").insert(batch);
      if (error) {
        console.log(`[import] Estimates error: ${error.message}`);
      } else {
        estimatesInserted += batch.length;
      }
    }
    console.log(`[import] Inserted ${estimatesInserted} estimate records`);

    // Billing
    const billingToInsert = billingSheet
      .map((row: any) => {
        const claimUuid = claimMap.get(row.claim_id);
        if (!claimUuid) return null;
        return {
          claim_id: claimUuid,
          billing_type: row.billing_type || null,
          expense_category: row.expense_category || null,
          amount: row.amount ?? null,
          description: row.description || null,
          vendor_name: row.vendor_name || null,
        };
      })
      .filter(Boolean);

    for (let i = 0; i < billingToInsert.length; i += 25) {
      const batch = billingToInsert.slice(i, i + 25);
      const { error } = await supabase.from("claim_billing").insert(batch);
      if (error) {
        console.log(`[import] Billing error: ${error.message}`);
      } else {
        billingInserted += batch.length;
      }
    }
    console.log(`[import] Inserted ${billingInserted} billing records`);

    console.log("[import] Import complete!");

    const warnings: string[] = [];
    if (claimsInserted < claimsSheet.length) warnings.push(`Only ${claimsInserted}/${claimsSheet.length} claims inserted`);
    if (policiesInserted === 0 && policiesToInsert.length > 0) warnings.push("claim_policies table may need migration");
    if (estimatesInserted === 0 && estimatesToInsert.length > 0) warnings.push("claim_estimates table may need migration");
    if (billingInserted === 0 && billingToInsert.length > 0) warnings.push("claim_billing table may need migration");
    if (claimErrors.length > 0) warnings.push(...claimErrors);

    res.json({
      status: "ok",
      message: "Spreadsheet imported successfully",
      summary: {
        client: pilotClient.name,
        adjusters: Object.keys(adjusterIdMap).length,
        claims: claimsInserted,
        stageHistory: stageInserted,
        policies: policiesInserted,
        estimates: estimatesInserted,
        billing: billingInserted,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err: any) {
    console.error("[import] Error:", err);
    res.status(500).json({ error: err.message });
  }
});
