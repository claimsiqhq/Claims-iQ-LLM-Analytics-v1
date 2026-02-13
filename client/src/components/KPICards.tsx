import React, { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface KPIMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  delta?: number;
}

const DRILL_DOWN_QUESTIONS: Record<string, string> = {
  "Queue Depth": "Queue depth by region",
  "SLA Breach Rate": "SLA breach rate by adjuster",
  "Claims This Week": "Claims received this week by region",
  "Closed This Week": "Claims closed this week by adjuster",
};

interface KPICardsProps {
  clientId: string;
  onDrillDown?: (question: string) => void;
}

function getTrendColor(label: string, trend: "up" | "down" | "neutral"): string {
  if (trend === "neutral") return "text-text-secondary";
  if (label === "Claims This Week") return "text-text-secondary";
  if (label === "Queue Depth" || label === "SLA Breach Rate") {
    return trend === "up" ? "text-red-500" : "text-green-600";
  }
  if (label === "Closed This Week") {
    return trend === "up" ? "text-green-600" : "text-red-500";
  }
  return "text-text-secondary";
}

const DATE_PRESETS: { value: string; label: string; getRange: () => { start: string; end: string } }[] = [
  {
    value: "week",
    label: "This week vs last week",
    getRange: () => {
      const now = new Date();
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    },
  },
  {
    value: "month",
    label: "This month vs last month",
    getRange: () => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    },
  },
  {
    value: "7d",
    label: "Last 7 days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    },
  },
  {
    value: "30d",
    label: "Last 30 days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    },
  },
];

export const KPICards: React.FC<KPICardsProps> = ({ clientId, onDrillDown }) => {
  const [kpis, setKpis] = useState<KPIMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState("week");

  const dateRange = useMemo(() => {
    const preset = DATE_PRESETS.find((p) => p.value === datePreset);
    return preset?.getRange() ?? DATE_PRESETS[0].getRange();
  }, [datePreset]);

  useEffect(() => {
    const fetchKpis = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ client_id: clientId, start_date: dateRange.start, end_date: dateRange.end });
        const res = await fetch(`/api/kpis?${params}`);
        const json = await res.json();
        if (json.data) setKpis(json.data);
      } catch {
        setKpis([]);
      } finally {
        setLoading(false);
      }
    };
    fetchKpis();
    const interval = setInterval(fetchKpis, 60000);
    return () => clearInterval(interval);
  }, [clientId, dateRange.start, dateRange.end]);

  if (loading || kpis.length === 0) return null;

  return (
    <div className="space-y-3 mb-4 md:mb-6">
      <div className="flex items-center justify-between gap-2">
        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="w-[200px] h-9 text-sm" data-testid="select-kpi-date-range">
            <Calendar className="w-4 h-4 mr-2 text-brand-purple" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div data-tour="kpi-strip" className="flex gap-2 md:gap-3 overflow-x-auto pb-1 md:pb-0 md:flex-wrap md:justify-center scrollbar-thin">
      {kpis.map((kpi, idx) => (
        <Card
          key={idx}
          className={`px-2.5 md:px-3 py-2 md:py-2.5 min-w-[100px] md:min-w-[120px] border border-surface-grey-lavender dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/30 shrink-0 ${onDrillDown ? "cursor-pointer hover:ring-2 hover:ring-brand-purple/30 transition-all" : ""}`}
          data-testid={`kpi-card-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
          onClick={() => onDrillDown?.(DRILL_DOWN_QUESTIONS[kpi.label] || kpi.label)}
          role={onDrillDown ? "button" : undefined}
          tabIndex={onDrillDown ? 0 : undefined}
          onKeyDown={onDrillDown ? (e) => e.key === "Enter" && onDrillDown(DRILL_DOWN_QUESTIONS[kpi.label] || kpi.label) : undefined}
        >
          <p className="text-[10px] md:text-xs text-text-secondary dark:text-gray-400 font-medium leading-tight truncate">{kpi.label}</p>
          <p className="text-base md:text-lg font-bold text-brand-deep-purple dark:text-gray-100 font-mono mt-0.5">
            {kpi.value}
            {kpi.unit && kpi.unit !== "%" && (
              <span className="text-xs font-normal text-text-secondary ml-0.5">{kpi.unit}</span>
            )}
          </p>
          {kpi.trend && kpi.trend !== "neutral" && kpi.delta !== undefined && (
            <p className={`text-[10px] md:text-xs font-medium mt-0.5 ${getTrendColor(kpi.label, kpi.trend)}`} data-testid={`kpi-trend-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
              {kpi.trend === "up" ? "▲" : "▼"} {kpi.delta}%
            </p>
          )}
        </Card>
      ))}
      </div>
    </div>
  );
};
