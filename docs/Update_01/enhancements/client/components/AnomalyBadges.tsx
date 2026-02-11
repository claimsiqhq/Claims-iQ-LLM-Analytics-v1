import React, { useEffect, useState, useCallback } from 'react';
import { InfoCircle } from 'iconoir-react';
import { Badge } from './ui/Badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/Popover';

interface Anomaly {
  id: string;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  description: string;
}

interface AnomalyBadgesProps {
  clientId: string;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const getSeverityStyles = (
  severity: string
): { bg: string; text: string; border: string } => {
  const styles: Record<
    string,
    { bg: string; text: string; border: string }
  > = {
    critical: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
    },
    warning: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300',
    },
    info: {
      bg: 'bg-brand-purple/10',
      text: 'text-brand-purple',
      border: 'border-brand-purple/20',
    },
  };
  return styles[severity] || styles.info;
};

const getDirectionIcon = (deviation: number): string => {
  if (deviation > 0) return '↑';
  if (deviation < 0) return '↓';
  return '→';
};

export const AnomalyBadges: React.FC<AnomalyBadgesProps> = ({ clientId }) => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/anomalies?clientId=${clientId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setAnomalies(data.anomalies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch anomalies');
      console.error('Anomaly fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Initial fetch
  useEffect(() => {
    fetchAnomalies();
  }, [clientId, fetchAnomalies]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchAnomalies, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  if (error || anomalies.length === 0) {
    return null;
  }

  // Group anomalies by severity for display
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const warningCount = anomalies.filter((a) => a.severity === 'warning').length;

  return (
    <div className="flex items-center gap-2">
      {/* Critical Anomalies Badge */}
      {criticalCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="group relative inline-flex items-center gap-1">
              <Badge className="bg-red-100 text-red-800 border border-red-300 font-semibold animate-pulse cursor-pointer hover:animate-none hover:shadow-lg transition-all">
                {criticalCount} Critical
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-0"
            align="start"
          >
            <AnomalyPopoverContent
              anomalies={anomalies.filter((a) => a.severity === 'critical')}
              title="Critical Anomalies"
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Warning Anomalies Badge */}
      {warningCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="group relative inline-flex items-center gap-1">
              <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 font-semibold cursor-pointer hover:shadow-lg transition-all">
                {warningCount} Warnings
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-0"
            align="start"
          >
            <AnomalyPopoverContent
              anomalies={anomalies.filter((a) => a.severity === 'warning')}
              title="Warning Anomalies"
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Info Badge */}
      {anomalies.filter((a) => a.severity === 'info').length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative inline-flex items-center gap-1">
              <button className="p-1.5 hover:bg-surface-purple-light rounded-lg transition-colors">
                <InfoCircle
                  width={18}
                  height={18}
                  className="text-brand-purple"
                />
              </button>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-0"
            align="start"
          >
            <AnomalyPopoverContent
              anomalies={anomalies.filter((a) => a.severity === 'info')}
              title="Informational"
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

/**
 * Internal component: Popover content for displaying anomaly details
 */
interface AnomalyPopoverContentProps {
  anomalies: Anomaly[];
  title: string;
}

const AnomalyPopoverContent: React.FC<AnomalyPopoverContentProps> = ({
  anomalies,
  title,
}) => {
  return (
    <div className="divide-y divide-gray-200">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">
          {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
        </p>
      </div>

      {/* Anomalies List */}
      <div className="max-h-72 overflow-y-auto">
        {anomalies.map((anomaly) => {
          const styles = getSeverityStyles(anomaly.severity);
          return (
            <div key={anomaly.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-gray-900 flex-1">
                  {anomaly.metric}
                </p>
                <span
                  className={`text-lg font-bold ${
                    anomaly.deviation > 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {getDirectionIcon(anomaly.deviation)}
                </span>
              </div>

              <p className="text-xs text-gray-600 mb-2">
                {anomaly.description}
              </p>

              <div className="flex items-center justify-between mb-2">
                <div className="text-xs">
                  <p className="text-gray-600">
                    Current: <span className="font-semibold">{anomaly.value}</span>
                  </p>
                  <p className="text-gray-500">
                    Expected: <span className="font-semibold">{anomaly.expectedValue}</span>
                  </p>
                </div>
                <Badge className={`${styles.bg} ${styles.text} border ${styles.border}`}>
                  {anomaly.severity}
                </Badge>
              </div>

              <p className="text-xs text-gray-400">
                {new Date(anomaly.timestamp).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50">
        <button className="w-full text-sm font-medium text-brand-purple hover:text-brand-deep-purple transition-colors">
          View All Anomalies →
        </button>
      </div>
    </div>
  );
};
