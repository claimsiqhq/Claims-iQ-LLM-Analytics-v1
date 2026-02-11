import { llmComplete, type LLMResponse } from "./adapter";
import type { MetricDefinition } from "../engine/metricRegistry";

export interface ParsedIntent {
  intent_type: "query" | "refine" | "drill_down" | "compare" | "new_topic";
  metric: {
    slug: string;
    display_name: string;
  };
  dimensions: string[];
  filters: Array<{
    field: string;
    operator: string;
    value: string | string[] | number;
  }>;
  time_range: {
    type: "relative" | "absolute";
    value: string;
    start: string;
    end: string;
  };
  comparison: {
    type: string;
    offset: string;
  } | null;
  chart_type: string;
  sort: { field: string; direction: "asc" | "desc" } | null;
  limit: number | null;
  assumptions: Array<{
    key: string;
    assumed_value: string;
    label: string;
  }>;
  confidence: number;
}

function buildIntentSystemPrompt(metrics: MetricDefinition[]): string {
  const metricList = metrics
    .map(
      (m) =>
        `- ${m.slug} (${m.display_name}): ${m.description}. Category: ${m.category}. Dimensions: [${m.allowed_dimensions.join(", ")}]. Chart: ${m.default_chart_type}. Unit: ${m.unit}`
    )
    .join("\n");

  return `You are an intent parser for Claims IQ Analytics, a claims intelligence dashboard.
Your job is to translate natural language questions from Claims Managers into a structured JSON intent specification.

You MUST output ONLY valid JSON. No markdown, no explanation, no extra text.

## Available Metrics
${metricList}

## Available Filter Fields
- peril: "Water Damage", "Fire", "Theft", "Wind/Hail", "Liability"
- severity: "low", "medium", "high", "critical"
- region: "Southeast", "Northeast", "Midwest", "West"
- status: "open", "in_progress", "review", "closed", "reopened"
- current_stage: "fnol", "investigation", "evaluation", "negotiation", "settlement", "closed"
- sla_breached: true, false

## Available Operators
eq, neq, gt, gte, lt, lte, in, not_in, between

## Chart Types
line, bar, stacked_bar, area, pie, table

## Time Range Values
last_7_days, last_14_days, last_30_days, last_60_days, last_90_days, last_6_months, last_12_months, this_month, this_quarter, this_year, ytd, all_time

## Intent Types
- query: New standalone question. Start fresh.
- refine: Modifies the current analysis (add dimension, change time range, swap chart type). Merge into existing context.
- drill_down: User wants individual records behind an aggregate.
- compare: Add a comparison range or series.
- new_topic: Question is unrelated to current thread context.

## Output Schema
{
  "intent_type": "query | refine | drill_down | compare | new_topic",
  "metric": { "slug": "...", "display_name": "..." },
  "dimensions": ["..."],
  "filters": [{ "field": "...", "operator": "...", "value": "..." }],
  "time_range": { "type": "relative|absolute", "value": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "comparison": null,
  "chart_type": "...",
  "sort": { "field": "value", "direction": "desc" } | null,
  "limit": null,
  "assumptions": [{ "key": "...", "assumed_value": "...", "label": "..." }],
  "confidence": 0.0-1.0
}

## Rules
1. Always pick the most relevant metric from the available list
2. If the user doesn't specify a time range, default to last_30_days and note it in assumptions
3. If the user doesn't specify a chart type, use the metric's default chart type
4. Compute actual ISO dates for start/end based on today's date
5. If the question is ambiguous, pick the most likely interpretation and note assumptions
6. Today's date is ${new Date().toISOString().split("T")[0]}`;
}

export async function parseIntent(
  userMessage: string,
  metrics: MetricDefinition[],
  threadContext: any | null
): Promise<{ intent: ParsedIntent; llmResponse: LLMResponse }> {
  const systemPrompt = buildIntentSystemPrompt(metrics);

  let fullMessage = userMessage;
  if (threadContext) {
    fullMessage = `## Current Thread Context\n${JSON.stringify(threadContext)}\n\n## New User Message\n${userMessage}`;
  }

  const llmResponse = await llmComplete(systemPrompt, fullMessage, {
    temperature: 0.2,
  });

  let content = llmResponse.content.trim();
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }

  const intent: ParsedIntent = JSON.parse(content);
  return { intent, llmResponse };
}
