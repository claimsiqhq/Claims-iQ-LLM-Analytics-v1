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
