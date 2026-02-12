import type { ParsedIntent } from "../llm/intentParser";

/**
 * Parses comparison offset and returns { start, end } for the comparison period.
 * Supports semantic offsets from intent parser (e.g. "previous_period", "prior_month", "prior_year")
 * as well as numeric offsets (e.g. "-1_month", "-1_quarter").
 */
export function getComparisonDateRange(
  currentStart: string,
  currentEnd: string,
  offset: string
): { start: string; end: string } {
  const startDate = new Date(currentStart + "T00:00:00Z");
  const endDate = new Date(currentEnd + "T23:59:59Z");
  const durationMs = endDate.getTime() - startDate.getTime();

  const semanticOffsets: Record<string, number> = {
    previous_period: durationMs,
    prior_month: 30 * 86400000,
    prior_year: 365 * 86400000,
  };

  if (offset in semanticOffsets) {
    const shiftMs = semanticOffsets[offset];
    return {
      start: new Date(startDate.getTime() - shiftMs).toISOString().split("T")[0],
      end: new Date(endDate.getTime() - shiftMs).toISOString().split("T")[0],
    };
  }

  const match = offset.match(/^(-?\d+)_(month|quarter|year|day|week)$/i);
  if (!match) {
    return {
      start: new Date(startDate.getTime() - durationMs).toISOString().split("T")[0],
      end: new Date(endDate.getTime() - durationMs).toISOString().split("T")[0],
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

export function getComparisonLabel(
  offset: string,
  currentStart: string,
  currentEnd: string
): string {
  const startDate = new Date(currentStart + "T00:00:00Z");
  const endDate = new Date(currentEnd + "T23:59:59Z");
  const durationDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);

  if (offset === "prior_month") return "Prior Month";
  if (offset === "prior_year") return "Prior Year";
  if (offset === "previous_period") return `Previous ${durationDays} Days`;

  const match = offset.match(/^(-?\d+)_(month|quarter|year|day|week)$/i);
  if (match) {
    const abs = Math.abs(parseInt(match[1], 10));
    const unit = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
    return `${abs} ${unit}${abs > 1 ? "s" : ""} Prior`;
  }

  return `Previous ${durationDays} Days`;
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
