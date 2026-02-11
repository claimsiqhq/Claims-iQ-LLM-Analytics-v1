import type { ParsedIntent } from "../llm/intentParser";

/**
 * Parses comparison offset (e.g. "-1_month", "-1_quarter") and returns
 * { start, end } for the comparison period.
 */
export function getComparisonDateRange(
  currentStart: string,
  currentEnd: string,
  offset: string
): { start: string; end: string } {
  const startDate = new Date(currentStart + "T00:00:00Z");
  const endDate = new Date(currentEnd + "T23:59:59Z");
  const durationMs = endDate.getTime() - startDate.getTime();

  const match = offset.match(/^(-?\d+)_(month|quarter|year|day|week)$/i);
  if (!match) {
    const days = 30;
    return {
      start: new Date(startDate.getTime() - days * 86400000).toISOString().split("T")[0],
      end: new Date(endDate.getTime() - days * 86400000).toISOString().split("T")[0],
    };
  }

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const abs = Math.abs(num);
  const sign = num < 0 ? -1 : 1;

  let offsetMs = 0;
  if (unit === "day") offsetMs = abs * 86400000;
  else if (unit === "week") offsetMs = abs * 7 * 86400000;
  else if (unit === "month") offsetMs = abs * 30 * 86400000;
  else if (unit === "quarter") offsetMs = abs * 90 * 86400000;
  else if (unit === "year") offsetMs = abs * 365 * 86400000;

  const compStart = new Date(startDate.getTime() + sign * offsetMs);
  const compEnd = new Date(endDate.getTime() + sign * offsetMs);

  return {
    start: compStart.toISOString().split("T")[0],
    end: compEnd.toISOString().split("T")[0],
  };
}

export function aggregateRawData(rawData: any[]): number {
  if (!rawData || rawData.length === 0) return 0;
  const values = rawData.map((r) => parseFloat(r.value));
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function createComparisonIntent(
  base: ParsedIntent,
  compStart: string,
  compEnd: string
): ParsedIntent {
  return {
    ...base,
    time_range: {
      ...base.time_range,
      start: compStart,
      end: compEnd,
    },
  };
}
