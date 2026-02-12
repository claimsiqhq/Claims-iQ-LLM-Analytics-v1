import React, { useEffect, useState } from "react";
import { NavArrowDown, NavArrowUp, X, Refresh } from "iconoir-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";

interface BriefMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
}

interface MorningBriefData {
  date: string;
  content: string;
  metrics: BriefMetric[];
  anomalies: number;
}

interface MorningBriefProps {
  clientId: string;
}

export const MorningBrief: React.FC<MorningBriefProps> = ({ clientId }) => {
  const [briefData, setBriefData] = useState<MorningBriefData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    fetchMorningBrief();
  }, [clientId]);

  const fetchMorningBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/morning-brief?client_id=${clientId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = json.data || json;
      setBriefData({
        date: data.date || data.briefDate || "",
        content: data.content || "",
        metrics: data.metrics || [],
        anomalies: data.anomalies ?? 0,
      });
      setIsDismissed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load morning brief");
      console.error("Morning brief error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (isDismissed || !briefData) return null;

  const contentPreview = briefData.content.split("\n").slice(0, 3).join("\n");

  const getTrendColor = (trend?: string): string => {
    switch (trend) {
      case "up": return "text-red-600";
      case "down": return "text-green-600";
      default: return "text-gray-600";
    }
  };

  const getTrendIcon = (trend?: string): string => {
    switch (trend) {
      case "up": return "↑";
      case "down": return "↓";
      default: return "→";
    }
  };

  return (
    <Card className="border-l-4 border-brand-gold bg-white dark:bg-gray-800 rounded-xl shadow-sm dark:shadow-gray-900/30 mb-6 overflow-hidden">
      <div className="flex items-start justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid="text-morning-brief-title">Morning Brief</h3>
            {briefData.anomalies > 0 && (
              <Badge className="bg-brand-gold text-brand-deep-purple">
                {briefData.anomalies} anomalies
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary">
            {new Date(briefData.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchMorningBrief}
            disabled={loading}
            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-label="Refresh brief"
            data-testid="button-refresh-brief"
          >
            <Refresh width={18} height={18} className={`text-gray-600 dark:text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Dismiss brief"
            data-testid="button-dismiss-brief"
          >
            <X width={18} height={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 md:py-4">
        <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? "max-h-[2000px]" : "max-h-24"}`}>
          <div className="brief-content prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h3 className="text-base font-bold text-brand-deep-purple mt-4 mb-2 first:mt-0 font-display">{children}</h3>
                ),
                h2: ({ children }) => (
                  <h4 className="text-sm font-bold text-brand-deep-purple mt-4 mb-1.5 first:mt-0 font-display">{children}</h4>
                ),
                h3: ({ children }) => (
                  <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1 first:mt-0 font-display">{children}</h5>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3 last:mb-0">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-brand-deep-purple">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 mb-3 ml-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 mb-3 ml-1 list-decimal list-inside">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="text-brand-gold mt-1 shrink-0">●</span>
                    <span>{children}</span>
                  </li>
                ),
                em: ({ children }) => (
                  <em className="text-gray-500 dark:text-gray-400 not-italic text-xs">{children}</em>
                ),
                hr: () => (
                  <hr className="my-3 border-gray-200 dark:border-gray-700" />
                ),
              }}
            >
              {isExpanded ? briefData.content : contentPreview}
            </ReactMarkdown>
          </div>
        </div>

        {briefData.content.split("\n").length > 3 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-sm font-medium text-brand-purple hover:text-brand-deep-purple transition-colors flex items-center gap-1"
            data-testid="button-toggle-brief"
          >
            {isExpanded ? <>Show less <NavArrowUp width={16} height={16} /></> : <>Show more <NavArrowDown width={16} height={16} /></>}
          </button>
        )}
      </div>

      {briefData.metrics.length > 0 && (
        <div className="px-4 md:px-6 py-3 md:py-4 bg-surface-off-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 text-center">Key Metrics</p>
          <div className="flex flex-wrap justify-center gap-3">
            {briefData.metrics.map((metric, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600" data-testid={`card-metric-${idx}`}>
                <p className="text-xs text-text-secondary font-medium">{metric.label}</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">{metric.value}</p>
                  {metric.unit && <p className="text-xs text-gray-500 dark:text-gray-400">{metric.unit}</p>}
                </div>
                {metric.trend && (
                  <p className={`text-xs mt-1 ${getTrendColor(metric.trend)}`}>
                    <span>{getTrendIcon(metric.trend)}</span>{" "}
                    {metric.trend === "up" ? "Increasing" : metric.trend === "down" ? "Decreasing" : "Stable"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
