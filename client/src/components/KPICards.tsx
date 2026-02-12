import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface KPIMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  delta?: number;
}

interface KPICardsProps {
  clientId: string;
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

export const KPICards: React.FC<KPICardsProps> = ({ clientId }) => {
  const [kpis, setKpis] = useState<KPIMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKpis = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/kpis?client_id=${clientId}`);
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
  }, [clientId]);

  if (loading || kpis.length === 0) return null;

  return (
    <div data-tour="kpi-strip" className="flex gap-2 md:gap-3 mb-4 md:mb-6 overflow-x-auto pb-1 md:pb-0 md:flex-wrap md:justify-center scrollbar-thin">
      {kpis.map((kpi, idx) => (
        <Card
          key={idx}
          className="px-2.5 md:px-3 py-2 md:py-2.5 min-w-[100px] md:min-w-[120px] border border-surface-grey-lavender dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/30 shrink-0"
          data-testid={`kpi-card-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
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
  );
};
