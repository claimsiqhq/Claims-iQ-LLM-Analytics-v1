import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { getSupabaseClient, supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

const _require = typeof require !== "undefined" ? require : createRequire(import.meta.url);
const XLSX = _require("xlsx");

export const settingsRouter = Router();

const upload = multer({
  dest: "/tmp/uploads/",
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls", ".csv"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, and .csv files are allowed"));
    }
  },
});

const SEVERITY_MAP: Record<string, string> = {
  severe: "critical",
  major: "high",
  moderate: "medium",
  minor: "low",
  none: "low",
};

const STAGES = ["fnol", "investigation", "evaluation", "negotiation", "settlement", "closed"];

settingsRouter.post("/api/settings/import-spreadsheet", upload.single("file"), async (req: Request, res: Response) => {
  const file = (req as any).file;
  try {
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const clientId = (req.body.client_id as string) || (req.query.client_id as string) || await getDefaultClientId();

    const sb = getSupabaseClient();
    const wb = XLSX.readFile(file.path);

    const sheetNames = wb.SheetNames as string[];
    const result: any = { sheetsFound: sheetNames, imported: {}, purged: {} };

    const claimsSheet = wb.Sheets["claims"] ? XLSX.utils.sheet_to_json(wb.Sheets["claims"]) as any[] : [];
    const adjustersSheet = wb.Sheets["adjusters"] ? XLSX.utils.sheet_to_json(wb.Sheets["adjusters"]) as any[] : [];
    const policiesSheet = wb.Sheets["claim_policies"] ? XLSX.utils.sheet_to_json(wb.Sheets["claim_policies"]) as any[] : [];
    const estimatesSheet = wb.Sheets["claim_estimates"] ? XLSX.utils.sheet_to_json(wb.Sheets["claim_estimates"]) as any[] : [];
    const billingSheet = wb.Sheets["claim_billing"] ? XLSX.utils.sheet_to_json(wb.Sheets["claim_billing"]) as any[] : [];

    const { data: oldClaims } = await sb.from("claims").select("id").eq("client_id", clientId);
    if (oldClaims?.length) {
      const ids = oldClaims.map((c: any) => c.id);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await sb.from("claim_llm_usage").delete().in("claim_id", batch);
        await sb.from("claim_reviews").delete().in("claim_id", batch);
        await sb.from("claim_stage_history").delete().in("claim_id", batch);
        await sb.from("claim_policies").delete().in("claim_id", batch);
        await sb.from("claim_estimates").delete().in("claim_id", batch);
        await sb.from("claim_billing").delete().in("claim_id", batch);
      }
      await sb.from("claims").delete().eq("client_id", clientId);
      result.purged.claims = oldClaims.length;
    }
    await sb.from("adjusters").delete().eq("client_id", clientId);
    result.purged.adjusters = true;

    const adjusterIdMap: Record<string, string> = {};
    if (adjustersSheet.length > 0) {
      for (let i = 0; i < adjustersSheet.length; i++) {
        const adj = adjustersSheet[i];
        const adjCode = `ADJ-${String(i + 1).padStart(3, "0")}`;
        const { data: inserted, error } = await sb
          .from("adjusters")
          .insert({ client_id: clientId, full_name: adj.full_name, email: adj.email, team: adj.team })
          .select("id")
          .single();
        if (!error && inserted) {
          adjusterIdMap[adjCode] = inserted.id;
        }
      }
      result.imported.adjusters = Object.keys(adjusterIdMap).length;
    }

    if (claimsSheet.length > 0) {
      const now = new Date();
      const allNewClaims = claimsSheet.map((row: any) => {
        const adjUuid = adjusterIdMap[row.assigned_adjuster_id] || null;
        let status = row.status || "open";
        if (status === "closed_no_payment") status = "closed";
        if (status === "denied") status = "closed";
        const rawSeverity = (row.severity || "").toLowerCase();
        const severity = SEVERITY_MAP[rawSeverity] || "medium";
        const peril = row.peril || "Other";
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
      for (let i = 0; i < allNewClaims.length; i += 25) {
        const batch = allNewClaims.slice(i, i + 25);
        const { error } = await sb.from("claims").insert(batch);
        if (!error) claimsInserted += batch.length;
      }
      result.imported.claims = claimsInserted;

      const { data: allClaims } = await sb.from("claims").select("id, claim_number").eq("client_id", clientId);
      const claimMap = new Map<string, string>((allClaims || []).map((c: any) => [c.claim_number, c.id]));

      const stageHistory: any[] = [];
      for (const row of claimsSheet) {
        const claimUuid = claimMap.get(row.claim_number);
        if (!claimUuid) continue;
        const stageIdx = STAGES.indexOf(row.current_stage || "fnol");
        if (stageIdx < 0) continue;
        const adjUuid = adjusterIdMap[row.assigned_adjuster_id] || null;
        const fnolDate = row.fnol_date ? new Date(row.fnol_date) : new Date();
        const closedAt = row.closed_at ? new Date(row.closed_at) : null;
        for (let s = 0; s <= stageIdx; s++) {
          const normalizedStatus = row.status === "closed_no_payment" || row.status === "denied" ? "closed" : row.status;
          const isCurrentStage = s === stageIdx && normalizedStatus !== "closed";
          const totalSpan = closedAt ? closedAt.getTime() - fnolDate.getTime() : (Date.now() - fnolDate.getTime());
          const stageSpan = Math.max(totalSpan / (stageIdx + 1), 3600000);
          const enteredAt = new Date(fnolDate.getTime() + s * stageSpan);
          const exitedAt = isCurrentStage ? null : new Date(fnolDate.getTime() + (s + 1) * stageSpan);
          const dwellDays = exitedAt ? (exitedAt.getTime() - enteredAt.getTime()) / 86400000 : (Date.now() - enteredAt.getTime()) / 86400000;
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
        const { error } = await sb.from("claim_stage_history").insert(batch);
        if (!error) stageInserted += batch.length;
      }
      result.imported.stageHistory = stageInserted;

      if (policiesSheet.length > 0) {
        const polToInsert = policiesSheet
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

        let polInserted = 0;
        for (let i = 0; i < polToInsert.length; i += 25) {
          const batch = polToInsert.slice(i, i + 25);
          const { error } = await sb.from("claim_policies").insert(batch);
          if (!error) polInserted += batch.length;
        }
        result.imported.policies = polInserted;
      }

      if (estimatesSheet.length > 0) {
        const estToInsert = estimatesSheet
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

        let estInserted = 0;
        for (let i = 0; i < estToInsert.length; i += 25) {
          const batch = estToInsert.slice(i, i + 25);
          const { error } = await sb.from("claim_estimates").insert(batch);
          if (!error) estInserted += batch.length;
        }
        result.imported.estimates = estInserted;
      }

      if (billingSheet.length > 0) {
        const bilToInsert = billingSheet
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

        let bilInserted = 0;
        for (let i = 0; i < bilToInsert.length; i += 25) {
          const batch = bilToInsert.slice(i, i + 25);
          const { error } = await sb.from("claim_billing").insert(batch);
          if (!error) bilInserted += batch.length;
        }
        result.imported.billing = bilInserted;
      }
    }

    res.json({
      status: "ok",
      message: "Spreadsheet imported — all existing data replaced with spreadsheet contents",
      ...result,
    });
  } catch (err: any) {
    console.error("[settings/import] Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (file?.path) {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }
});

settingsRouter.get("/api/settings/data-summary", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const sb = getSupabaseClient();

    const [claims, adjusters, policies, estimates, billing, threads, stages] = await Promise.all([
      sb.from("claims").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      sb.from("adjusters").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      sb.from("claim_policies").select("id", { count: "exact", head: true }).in(
        "claim_id",
        (await sb.from("claims").select("id").eq("client_id", clientId)).data?.map((c: any) => c.id) || []
      ),
      sb.from("claim_estimates").select("id", { count: "exact", head: true }).in(
        "claim_id",
        (await sb.from("claims").select("id").eq("client_id", clientId)).data?.map((c: any) => c.id) || []
      ),
      sb.from("claim_billing").select("id", { count: "exact", head: true }).in(
        "claim_id",
        (await sb.from("claims").select("id").eq("client_id", clientId)).data?.map((c: any) => c.id) || []
      ),
      sb.from("threads").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      sb.from("claim_stage_history").select("id", { count: "exact", head: true }).in(
        "claim_id",
        (await sb.from("claims").select("id").eq("client_id", clientId)).data?.map((c: any) => c.id) || []
      ),
    ]);

    res.json({
      claims: claims.count || 0,
      adjusters: adjusters.count || 0,
      policies: policies.count || 0,
      estimates: estimates.count || 0,
      billing: billing.count || 0,
      threads: threads.count || 0,
      stageHistory: stages.count || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get("/api/settings/clients", async (_req: Request, res: Response) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from("clients").select("*").order("name");
    if (error) throw new Error(error.message);
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.post("/api/settings/clients", async (req: Request, res: Response) => {
  try {
    const { name, slug } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("clients")
      .insert({ name, slug: slug || name.toLowerCase().replace(/\s+/g, "-") })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.delete("/api/settings/clients/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const sb = getSupabaseClient();
    const { error } = await sb.from("clients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get("/api/settings/users", async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string;
    const sb = getSupabaseClient();

    let query = sb.from("users").select("*").order("full_name");
    if (clientId) {
      const { data: access } = await sb.from("user_client_access").select("user_id").eq("client_id", clientId);
      const userIds = (access || []).map((a: any) => a.user_id);
      if (userIds.length > 0) {
        query = query.in("id", userIds);
      } else {
        return res.json({ data: [] });
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get("/api/settings/adjusters", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const sb = getSupabaseClient();
    const { data, error } = await sb.from("adjusters").select("*").eq("client_id", clientId).order("full_name");
    if (error) throw new Error(error.message);
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get("/api/settings/ai-config", async (_req: Request, res: Response) => {
  try {
    const hasAnthropic = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const anthropicBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

    res.json({
      providers: {
        anthropic: {
          configured: hasAnthropic,
          baseUrl: anthropicBase,
          model: "claude-sonnet-4-5",
          usage: "Intent parsing, insight generation",
        },
        openai: {
          configured: hasOpenAI,
          model: "gpt-4o-realtime-preview",
          usage: "Voice agent (Realtime API)",
        },
      },
      features: {
        intentParsing: hasAnthropic,
        insightGeneration: hasAnthropic,
        voiceAgent: hasOpenAI,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get("/api/settings/preferences", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const sb = getSupabaseClient();

    const { data } = await sb.from("client_preferences").select("*").eq("client_id", clientId).single();

    res.json({
      data: data || {
        default_chart_type: "bar",
        default_time_range: "30d",
        theme: "system",
        notifications_enabled: true,
        auto_refresh_interval: 300,
      },
    });
  } catch (err: any) {
    res.json({
      data: {
        default_chart_type: "bar",
        default_time_range: "30d",
        theme: "system",
        notifications_enabled: true,
        auto_refresh_interval: 300,
      },
    });
  }
});

settingsRouter.put("/api/settings/preferences", async (req: Request, res: Response) => {
  try {
    const clientId = (req.body.client_id as string) || await getDefaultClientId();
    const prefs = req.body.preferences;
    const sb = getSupabaseClient();

    const { data: existing } = await sb.from("client_preferences").select("id").eq("client_id", clientId).single();

    if (existing) {
      const { error } = await sb.from("client_preferences").update(prefs).eq("client_id", clientId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("client_preferences").insert({ client_id: clientId, ...prefs });
      if (error) {
        console.log("[settings] Preferences table may not exist, returning defaults");
      }
    }

    res.json({ status: "ok" });
  } catch (err: any) {
    res.json({ status: "ok" });
  }
});
