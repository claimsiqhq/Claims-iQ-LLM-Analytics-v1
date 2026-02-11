import type { ParsedIntent } from "../llm/intentParser";

export interface ThreadContext {
  metric: { slug: string; display_name: string } | null;
  dimensions: string[];
  filters: Array<{ field: string; operator: string; value: any }>;
  time_range: ParsedIntent["time_range"] | null;
  comparison: ParsedIntent["comparison"];
  chart_type: string | null;
  sort: ParsedIntent["sort"];
  history: Array<{
    turn_index: number;
    intent_type: string;
    metric_slug: string;
    user_message: string;
  }>;
}

export function createEmptyContext(): ThreadContext {
  return {
    metric: null,
    dimensions: [],
    filters: [],
    time_range: null,
    comparison: null,
    chart_type: null,
    sort: null,
    history: [],
  };
}

export function mergeContext(
  current: ThreadContext,
  intent: ParsedIntent,
  turnIndex: number,
  userMessage: string
): ThreadContext {
  const merged = { ...current };

  switch (intent.intent_type) {
    case "query":
    case "new_topic":
      merged.metric = intent.metric;
      merged.dimensions = intent.dimensions || [];
      merged.filters = intent.filters || [];
      merged.time_range = intent.time_range;
      merged.comparison = intent.comparison;
      merged.chart_type = intent.chart_type;
      merged.sort = intent.sort;
      break;

    case "refine":
      if (intent.metric?.slug) merged.metric = intent.metric;
      if (intent.dimensions?.length) merged.dimensions = intent.dimensions;
      if (intent.filters?.length) {
        for (const newFilter of intent.filters) {
          const idx = merged.filters.findIndex(
            (f) => f.field === newFilter.field
          );
          if (idx >= 0) {
            merged.filters[idx] = newFilter;
          } else {
            merged.filters.push(newFilter);
          }
        }
      }
      if (intent.time_range) merged.time_range = intent.time_range;
      if (intent.chart_type) merged.chart_type = intent.chart_type;
      if (intent.sort) merged.sort = intent.sort;
      break;

    case "compare":
      merged.comparison = intent.comparison;
      if (intent.time_range) merged.time_range = intent.time_range;
      break;

    case "drill_down":
      break;
  }

  merged.history = [
    ...current.history,
    {
      turn_index: turnIndex,
      intent_type: intent.intent_type,
      metric_slug: intent.metric?.slug || current.metric?.slug || "",
      user_message: userMessage,
    },
  ];

  return merged;
}
