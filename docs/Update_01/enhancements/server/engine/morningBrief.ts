import { supabase } from '../config/supabase.js';
import { callLLM } from '../llm/adapter.js';
import { anomalyDetector, type AnomalyEvent } from './anomalyDetector.js';

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

/**
 * Morning intelligence brief generator
 *
 * Analyzes key metrics and anomalies, then uses an LLM to generate
 * a concise, actionable morning summary for operations teams.
 */
export class MorningBriefGenerator {
  /**
   * Generates or retrieves a morning brief for a client and user
   * @param clientId - The client ID
   * @param userId - The user ID requesting the brief
   * @returns Generated or cached morning brief
   */
  async generateMorningBrief(clientId: string, userId: string): Promise<MorningBrief> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Check if a brief already exists for today
      const { data: existingBrief } = await supabase
        .from('morning_briefs')
        .select('*')
        .eq('client_id', clientId)
        .eq('brief_date', today)
        .single();

      if (existingBrief) {
        // Return cached brief
        return {
          briefDate: existingBrief.brief_date,
          content: existingBrief.content,
          metricsSnapshot: existingBrief.metrics_snapshot,
          anomalyCount: existingBrief.anomaly_count,
          generatedAt: new Date(existingBrief.generated_at),
        };
      }

      // Gather metrics snapshot
      const metricsSnapshot = await this.gatherMetricsSnapshot(clientId);

      // Generate brief content using LLM
      const briefContent = await this.generateBriefContent(clientId, metricsSnapshot);

      // Store brief in database
      const { data: insertedBrief, error } = await supabase
        .from('morning_briefs')
        .insert([
          {
            client_id: clientId,
            user_id: userId,
            brief_date: today,
            content: briefContent,
            metrics_snapshot: metricsSnapshot,
            anomaly_count: metricsSnapshot.topAnomalies.length,
            generated_at: new Date().toISOString(),
          },
        ])
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
      console.error('Failed to generate morning brief:', error);
      throw error;
    }
  }

  /**
   * Gathers key metrics for the morning brief
   */
  private async gatherMetricsSnapshot(clientId: string): Promise<MorningBriefSnapshot> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    try {
      // Get queue depth (current open claims)
      const { data: openClaims, error: openError } = await supabase
        .from('claims')
        .select('id')
        .eq('client_id', clientId)
        .in('stage', ['fnol', 'investigation', 'evaluation', 'negotiation']);

      if (openError) throw new Error(`Queue depth query failed: ${openError.message}`);
      const queueDepth = openClaims?.length || 0;

      // Get SLA breach rate
      const { data: slaMetrics, error: slaError } = await supabase
        .from('metric_daily_values')
        .select('value')
        .eq('client_id', clientId)
        .eq('metric_slug', 'sla_breach_rate')
        .eq('date', today)
        .single();

      if (slaError && slaError.code !== 'PGRST116') {
        throw new Error(`SLA query failed: ${slaError.message}`);
      }
      const slaBreachRate = slaMetrics?.value || 0;

      // Get claims received today and yesterday
      const { data: claimsToday, error: todayError } = await supabase
        .from('claims')
        .select('id')
        .eq('client_id', clientId)
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${today}T23:59:59`);

      if (todayError) throw new Error(`Claims today query failed: ${todayError.message}`);
      const claimsReceivedToday = claimsToday?.length || 0;

      const { data: claimsYesterday, error: yesterdayError } = await supabase
        .from('claims')
        .select('id')
        .eq('client_id', clientId)
        .gte('created_at', `${yesterday}T00:00:00`)
        .lt('created_at', `${yesterday}T23:59:59`);

      if (yesterdayError) throw new Error(`Claims yesterday query failed: ${yesterdayError.message}`);
      const claimsReceivedYesterday = claimsYesterday?.length || 0;

      // Detect anomalies
      const topAnomalies = await anomalyDetector.detectAnomalies(clientId, {
        lookbackDays: 30,
        threshold: 2.0,
      });

      // Get top SLA risks (claims closest to breaching SLA)
      const { data: slaRisks, error: risksError } = await supabase
        .from('claims')
        .select(
          `
          id,
          claim_number,
          priority,
          created_at,
          sla_days
        `
        )
        .eq('client_id', clientId)
        .in('stage', ['fnol', 'investigation', 'evaluation', 'negotiation'])
        .order('created_at', { ascending: true })
        .limit(5);

      if (risksError) throw new Error(`SLA risks query failed: ${risksError.message}`);

      const topSlaRisks = (slaRisks || []).map(claim => {
        const createdAt = new Date(claim.created_at);
        const now = new Date();
        const daysElapsed = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
        const daysRemaining = Math.max(0, (claim.sla_days || 30) - daysElapsed);

        return {
          claimId: claim.id,
          claimNumber: claim.claim_number,
          daysRemaining,
          priority: claim.priority || 'normal',
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
    } catch (error) {
      console.error('Failed to gather metrics snapshot:', error);
      throw error;
    }
  }

  /**
   * Generates brief content using LLM
   */
  private async generateBriefContent(
    clientId: string,
    snapshot: MorningBriefSnapshot
  ): Promise<string> {
    const systemPrompt = `You are an operations intelligence assistant for a claims processing system.
Generate a concise, actionable morning briefing (3-5 paragraphs) based on the provided metrics.
Focus on:
- Key performance indicators and trends
- Anomalies requiring attention
- SLA risks and bottlenecks
- Recommended actions

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
      a =>
        `  * ${a.metricSlug}: ${a.direction === 'up' ? '↑' : '↓'} ${a.zScore.toFixed(2)}σ (${a.severity})`
    )
    .join('\n')}
- Top SLA Risks:
  ${snapshot.topSlaRisks
    .slice(0, 3)
    .map(r => `  * Claim ${r.claimNumber}: ${r.daysRemaining} days remaining (Priority: ${r.priority})`)
    .join('\n')}

Generate a morning briefing based on this snapshot.`;

    try {
      const result = await callLLM(systemPrompt, userMessage);
      return result.content;
    } catch (error) {
      console.error('Failed to generate brief content via LLM:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
export const morningBriefGenerator = new MorningBriefGenerator();
