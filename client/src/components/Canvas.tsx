import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
} from 'recharts';
import { FilterList, Download, Refresh } from 'iconoir-react';
import { Info, Loader2, X, LayoutGrid, LayoutList, Trash2, Save, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from 'next-themes';
import emptyStateImg from "@/assets/empty-state.png";
import type { ChartResponse } from "@/App";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { DataTable } from "@/components/DataTable";
import { ExportMenu } from "@/components/ExportMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { saveDashboard, getDashboards, deleteDashboard } from "@/lib/api";

const CHART_COLORS = [
  '#7763B7', '#C6A54E', '#9D8BBF', '#E8C97A', '#5A4A8A',
  '#D4B96E', '#342A4F', '#F0E6FA', '#8B7BC4', '#B8993E'
];

interface DynamicChartProps {
  response: ChartResponse;
  onChartClick?: (data: any) => void;
  currentMetric?: string;
  compact?: boolean;
}

const ZOOM_THRESHOLD = 18;

const DynamicChart = React.memo(({ response, onChartClick, currentMetric, compact }: DynamicChartProps) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);

  useEffect(() => {
    setBrushRange(null);
  }, [response.turn_id, response.chart?.type]);

  if (!response.chart?.data) return null;

  const { type, data, title } = response.chart;
  const { labels, datasets } = data;

  const chartData = labels.map((label, i) => {
    const point: any = { name: label };
    datasets.forEach((ds, dsIdx) => {
      point[`value${dsIdx}`] = ds.values[i];
    });
    return point;
  });

  const unit = datasets[0]?.unit || '';
  const chartHeight = compact ? 250 : 350;
  const hasData = labels.length > 0 && datasets.some((ds) => ds.values.some((v) => v != null && v !== 0));
  const showBrush = !compact && chartData.length > ZOOM_THRESHOLD;
  const brushStart = brushRange?.startIndex ?? 0;
  const brushEnd = brushRange?.endIndex ?? Math.min(chartData.length - 1, ZOOM_THRESHOLD - 1);
  const animDuration = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1500;

  const textColor = isDark ? '#e8e0f0' : '#342A4F';
  const tickColor = isDark ? '#9d8bbf' : '#6B6280';
  const gridColor = isDark ? '#3d3548' : '#E3DFE8';
  const tooltipBg = isDark ? '#24202f' : '#342A4F';
  const tooltipLabel = isDark ? '#cdbff7' : '#9D8BBF';
  const cursorFill = isDark ? 'rgba(119,99,183,0.2)' : 'rgba(240,230,250,0.4)';

  const formatValue = (val: number) => {
    if (unit === 'percentage') return `${val}%`;
    if (unit === 'dollars') return `$${val.toFixed(2)}`;
    if (unit === 'days') return `${val.toFixed(1)}d`;
    if (unit === 'hours') return `${val.toFixed(1)}h`;
    if (unit === 'milliseconds') return `${val}ms`;
    if (unit === 'tokens') return val.toLocaleString();
    return val.toLocaleString();
  };

  const commonAxisProps = {
    axisLine: false as const,
    tickLine: false as const,
  };

  const xAxisProps = {
    ...commonAxisProps,
    dataKey: "name",
    tick: { fill: tickColor, fontSize: compact ? 10 : 11, fontFamily: 'Source Sans Pro' },
    dy: 10,
    interval: 0 as const,
    angle: labels.length > 6 ? -45 : 0,
    textAnchor: labels.length > 6 ? 'end' as const : 'middle' as const,
    height: labels.length > 6 ? 70 : 40,
  };

  const yAxisProps = {
    ...commonAxisProps,
    tick: { fill: '#6B6280', fontSize: compact ? 10 : 12, fontFamily: 'Space Mono' },
    tickFormatter: (v: number) => formatValue(v),
  };

  const tooltipProps = {
    cursor: { fill: cursorFill },
    contentStyle: {
      backgroundColor: tooltipBg,
      border: 'none',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      color: isDark ? '#e8e0f0' : '#fff',
    },
    formatter: (value: number) => [formatValue(value), ''],
    labelStyle: { color: tooltipLabel, marginBottom: '4px', fontFamily: 'Source Sans Pro', fontWeight: 600 },
  };

  const legendFormatter = (value: string) => (
    <span style={{ color: textColor, fontSize: compact ? '11px' : '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>
  );

  const emptyChart = (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-6" role="status" aria-label="No chart data">
      <p className="text-text-secondary text-sm font-medium">No data to display</p>
      <p className="text-text-secondary text-xs mt-1">Try adjusting filters or time range</p>
    </div>
  );

  if (!hasData) {
    return emptyChart;
  }

  if (type === 'table') {
    return (
      <DataTable
        data={{
          labels,
          datasets: datasets.map((ds) => ({
            label: ds.label,
            values: ds.values,
            unit: ds.unit,
          })),
        }}
      />
    );
  }

  const handleChartClick = (data: any) => {
    if (onChartClick && data?.activePayload?.[0]) {
      const point = data.activePayload[0];
      onChartClick({
        metric: currentMetric || response.chart?.title,
        label: point.payload?.name,
        filters: { label: point.payload?.name },
      });
    }
  };

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={!compact}
            label={compact ? false : ({ name, value0 }) => `${name}: ${formatValue(value0)}`}
            outerRadius={compact ? 80 : 120}
            dataKey="value0"
            animationDuration={animDuration}
            onClick={handleChartClick}
          >
            {chartData.map((_, idx) => (
              <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipProps} />
          {compact && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" formatter={legendFormatter} />
          {datasets.map((ds, idx) => (
            <Bar
              key={idx}
              dataKey={`value${idx}`}
              name={ds.label}
              stackId="stack"
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              animationDuration={animDuration}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'heatmap') {
    const rows = datasets.map((ds) => ds.label);
    const cols = labels;
    const values = datasets.map((ds) => ds.values);
    const flat = values.flat();
    const minVal = Math.min(...flat);
    const maxVal = Math.max(...flat);
    const range = maxVal - minVal || 1;
    const getColor = (v: number) => {
      const pct = (v - minVal) / range;
      const idx = Math.min(Math.floor(pct * (CHART_COLORS.length - 1)), CHART_COLORS.length - 1);
      return CHART_COLORS[idx];
    };
    return (
      <div className="w-full overflow-x-auto">
        <div className="min-w-[400px] inline-block">
          <div className="grid gap-0.5 p-2" style={{ gridTemplateColumns: `80px repeat(${cols.length}, 1fr)` }}>
            <div className="col-span-1 row-span-1" />
            {cols.map((c) => (
              <div key={c} className="text-center text-xs font-medium text-text-secondary py-1 truncate" title={c}>
                {c}
              </div>
            ))}
            {rows.map((row, ri) => (
              <React.Fragment key={ri}>
                <div className="text-xs font-medium text-text-secondary py-1 truncate pr-1" title={row}>
                  {row}
                </div>
                {cols.map((_, ci) => (
                  <div
                    key={ci}
                    className="aspect-square min-w-[24px] rounded flex items-center justify-center text-xs font-mono"
                    style={{ backgroundColor: getColor(values[ri][ci] ?? 0), color: values[ri][ci] != null ? '#fff' : 'transparent' }}
                    title={`${row} × ${cols[ci]}: ${formatValue(values[ri][ci] ?? 0)}`}
                  >
                    {values[ri][ci] != null ? formatValue(values[ri][ci]) : '—'}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'waterfall') {
    const vals = datasets[0]?.values ?? [];
    const running: number[] = [];
    let sum = 0;
    vals.forEach((v) => {
      sum += v;
      running.push(sum);
    });
    const waterfallData = labels.map((name, i) => ({
      name,
      value: vals[i] ?? 0,
      cumulative: running[i] ?? 0,
    }));
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={waterfallData} margin={{ top: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip
            {...tooltipProps}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="bg-brand-deep-purple text-white rounded-lg px-3 py-2 text-sm shadow-lg">
                  <p className="font-semibold">{payload[0].payload.name}</p>
                  <p>Change: {formatValue(payload[0].payload.value)}</p>
                  <p>Cumulative: {formatValue(payload[0].payload.cumulative)}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={animDuration}>
            {waterfallData.map((entry, idx) => (
              <Cell key={idx} fill={entry.value >= 0 ? CHART_COLORS[0] : CHART_COLORS[4]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    return (
      <div role="img" aria-label={`Line chart: ${title}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={chartData} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" formatter={legendFormatter} />
            {datasets.map((ds, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={`value${idx}`}
                name={ds.label}
                stroke={CHART_COLORS[idx]}
                strokeWidth={2.5}
                dot={{ fill: CHART_COLORS[idx], r: compact ? 3 : 4 }}
                animationDuration={animDuration}
              />
            ))}
            {showBrush && (
              <Brush
                dataKey="name"
                height={28}
                stroke={gridColor}
                fill={isDark ? '#2d2438' : '#f0e6fa'}
                startIndex={brushStart}
                endIndex={brushEnd}
                onChange={(e) => {
                  const v = e as { startIndex?: number; endIndex?: number };
                  if (v?.startIndex != null && v?.endIndex != null) {
                    setBrushRange({ startIndex: v.startIndex, endIndex: v.endIndex });
                  }
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'area') {
    return (
      <div role="img" aria-label={`Area chart: ${title}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={chartData} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" formatter={legendFormatter} />
            {datasets.map((ds, idx) => (
              <Area
                key={idx}
                type="monotone"
                dataKey={`value${idx}`}
                name={ds.label}
                stroke={CHART_COLORS[idx]}
                fill={CHART_COLORS[idx]}
                fillOpacity={0.2}
                animationDuration={animDuration}
              />
            ))}
            {showBrush && (
              <Brush
                dataKey="name"
                height={28}
                stroke={gridColor}
                fill={isDark ? '#2d2438' : '#f0e6fa'}
                startIndex={brushStart}
                endIndex={brushEnd}
                onChange={(e) => {
                  const v = e as { startIndex?: number; endIndex?: number };
                  if (v?.startIndex != null && v?.endIndex != null) {
                    setBrushRange({ startIndex: v.startIndex, endIndex: v.endIndex });
                  }
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const barLabel = !compact && chartData.length <= 12
    ? { position: 'top' as const, formatter: (v: number) => formatValue(v), fill: textColor, fontSize: 10 }
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} barGap={4} onClick={handleChartClick}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" formatter={legendFormatter} />
        {datasets.map((ds, idx) => (
          <Bar
            key={idx}
            dataKey={`value${idx}`}
            name={ds.label}
            fill={CHART_COLORS[idx]}
            radius={[4, 4, 0, 0]}
            barSize={Math.max(16, Math.min(40, 400 / chartData.length))}
            animationDuration={animDuration}
            label={datasets.length === 1 ? barLabel : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

DynamicChart.displayName = "DynamicChart";

const CHART_TYPES = ["bar", "line", "area", "pie", "stacked_bar", "table", "heatmap", "waterfall"] as const;

interface ChartPanelProps {
  response: ChartResponse;
  compact: boolean;
  onRemove?: () => void;
  onChartClick: (data: any) => void;
  onFollowUpClick?: (question: string) => void;
  clientId: string;
  isLatest?: boolean;
}

const ChartPanel = React.memo(({ response, compact, onRemove, onChartClick, onFollowUpClick, clientId, isLatest }: ChartPanelProps) => {
  const [chartTypeOverride, setChartTypeOverride] = useState<string | null>(null);
  const chartAreaRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChartTypeOverride(null);
  }, [response.turn_id]);

  if (!response.chart) return null;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm dark:shadow-gray-900/30 relative overflow-hidden animate-in zoom-in-95 duration-500 ${isLatest ? 'border-brand-purple/40 ring-1 ring-brand-purple/20' : 'border-surface-grey-lavender dark:border-gray-700'}`} data-testid={`chart-panel-${response.turn_id}`}>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-red-50 text-text-secondary hover:text-red-500 transition-colors"
          data-testid={`btn-remove-panel-${response.turn_id}`}
          title="Remove panel"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className={`${compact ? 'p-3 md:p-4' : 'p-4 md:p-6'}`} ref={chartAreaRef}>
        <div className="flex justify-between items-start mb-3 md:mb-4 pr-6">
          <div className="min-w-0 flex-1">
            <h2 className={`font-display font-semibold text-brand-deep-purple mb-1 truncate ${compact ? 'text-base' : 'text-xl'}`} data-testid="text-chart-title">
              {response.chart.title}
            </h2>
            {!compact && response.metadata?.metric_definition && (
              <p className="text-sm text-text-secondary font-body truncate">
                {response.metadata.metric_definition}
              </p>
            )}
          </div>
          <div className="flex gap-1.5 items-center shrink-0 ml-2">
            <select
              value={chartTypeOverride ?? response.chart.type}
              onChange={(e) => setChartTypeOverride(e.target.value)}
              className={`border border-surface-grey-lavender dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-brand-deep-purple dark:text-gray-200 hover:border-brand-purple-light focus:outline-none focus:ring-2 focus:ring-brand-purple-light ${compact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5'}`}
              data-testid="chart-type-select"
            >
              {CHART_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "stacked_bar" ? "Stacked Bar" : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            {!compact && (
              <ExportMenu
                chartData={response.chart.data}
                chartTitle={response.chart.title || "Chart"}
                chartContainerRef={chartAreaRef}
              />
            )}
          </div>
        </div>

        <div className={`w-full ${compact ? 'min-h-[250px]' : 'min-h-[350px]'}`}>
          <DynamicChart
            response={{
              ...response,
              chart: {
                ...response.chart,
                type: chartTypeOverride ?? response.chart.type,
              },
            }}
            onChartClick={onChartClick}
            currentMetric={response.chart?.title}
            compact={compact}
          />
        </div>

        <div className={`mt-4 pt-3 border-t border-surface-grey-lavender dark:border-gray-700 flex items-center justify-between text-xs text-text-secondary ${compact ? 'gap-2' : ''}`}>
          <div className="flex gap-3 truncate">
            <span className="flex items-center gap-1">
              <Refresh className="w-3.5 h-3.5 text-brand-gold" />
              {response.metadata?.query_ms || 0}ms
            </span>
            {response.metadata?.cache_hit && (
              <span className="text-green-600 font-medium">cached</span>
            )}
          </div>
          <div className="font-mono bg-surface-purple-light dark:bg-gray-700 px-2 py-0.5 rounded text-brand-deep-purple dark:text-gray-200 text-xs" data-testid="text-record-count">
            n={response.metadata?.record_count?.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {!compact && response.insight && (
        <div className="px-4 md:px-6 pb-3 md:pb-4">
          <div className="bg-surface-purple-light/50 dark:bg-gray-700/50 border-l-3 border-brand-purple p-4 rounded-r-lg">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className="type-body text-brand-deep-purple leading-relaxed mb-1 last:mb-0 text-sm">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-brand-deep-purple">{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="text-sm text-brand-deep-purple space-y-0.5 mb-1 ml-1">{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li className="flex items-start gap-1.5 text-sm leading-relaxed">
                      <span className="text-brand-gold mt-0.5 shrink-0 text-xs">●</span>
                      <span>{children}</span>
                    </li>
                  ),
                  em: ({ children }) => (
                    <em className="text-gray-500 not-italic text-xs">{children}</em>
                  ),
                }}
              >
                {response.insight}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {!compact && response.followUpSuggestions && response.followUpSuggestions.length > 0 && (
        <div className="px-4 md:px-6 pb-3 md:pb-4">
          <div className="flex flex-wrap gap-1.5" data-testid="follow-up-suggestions">
            <span className="text-xs text-text-secondary font-medium self-center mr-1">Ask next:</span>
            {response.followUpSuggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUpClick?.(q)}
                className="px-2.5 py-1 bg-white dark:bg-gray-700 border border-brand-purple-light dark:border-gray-600 rounded-full text-xs text-brand-deep-purple dark:text-gray-200 hover:bg-surface-purple-light dark:hover:bg-gray-600 hover:border-brand-purple transition-colors cursor-pointer"
                data-testid={`btn-followup-${i}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {!compact && response.assumptions && response.assumptions.length > 0 && (
        <div className="px-4 md:px-6 pb-3 md:pb-4">
          <div className="flex flex-wrap gap-1.5" data-testid="assumptions-bar">
            <span className="text-xs text-text-secondary font-medium self-center mr-1">Assumptions:</span>
            {response.assumptions.map((a, i) => {
              const isTimeRange = a.key === "time_range" || (a.label || "").toLowerCase().includes("time");
              if (isTimeRange && onFollowUpClick) {
                return (
                  <select
                    key={i}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const chartTitle = response.chart?.title || "the same metric";
                        onFollowUpClick(`Show ${chartTitle} for ${e.target.value} instead`);
                        e.target.value = "";
                      }
                    }}
                    className="px-2.5 py-1 bg-white dark:bg-gray-700 border border-brand-gold/30 rounded-full text-xs text-brand-deep-purple dark:text-gray-200 hover:border-brand-gold transition-colors cursor-pointer appearance-none pr-5"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23C6A54E'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
                    data-testid={`assumption-select-${i}`}
                  >
                    <option value="" disabled>{a.label}: {a.assumed_value || a.value}</option>
                    <option value="last 7 days">Last 7 days</option>
                    <option value="last 30 days">Last 30 days</option>
                    <option value="last 90 days">Last 90 days</option>
                    <option value="last 6 months">Last 6 months</option>
                    <option value="last year">Last year</option>
                    <option value="year to date">Year to date</option>
                  </select>
                );
              }
              return (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-white dark:bg-gray-700 border border-brand-gold/30 rounded-full text-xs text-brand-deep-purple dark:text-gray-200 hover:border-brand-gold transition-colors"
                >
                  {a.label}: {a.assumed_value || a.value}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

ChartPanel.displayName = "ChartPanel";

interface CanvasProps {
  activeThreadId: string | null;
  currentResponse: ChartResponse | null;
  chartPanels: ChartResponse[];
  isLoading: boolean;
  clientId?: string;
  onFollowUpClick?: (question: string) => void;
  onRemovePanel?: (turnId: string) => void;
  onClearPanels?: () => void;
  onLoadDashboard?: (panels: ChartResponse[]) => void;
  isMobile?: boolean;
}

type LayoutMode = 'single' | 'grid';

export const Canvas = ({ activeThreadId, currentResponse, chartPanels, isLoading, clientId = "", onFollowUpClick, onRemovePanel, onClearPanels, onLoadDashboard, isMobile = false }: CanvasProps) => {
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownMetric, setDrillDownMetric] = useState("");
  const [drillDownFilters, setDrillDownFilters] = useState<Record<string, any>>({});
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [loadingDashboards, setLoadingDashboards] = useState(false);

  const handleLoadDashboards = async () => {
    if (!clientId) return;
    setLoadingDashboards(true);
    try {
      const dashboards = await getDashboards(clientId);
      setSavedDashboards(dashboards);
      setShowLoadMenu(true);
    } catch {
      setSavedDashboards([]);
    } finally {
      setLoadingDashboards(false);
    }
  };

  const handleSelectDashboard = (dashboard: any) => {
    setShowLoadMenu(false);
    if (onLoadDashboard && dashboard.layout?.length > 0) {
      const panels: ChartResponse[] = dashboard.layout.map((item: any, idx: number) => ({
        thread_id: item.turn_id || `loaded-${idx}`,
        turn_id: item.turn_id || `loaded-${idx}`,
        chart: item.chart,
        insight: item.insight,
        assumptions: item.assumptions,
      }));
      onLoadDashboard(panels);
    }
  };

  const handleDeleteDashboard = async (e: React.MouseEvent, dashboardId: string) => {
    e.stopPropagation();
    if (!clientId) return;
    try {
      await deleteDashboard(clientId, dashboardId);
      setSavedDashboards(prev => prev.filter(d => d.id !== dashboardId));
    } catch {}
  };

  const handleSaveDashboard = async () => {
    if (chartPanels.length === 0 || !clientId) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const layout = chartPanels.map((p) => ({
        turn_id: p.turn_id,
        chart: p.chart,
        insight: p.insight,
        assumptions: p.assumptions,
      }));
      const title = `Dashboard — ${new Date().toLocaleDateString()} (${chartPanels.length} charts)`;
      await saveDashboard(clientId, title, layout);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch {
      setSaveMsg("Save failed");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleChartClick = (data: any) => {
    if (data?.metric) {
      setDrillDownMetric(data.metric);
      setDrillDownFilters(data.filters || {});
      setDrillDownOpen(true);
    }
  };

  if (isLoading && chartPanels.length === 0) {
    return (
      <div className="bg-surface-off-white dark:bg-gray-900 p-6 md:p-8 min-h-[300px]">
        <Skeleton className="h-6 w-3/4 max-w-md mb-4" />
        <Skeleton className="h-4 w-1/2 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    );
  }

  if (chartPanels.length === 0 && (!activeThreadId || activeThreadId === 'new' || !currentResponse)) {
    return (
      <div className="bg-surface-off-white dark:bg-gray-900 flex flex-col items-center justify-center p-6 md:p-8 text-center animate-in fade-in duration-500">
        <div className="max-w-md">
          <img src={emptyStateImg} alt="No Data" className="w-32 md:w-40 h-32 md:h-40 object-contain mx-auto opacity-90 mix-blend-multiply mb-4" />
          <h1 className="type-h1 text-brand-deep-purple mb-2" data-testid="text-hero-title">
            Claims Intelligence Layer
          </h1>
          <p className="type-body text-brand-purple-secondary mb-5 text-center" data-testid="text-hero-subtitle">
            Ask questions to build your analytics dashboard. Each chart stays on the canvas so you can compare multiple metrics side by side.
          </p>
          <div className="flex flex-wrap gap-2 justify-center opacity-60">
            <span className="px-3 py-1 bg-white dark:bg-gray-700 rounded-full text-xs text-text-secondary border border-surface-grey-lavender dark:border-gray-600">SLA Breach Rate?</span>
            <span className="px-3 py-1 bg-white dark:bg-gray-700 rounded-full text-xs text-text-secondary border border-surface-grey-lavender dark:border-gray-600">Queue Depth by Region</span>
            <span className="px-3 py-1 bg-white dark:bg-gray-700 rounded-full text-xs text-text-secondary border border-surface-grey-lavender dark:border-gray-600">Cost per Claim</span>
          </div>
        </div>
      </div>
    );
  }

  if (currentResponse?.error && chartPanels.length === 0) {
    return (
      <div className="bg-surface-off-white dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 border-l-4 border-status-alert p-6 rounded-r-xl shadow-sm">
          <h2 className="type-h2 text-brand-deep-purple mb-2">Unable to Process</h2>
          <p className="type-body text-brand-deep-purple">{currentResponse.error.message}</p>
          {currentResponse.error.suggestions && (
            <div className="mt-4">
              <p className="text-sm text-text-secondary mb-2">Try asking about:</p>
              <div className="flex flex-wrap gap-2">
                {currentResponse.error.suggestions.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-surface-purple-light dark:bg-gray-700 rounded-full text-xs text-brand-deep-purple dark:text-gray-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isCompact = !isMobile && layoutMode === 'grid' && chartPanels.length > 1;

  return (
    <div className="space-y-4">
      {chartPanels.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-display font-semibold text-brand-deep-purple">
              Dashboard
            </h2>
            <span className="text-xs text-text-secondary bg-surface-purple-light dark:bg-gray-700 px-2 py-0.5 rounded-full font-mono">
              {chartPanels.length} {chartPanels.length === 1 ? 'chart' : 'charts'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isMobile && (
              <div className="flex bg-white dark:bg-gray-800 border border-surface-grey-lavender dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setLayoutMode('single')}
                  className={`p-1.5 transition-colors ${layoutMode === 'single' ? 'bg-brand-purple text-white' : 'text-text-secondary hover:text-brand-purple'}`}
                  title="Single column"
                  data-testid="btn-layout-single"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLayoutMode('grid')}
                  className={`p-1.5 transition-colors ${layoutMode === 'grid' ? 'bg-brand-purple text-white' : 'text-text-secondary hover:text-brand-purple'}`}
                  title="Grid layout"
                  data-testid="btn-layout-grid"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="relative">
              <button
                onClick={handleLoadDashboards}
                disabled={loadingDashboards}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-secondary hover:text-brand-purple hover:bg-surface-purple-light dark:hover:bg-gray-700 rounded-lg transition-colors border border-surface-grey-lavender dark:border-gray-700"
                data-testid="btn-load-dashboard"
                title="Load saved dashboard"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {loadingDashboards ? "Loading..." : "Load"}
              </button>
              {showLoadMenu && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 border border-surface-grey-lavender dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                  {savedDashboards.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-secondary">No saved dashboards</div>
                  ) : (
                    savedDashboards.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => handleSelectDashboard(d)}
                        className="flex items-center justify-between px-3 py-2 hover:bg-surface-purple-light dark:hover:bg-gray-700 cursor-pointer group"
                        data-testid={`dashboard-item-${d.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-brand-deep-purple truncate">{d.title}</div>
                          <div className="text-[10px] text-text-secondary">
                            {new Date(d.updatedAt || d.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteDashboard(e, d.id)}
                          className="ml-2 p-1 text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`btn-delete-dashboard-${d.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    onClick={() => setShowLoadMenu(false)}
                    className="w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-surface-grey-lavender dark:border-gray-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleSaveDashboard}
              disabled={saving || chartPanels.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-brand-purple hover:bg-surface-purple-light dark:hover:bg-gray-700 rounded-lg transition-colors border border-brand-purple-light disabled:opacity-50"
              data-testid="btn-save-dashboard"
              title="Save dashboard"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : saveMsg || "Save"}
            </button>
            {chartPanels.length > 1 && (
              <button
                onClick={onClearPanels}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-surface-grey-lavender dark:border-gray-700"
                data-testid="btn-clear-all"
                title="Clear all charts"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border border-brand-purple/20 overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-[350px] w-full" />
          <div className="p-4 flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      )}

      <div className={`${isCompact ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3 md:space-y-4'}`}>
        {chartPanels.map((panel, idx) => (
          <ChartPanel
            key={panel.turn_id}
            response={panel}
            compact={isCompact}
            onRemove={onRemovePanel ? () => onRemovePanel(panel.turn_id) : undefined}
            onChartClick={handleChartClick}
            onFollowUpClick={onFollowUpClick}
            clientId={clientId}
            isLatest={idx === 0}
          />
        ))}
      </div>

      {currentResponse?.error && chartPanels.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border-l-4 border-status-alert p-4 rounded-r-xl shadow-sm">
          <p className="text-sm text-brand-deep-purple dark:text-gray-200">{currentResponse.error.message}</p>
        </div>
      )}

      <DrillDownPanel
        isOpen={drillDownOpen}
        onClose={() => setDrillDownOpen(false)}
        metric={drillDownMetric}
        filters={drillDownFilters}
        clientId={clientId}
      />
    </div>
  );
};
