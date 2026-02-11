import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X, Reload } from 'iconoir-react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface BriefMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
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
    // Refetch on client change
  }, [clientId]);

  const fetchMorningBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/morning-brief?clientId=${clientId}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setBriefData(data);
      setIsDismissed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load morning brief');
      console.error('Morning brief error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (isDismissed || !briefData) {
    return null;
  }

  // Truncate content to 2 lines when collapsed
  const contentPreview = briefData.content
    .split('\n')
    .slice(0, 2)
    .join('\n');

  const getTrendColor = (trend?: string): string => {
    switch (trend) {
      case 'up':
        return 'text-red-600';
      case 'down':
        return 'text-green-600';
      case 'neutral':
      default:
        return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend?: string): string => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'neutral':
      default:
        return '→';
    }
  };

  return (
    <Card className="border-l-4 border-brand-gold bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Morning Brief</h3>
            {briefData.anomalies > 0 && (
              <Badge className="bg-brand-gold text-brand-deep-purple">
                {briefData.anomalies} anomalies
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary">
            {new Date(briefData.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchMorningBrief}
            disabled={loading}
            className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            aria-label="Refresh brief"
            title="Refresh brief"
          >
            <Reload
              width={18}
              height={18}
              className={`text-gray-600 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Dismiss brief"
            title="Dismiss brief"
          >
            <X width={18} height={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        <div className={`transition-all duration-300 ${
          isExpanded ? 'max-h-96' : 'max-h-12 overflow-hidden'
        }`}>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {isExpanded ? briefData.content : contentPreview}
          </p>
        </div>

        {/* Expand/Collapse Toggle */}
        {briefData.content.split('\n').length > 2 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-sm font-medium text-brand-purple hover:text-brand-deep-purple transition-colors flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp width={16} height={16} />
              </>
            ) : (
              <>
                Show more <ChevronDown width={16} height={16} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Metrics Snapshot */}
      {briefData.metrics.length > 0 && (
        <div className="px-6 py-4 bg-surface-off-white border-t border-gray-100">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Key Metrics
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {briefData.metrics.map((metric, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-text-secondary font-medium">
                  {metric.label}
                </p>
                <div className="flex items-baseline gap-2 mt-2">
                  <p className="text-lg font-bold text-gray-900">
                    {metric.value}
                  </p>
                  {metric.unit && (
                    <p className="text-xs text-gray-500">{metric.unit}</p>
                  )}
                </div>
                {metric.trend && (
                  <p className={`text-xs mt-1 ${getTrendColor(metric.trend)}`}>
                    <span>{getTrendIcon(metric.trend)}</span>{' '}
                    {metric.trend === 'up'
                      ? 'Increasing'
                      : metric.trend === 'down'
                        ? 'Decreasing'
                        : 'Stable'}
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
