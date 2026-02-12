import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface KPIMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
}

interface KPICardsProps {
  clientId: string;
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
    <div className="flex gap-3 mb-6 flex-wrap justify-center">
      {kpis.map((kpi, idx) => (
        <Card
          key={idx}
          className="px-4 py-3 min-w-[140px] border border-surface-grey-lavender bg-white shadow-sm"
          data-testid={`kpi-card-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <p className="text-xs text-text-secondary font-medium">{kpi.label}</p>
          <p className="text-xl font-bold text-brand-deep-purple font-mono mt-1">
            {kpi.value}
            {kpi.unit && kpi.unit !== "%" && (
              <span className="text-sm font-normal text-text-secondary ml-1">{kpi.unit}</span>
            )}
          </p>
        </Card>
      ))}
    </div>
  );
};
