import { supabase } from "../config/supabase";
import { callLLM } from "../llm/adapter";
import { anomalyDetector, type AnomalyEvent } from "./anomalyDetector";

/**
 * Represents a morning brief snapshot
 */
export interface MorningBriefSnapshot {
  queueDepth: number;
  slaBreachRate: number;
  claimsReceivedToday: number;
  claimsReceivedYesterday: number;
  topAnomalies: AnomalyEvent[];
  topSlaRisks: Array<{
    claimId: string;
    claimNumber: string;
    daysRemaining: number;
    priority: string;
  }>;
  generatedAt: Date;
}

/**
 * Represents a generated morning brief
 */
export interface MorningBrief {
  briefDate: string;
  content: string;
  metricsSnapshot: MorningBriefSnapshot;
  anomalyCount: number;
  generatedAt: Date;
}

export class MorningBriefGenerator {
  async generateMorningBrief(clientId: string, userId: string, options?: { forceRefresh?: boolean }): Promise<MorningBrief> {
    try {
      const today = new Date().toISOString().split("T")[0];

      if (options?.forceRefresh) {
        await supabase
          .from("morning_briefs")
          .delete()
          .eq("client_id", clientId)
          .eq("user_id", userId)
          .eq("brief_date", today);
      }

      const { data: existingBrief } = await supabase
        .from("morning_briefs")
        .select("*")
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .eq("brief_date", today)
        .single();

      if (existingBrief && !options?.forceRefresh) {
        return {
          briefDate: existingBrief.brief_date,
          content: existingBrief.content,
          metricsSnapshot: existingBrief.metrics_snapshot as MorningBriefSnapshot,
          anomalyCount: existingBrief.anomaly_count,
          generatedAt: new Date(existingBrief.generated_at),
        };
      }

      const metricsSnapshot = await this.gatherMetricsSnapshot(clientId);
      const briefContent = await this.generateBriefContent(clientId, metricsSnapshot);

      const { data: insertedBrief, error } = await supabase
        .from("morning_briefs")
        .upsert(
          {
            client_id: clientId,
            user_id: userId,
            brief_date: today,
            content: briefContent,
            metrics_snapshot: metricsSnapshot,
            anomaly_count: metricsSnapshot.topAnomalies.length,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,user_id,brief_date" }
        )
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store morning brief: ${error.message}`);
      }

      return {
        briefDate: insertedBrief.brief_date,
        content: briefContent,
        metricsSnapshot,
        anomalyCount: metricsSnapshot.topAnomalies.length,
        generatedAt: new Date(insertedBrief.generated_at),
      };
    } catch (error) {
      console.error("Failed to generate morning brief:", error);
      throw error;
    }
  }

  private async gatherMetricsSnapshot(clientId: string): Promise<MorningBriefSnapshot> {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;
    const yesterdayStart = `${yesterday}T00:00:00`;
    const yesterdayEnd = `${yesterday}T23:59:59`;

    const { data: openClaims } = await supabase
      .from("claims")
      .select("id")
      .eq("client_id", clientId)
      .not("status", "in", "(closed,denied)");

    const queueDepth = openClaims?.length || 0;

    const { data: slaData } = await supabase
      .from("claims")
      .select("id, sla_breached")
      .eq("client_id", clientId)
      .gte("fnol_date", thirtyDaysAgo);
    const total = slaData?.length || 0;
    const breached = slaData?.filter((c) => c.sla_breached)?.length || 0;
    const slaBreachRate = total > 0 ? breached / total : 0;

    const { data: claimsToday } = await supabase
      .from("claims")
      .select("id")
      .eq("client_id", clientId)
      .gte("fnol_date", todayStart)
      .lte("fnol_date", todayEnd);
    const claimsReceivedToday = claimsToday?.length || 0;

    const { data: claimsYesterday } = await supabase
      .from("claims")
      .select("id")
      .eq("client_id", clientId)
      .gte("fnol_date", yesterdayStart)
      .lte("fnol_date", yesterdayEnd);
    const claimsReceivedYesterday = claimsYesterday?.length || 0;

    const topAnomalies = await anomalyDetector.detectAnomalies(clientId, {
      lookbackDays: 30,
      threshold: 1.5,
    });

    const { data: slaRisks } = await supabase
      .from("claims")
      .select("id, claim_number, severity, sla_target_days, fnol_date")
      .eq("client_id", clientId)
      .not("status", "in", "(closed,denied)")
      .order("fnol_date", { ascending: true })
      .limit(5);

    const topSlaRisks = (slaRisks || []).map((claim) => {
      const fnolDate = new Date(claim.fnol_date);
      const now = new Date();
      const daysElapsed = Math.floor((now.getTime() - fnolDate.getTime()) / 86400000);
      const slaDays = claim.sla_target_days || 30;
      const daysRemaining = Math.max(0, slaDays - daysElapsed);
      return {
        claimId: claim.id,
        claimNumber: claim.claim_number,
        daysRemaining,
        priority: claim.severity || "normal",
      };
    });

    return {
      queueDepth,
      slaBreachRate,
      claimsReceivedToday,
      claimsReceivedYesterday,
      topAnomalies,
      topSlaRisks,
      generatedAt: new Date(),
    };
  }

  private async generateBriefContent(
    clientId: string,
    snapshot: MorningBriefSnapshot
  ): Promise<string> {
    const systemPrompt = `You are an operations intelligence assistant for a claims processing system.
Generate a concise, actionable morning briefing (3-5 paragraphs) based on the provided metrics.
Focus on: Key performance indicators, anomalies requiring attention, SLA risks, recommended actions.
Keep the tone professional but conversational. Prioritize items by business impact.`;

    const userMessage = `
Claims Operations Snapshot:
- Queue Depth: ${snapshot.queueDepth} open claims
- SLA Breach Rate: ${(snapshot.slaBreachRate * 100).toFixed(1)}%
- Claims Received Today: ${snapshot.claimsReceivedToday} (vs ${snapshot.claimsReceivedYesterday} yesterday)
- Anomalies Detected: ${snapshot.topAnomalies.length}
${snapshot.topAnomalies
  .slice(0, 3)
  .map(
    (a) =>
      `  * ${a.metricSlug}: ${a.direction === "up" ? "↑" : "↓"} ${a.zScore.toFixed(2)}σ (${a.severity})`
  )
  .join("\n")}
- Top SLA Risks:
${snapshot.topSlaRisks
  .slice(0, 3)
  .map(
    (r) =>
      `  * Claim ${r.claimNumber}: ${r.daysRemaining} days remaining (Priority: ${r.priority})`
  )
  .join("\n")}

Generate a morning briefing based on this snapshot.`;

    try {
      const result = await callLLM(systemPrompt, userMessage);
      return result.content;
    } catch (error) {
      console.error("Failed to generate brief content via LLM:", error);
      return `Operations snapshot for ${new Date().toLocaleDateString()}: Queue depth ${snapshot.queueDepth}, SLA breach rate ${(snapshot.slaBreachRate * 100).toFixed(1)}%, ${snapshot.claimsReceivedToday} claims received today. ${snapshot.topAnomalies.length} anomalies detected.`;
    }
  }
}

export const morningBriefGenerator = new MorningBriefGenerator();
