import { llmComplete, type LLMResponse } from "./adapter";

const INSIGHT_SYSTEM_PROMPT = `You are an analytics insight generator for Claims IQ Analytics, a claims intelligence dashboard used by Claims Managers.

Given chart data and the user's original question, generate a concise, actionable insight paragraph (2-4 sentences).

## Guidelines
1. Lead with the most notable finding (outlier, trend, anomaly)
2. Compare values to averages or benchmarks when possible
3. Use specific numbers and percentages
4. Suggest a potential action or next investigation step
5. Write in a professional but approachable tone
6. Do NOT use markdown formatting — output plain text only
7. Keep it under 100 words`;

export async function generateInsight(
  userMessage: string,
  chartData: any,
  chartType: string,
  metricName: string
): Promise<{ insight: string; llmResponse: LLMResponse }> {
  const userPrompt = `## User's Question
${userMessage}

## Metric
${metricName}

## Chart Type
${chartType}

## Chart Data
${JSON.stringify(chartData, null, 2)}

Generate a concise insight paragraph.`;

  const llmResponse = await llmComplete(INSIGHT_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 512,
    temperature: 0.4,
  });

  return { insight: llmResponse.content.trim(), llmResponse };
}

const FOLLOW_UP_SYSTEM_PROMPT = `You are an analytics assistant for Claims IQ Analytics.
Given the user's question and the metric/chart they just viewed, suggest 2-3 follow-up questions they might ask next.
Output ONLY a JSON array of strings, e.g. ["Question 1?", "Question 2?", "Question 3?"].
Keep each question under 15 words. Be specific to claims analytics (SLAs, cycle time, severity, adjusters, etc.).`;

export async function generateFollowUpSuggestions(
  userMessage: string,
  metricName: string,
  chartData: any
): Promise<string[]> {
  try {
    const prompt = `User asked: "${userMessage}"
Metric viewed: ${metricName}

Suggest 2-3 follow-up questions (JSON array of strings only):`;
    const response = await llmComplete(FOLLOW_UP_SYSTEM_PROMPT, prompt, {
      maxTokens: 256,
      temperature: 0.5,
    });
    const content = response.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as string[];
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    }
    return [];
  } catch {
    return [];
  }
}
