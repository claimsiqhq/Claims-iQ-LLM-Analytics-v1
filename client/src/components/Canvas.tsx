import React, { useState, useEffect } from 'react';
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
  Legend
} from 'recharts';
import { FilterList, Download, Refresh } from 'iconoir-react';
import { Info, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import emptyStateImg from "@/assets/empty-state.png";
import type { ChartResponse } from "@/App";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { DataTable } from "@/components/DataTable";
import { ExportMenu } from "@/components/ExportMenu";

const CHART_COLORS = [
  '#7763B7', '#C6A54E', '#9D8BBF', '#E8C97A', '#5A4A8A',
  '#D4B96E', '#342A4F', '#F0E6FA', '#8B7BC4', '#B8993E'
];

interface DynamicChartProps {
  response: ChartResponse;
  onChartClick?: (data: any) => void;
  currentMetric?: string;
}

const DynamicChart = ({ response, onChartClick, currentMetric }: DynamicChartProps) => {
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
    tick: { fill: '#6B6280', fontSize: 11, fontFamily: 'Source Sans Pro' },
    dy: 10,
    interval: 0 as const,
    angle: labels.length > 8 ? -45 : 0,
    textAnchor: labels.length > 8 ? 'end' as const : 'middle' as const,
    height: labels.length > 8 ? 80 : 40,
  };

  const yAxisProps = {
    ...commonAxisProps,
    tick: { fill: '#6B6280', fontSize: 12, fontFamily: 'Space Mono' },
    tickFormatter: (v: number) => formatValue(v),
  };

  const tooltipProps = {
    cursor: { fill: '#F0E6FA', opacity: 0.4 },
    contentStyle: {
      backgroundColor: '#342A4F',
      border: 'none',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      color: '#fff',
    },
    formatter: (value: number) => [formatValue(value), ''],
    labelStyle: { color: '#9D8BBF', marginBottom: '4px', fontFamily: 'Source Sans Pro', fontWeight: 600 },
  };

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
      <ResponsiveContainer width="100%" height={350}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={true}
            label={({ name, value0 }) => `${name}: ${formatValue(value0)}`}
            outerRadius={120}
            dataKey="value0"
            animationDuration={1500}
            onClick={handleChartClick}
          >
            {chartData.map((_, idx) => (
              <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipProps} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
            formatter={(value) => <span style={{ color: '#342A4F', fontSize: '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>}
          />
          {datasets.map((ds, idx) => (
            <Bar
              key={idx}
              dataKey={`value${idx}`}
              name={ds.label}
              stackId="stack"
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
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
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={waterfallData} margin={{ top: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
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
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
            formatter={(value) => <span style={{ color: '#342A4F', fontSize: '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>}
          />
          {datasets.map((ds, idx) => (
            <Line
              key={idx}
              type="monotone"
              dataKey={`value${idx}`}
              name={ds.label}
              stroke={CHART_COLORS[idx]}
              strokeWidth={2.5}
              dot={{ fill: CHART_COLORS[idx], r: 4 }}
              animationDuration={1500}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
            formatter={(value) => <span style={{ color: '#342A4F', fontSize: '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>}
          />
          {datasets.map((ds, idx) => (
            <Area
              key={idx}
              type="monotone"
              dataKey={`value${idx}`}
              name={ds.label}
              stroke={CHART_COLORS[idx]}
              fill={CHART_COLORS[idx]}
              fillOpacity={0.2}
              animationDuration={1500}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} barGap={4} onClick={handleChartClick}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip {...tooltipProps} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="circle"
          formatter={(value) => <span style={{ color: '#342A4F', fontSize: '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>}
        />
        {datasets.map((ds, idx) => (
          <Bar
            key={idx}
            dataKey={`value${idx}`}
            name={ds.label}
            fill={CHART_COLORS[idx]}
            radius={[4, 4, 0, 0]}
            barSize={Math.max(16, Math.min(40, 400 / chartData.length))}
            animationDuration={1500}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

interface CanvasProps {
  activeThreadId: string | null;
  currentResponse: ChartResponse | null;
  isLoading: boolean;
  clientId?: string;
  onFollowUpClick?: (question: string) => void;
}

const CHART_TYPES = ["bar", "line", "area", "pie", "stacked_bar", "table", "heatmap", "waterfall"] as const;

export const Canvas = ({ activeThreadId, currentResponse, isLoading, clientId = "00000000-0000-0000-0000-000000000001", onFollowUpClick }: CanvasProps) => {
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownMetric, setDrillDownMetric] = useState("");
  const [drillDownFilters, setDrillDownFilters] = useState<Record<string, any>>({});
  const [chartTypeOverride, setChartTypeOverride] = useState<string | null>(null);
  const chartAreaRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChartTypeOverride(null);
  }, [currentResponse?.turn_id]);

  const handleChartClick = (data: any) => {
    if (data?.metric) {
      setDrillDownMetric(data.metric);
      setDrillDownFilters(data.filters || {});
      setDrillDownOpen(true);
    }
  };
  if (isLoading && !currentResponse) {
    return (
      <div className="min-h-screen bg-surface-off-white flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="w-12 h-12 text-brand-purple animate-spin mb-4" />
        <p className="text-brand-purple-secondary text-sm">Analyzing your question...</p>
      </div>
    );
  }

  if (!activeThreadId || activeThreadId === 'new' || !currentResponse) {
    return (
      <div className="min-h-screen bg-surface-off-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="max-w-md">
          <img src={emptyStateImg} alt="No Data" className="w-64 h-64 object-contain mx-auto opacity-90 mix-blend-multiply mb-6" />
          <h1 className="type-h1 text-brand-deep-purple mb-3" data-testid="text-hero-title">
            Claims Intelligence Layer
          </h1>
          <p className="type-body text-brand-purple-secondary mb-8 text-center" data-testid="text-hero-subtitle">
            Select a thread from the history or start a new conversation to analyze claims data, SLAs, and litigation risks.
          </p>
          <div className="flex flex-wrap gap-2 justify-center opacity-60">
            <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Breach Rate?</span>
            <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Backlog Analysis</span>
            <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Cost Drivers</span>
          </div>
        </div>
      </div>
    );
  }

  if (currentResponse.error) {
    return (
      <div className="min-h-screen bg-surface-off-white p-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="bg-white border-l-4 border-status-alert p-6 rounded-r-xl shadow-sm">
            <h2 className="type-h2 text-brand-deep-purple mb-2">Unable to Process</h2>
            <p className="type-body text-brand-deep-purple">{currentResponse.error.message}</p>
            {currentResponse.error.suggestions && (
              <div className="mt-4">
                <p className="text-sm text-text-secondary mb-2">Try asking about:</p>
                <div className="flex flex-wrap gap-2">
                  {currentResponse.error.suggestions.map((s, i) => (
                    <span key={i} className="px-3 py-1 bg-surface-purple-light rounded-full text-xs text-brand-deep-purple">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-off-white p-8">
      <div className="max-w-[1000px] mx-auto space-y-8">
        {currentResponse.insight && (
          <div className="bg-white border-l-4 border-brand-purple p-6 rounded-r-xl shadow-sm animate-in slide-in-from-bottom-4 duration-500" data-testid="insight-summary">
            <h2 className="type-h2 text-brand-deep-purple mb-2">Insight Summary</h2>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className="type-body text-brand-deep-purple leading-relaxed mb-2 last:mb-0">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-brand-deep-purple">{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="text-sm text-brand-deep-purple space-y-1 mb-2 ml-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="text-sm text-brand-deep-purple space-y-1 mb-2 ml-1 list-decimal list-inside">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="text-brand-gold mt-0.5 shrink-0">●</span>
                      <span>{children}</span>
                    </li>
                  ),
                  em: ({ children }) => (
                    <em className="text-gray-500 not-italic text-xs">{children}</em>
                  ),
                }}
              >
                {currentResponse.insight}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {currentResponse.chart && (
          <div ref={chartAreaRef} className="w-full min-h-[400px] bg-white rounded-xl border border-surface-grey-lavender p-6 shadow-sm relative overflow-hidden animate-in zoom-in-95 duration-500" data-testid="chart-area">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-xl font-display font-semibold text-brand-deep-purple mb-1" data-testid="text-chart-title">
                  {currentResponse.chart.title}
                </h2>
                {currentResponse.metadata?.metric_definition && (
                  <p className="text-sm text-text-secondary font-body">
                    {currentResponse.metadata.metric_definition}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={chartTypeOverride ?? currentResponse.chart.type}
                  onChange={(e) => setChartTypeOverride(e.target.value)}
                  className="text-sm border border-surface-grey-lavender rounded-lg px-3 py-1.5 bg-white text-brand-deep-purple hover:border-brand-purple-light focus:outline-none focus:ring-2 focus:ring-brand-purple-light"
                  data-testid="chart-type-select"
                >
                  {CHART_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === "stacked_bar" ? "Stacked Bar" : t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                <button className="p-2 hover:bg-surface-purple-light rounded-lg text-text-secondary hover:text-brand-purple transition-colors">
                  <FilterList className="w-5 h-5" />
                </button>
                <ExportMenu
                  chartData={currentResponse.chart.data}
                  chartTitle={currentResponse.chart.title || "Chart"}
                  chartContainerRef={chartAreaRef}
                />
              </div>
            </div>

            <div className="h-[350px] w-full min-h-[350px]">
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
                </div>
              ) : (
                <DynamicChart
                  response={{
                    ...currentResponse,
                    chart: {
                      ...currentResponse.chart,
                      type: chartTypeOverride ?? currentResponse.chart.type,
                    },
                  }}
                  onChartClick={handleChartClick}
                  currentMetric={currentResponse.chart?.title}
                />
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-surface-grey-lavender flex items-center justify-between text-xs text-text-secondary">
              <div className="flex gap-4">
                {currentResponse.metadata?.metric_definition && (
                  <span className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-brand-purple-secondary" />
                    {currentResponse.metadata.metric_definition.slice(0, 60)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Refresh className="w-4 h-4 text-brand-gold" />
                  Query: {currentResponse.metadata?.query_ms || 0}ms | LLM: {currentResponse.metadata?.llm_ms || 0}ms
                </span>
              </div>
              <div className="font-mono bg-surface-purple-light px-2 py-1 rounded text-brand-deep-purple" data-testid="text-record-count">
                n={currentResponse.metadata?.record_count?.toLocaleString() || 0} records
              </div>
            </div>
          </div>
        )}

        {currentResponse.followUpSuggestions && currentResponse.followUpSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300" data-testid="follow-up-suggestions">
            <span className="text-xs text-text-secondary font-medium self-center mr-1">You might also ask:</span>
            {currentResponse.followUpSuggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUpClick?.(q)}
                className="px-3 py-1.5 bg-white border border-brand-purple-light rounded-full text-xs text-brand-deep-purple hover:bg-surface-purple-light hover:border-brand-purple transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {currentResponse.assumptions && currentResponse.assumptions.length > 0 && (
          <div className="flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300" data-testid="assumptions-bar">
            <span className="text-xs text-text-secondary font-medium self-center mr-1">Assumptions:</span>
            {currentResponse.assumptions.map((a, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-white border border-brand-gold/30 rounded-full text-xs text-brand-deep-purple hover:border-brand-gold transition-colors cursor-default"
              >
                {a.label}: {a.assumed_value || a.value}
              </span>
            ))}
          </div>
        )}
      </div>

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
