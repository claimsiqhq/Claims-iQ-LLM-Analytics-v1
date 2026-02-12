import React, { useEffect, useState, useCallback } from "react";
import { InfoCircle } from "iconoir-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Anomaly {
  id: string;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: "critical" | "warning" | "info";
  timestamp: string;
  description: string;
}

interface AnomalyBadgesProps {
  clientId: string;
}

const REFRESH_INTERVAL = 5 * 60 * 1000;

const getSeverityStyles = (severity: string) => {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
    warning: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
    info: { bg: "bg-brand-purple/10", text: "text-brand-purple", border: "border-brand-purple/20" },
  };
  return styles[severity] || styles.info;
};

const getDirectionIcon = (deviation: number) => (deviation > 0 ? "↑" : deviation < 0 ? "↓" : "→");

export const AnomalyBadges: React.FC<AnomalyBadgesProps> = ({ clientId }) => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/anomalies?client_id=${clientId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = json.data || json;
      const list = Array.isArray(data) ? data : (data.anomalies || []);
      setAnomalies(list.map((a: any) => ({
        id: a.id || a.metricSlug,
        metric: a.metricSlug || a.metric || "",
        value: a.currentValue ?? a.value ?? 0,
        expectedValue: a.baselineMean ?? a.expectedValue ?? 0,
        deviation: (a.currentValue ?? a.value ?? 0) - (a.baselineMean ?? a.expectedValue ?? 0),
        severity: a.severity || "info",
        timestamp: a.detectedAt || a.timestamp || new Date().toISOString(),
        description: a.description || `${a.metricSlug || a.metric}: ${a.direction || ""} ${a.zScore ?? ""}σ`,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch anomalies");
      console.error("Anomaly fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAnomalies(); }, [clientId, fetchAnomalies]);
  useEffect(() => { const id = setInterval(fetchAnomalies, REFRESH_INTERVAL); return () => clearInterval(id); }, [fetchAnomalies]);

  if (error || anomalies.length === 0) return null;

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;

  const AnomalyPopoverContent = ({ items, title }: { items: Anomaly[]; title: string }) => (
    <div className="divide-y divide-gray-200">
      <div className="px-4 py-3 bg-gray-50">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{items.length} detected</p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {items.map((a) => {
          const styles = getSeverityStyles(a.severity);
          return (
            <div key={a.id} className="px-4 py-3 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-gray-900 flex-1">{a.metric}</p>
                <span className={`text-lg font-bold ${a.deviation > 0 ? "text-red-600" : "text-green-600"}`}>
                  {getDirectionIcon(a.deviation)}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-2">{a.description}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">Current: {a.value} | Expected: {a.expectedValue}</p>
                <Badge className={`${styles.bg} ${styles.text} border ${styles.border}`}>{a.severity}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="hidden md:flex items-center gap-2">
      {criticalCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button>
              <Badge className="bg-red-100 text-red-800 border border-red-300 font-semibold animate-pulse cursor-pointer">
                {criticalCount} Critical
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <AnomalyPopoverContent items={anomalies.filter((a) => a.severity === "critical")} title="Critical Anomalies" />
          </PopoverContent>
        </Popover>
      )}
      {warningCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button>
              <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 font-semibold cursor-pointer">
                {warningCount} Warnings
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <AnomalyPopoverContent items={anomalies.filter((a) => a.severity === "warning")} title="Warning Anomalies" />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
