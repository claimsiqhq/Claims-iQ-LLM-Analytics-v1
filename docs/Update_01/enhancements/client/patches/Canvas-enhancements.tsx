/**
 * CANVAS.TSX ENHANCEMENT GUIDE
 *
 * This file shows the exact code changes needed to Canvas.tsx to:
 * 1. Support stacked bar charts
 * 2. Render table data
 * 3. Enable drill-down functionality
 * 4. Add export menu
 *
 * Each section is clearly marked with comments.
 */

// ============================================================================
// SECTION 1: ADD THESE IMPORTS AT THE TOP OF Canvas.tsx
// ============================================================================

// ADD THIS IMPORT
import { DrillDownPanel } from '../components/DrillDownPanel';

// ADD THIS IMPORT
import { DataTable } from '../components/DataTable';

// ADD THIS IMPORT
import { ExportMenu } from '../components/ExportMenu';


// ============================================================================
// SECTION 2: UPDATE THE Canvas COMPONENT PROPS (if using drilldown)
// ============================================================================

interface CanvasProps {
  // ... existing props ...
  // ADD THESE PROPS FOR DRILL-DOWN SUPPORT
  onDrillDown?: (metric: string, filters: Record<string, string | number>) => void;
  drillDownState?: {
    isOpen: boolean;
    metric: string;
    filters?: Record<string, string | number>;
    timeRange?: { start: string; end: string };
  };
  clientId: string;
}


// ============================================================================
// SECTION 3: ADD DRILL-DOWN STATE TO Canvas COMPONENT
// ============================================================================

export const Canvas: React.FC<CanvasProps> = ({
  data,
  insight,
  assumptions,
  loading,
  onDrillDown,
  drillDownState,
  clientId,
}) => {
  // ADD THIS STATE FOR MANAGING DRILL-DOWN PANEL
  const [drillDownOpen, setDrillDownOpen] = React.useState(false);
  const [drillDownMetric, setDrillDownMetric] = React.useState('');
  const [drillDownFilters, setDrillDownFilters] = React.useState<Record<string, string | number>>({});

  // OPTIONAL: Handle drill-down from parent component
  React.useEffect(() => {
    if (drillDownState?.isOpen) {
      setDrillDownOpen(true);
      setDrillDownMetric(drillDownState.metric);
      setDrillDownFilters(drillDownState.filters || {});
    }
  }, [drillDownState?.isOpen]);


  // =========================================================================
  // SECTION 4: REPLACE THE DynamicChart RENDERING WITH THIS UPDATED VERSION
  // =========================================================================

  // REPLACE THIS SECTION:
  // if (data?.type === 'stacked_bar') { return <Bar ... /> }

  // WITH THIS UPDATED VERSION:
  const renderChart = () => {
    if (!data) return null;

    switch (data.type) {
      case 'bar':
        return (
          <BarChart data={data} onClick={(entry) => handleChartClick(entry, data.title)} />
        );

      // NEW: HANDLE STACKED BAR CHARTS
      case 'stacked_bar':
        return (
          <StackedBarChart
            data={data}
            onClick={(entry) => handleChartClick(entry, data.title)}
          />
        );

      case 'line':
        return (
          <LineChart data={data} onClick={(entry) => handleChartClick(entry, data.title)} />
        );

      case 'area':
        return (
          <AreaChart data={data} onClick={(entry) => handleChartClick(entry, data.title)} />
        );

      case 'pie':
        return (
          <PieChart data={data} onClick={(entry) => handleChartClick(entry, data.title)} />
        );

      // NEW: HANDLE TABLE DATA RENDERING
      case 'table':
        return (
          <DataTable
            data={{
              labels: data.labels,
              datasets: data.datasets,
            }}
          />
        );

      default:
        return <div className="text-gray-500">Unsupported chart type: {data.type}</div>;
    }
  };

  // =========================================================================
  // SECTION 5: ADD THESE NEW HELPER FUNCTIONS TO Canvas
  // =========================================================================

  // ADD THIS FUNCTION: Handles chart click for drill-down
  const handleChartClick = (entry: any, chartTitle: string) => {
    setDrillDownMetric(chartTitle);
    setDrillDownFilters({
      label: entry.label || entry.name || 'Selected',
    });
    setDrillDownOpen(true);

    // Optional: Call parent component callback
    if (onDrillDown) {
      onDrillDown(chartTitle, setDrillDownFilters);
    }
  };

  // ADD THIS FUNCTION: Closes the drill-down panel
  const handleCloseDrillDown = () => {
    setDrillDownOpen(false);
    setDrillDownMetric('');
    setDrillDownFilters({});
  };

  // =========================================================================
  // SECTION 6: NEW StackedBarChart COMPONENT (add after Canvas component)
  // =========================================================================

  // ADD THIS NEW COMPONENT
  const StackedBarChart: React.FC<{
    data: any;
    onClick?: (entry: any) => void;
  }> = ({ data, onClick }) => {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data.chartData || []}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          {/* RENDER ONE Bar COMPONENT PER DATASET WITH stackId */}
          {data.datasets?.map((dataset: any, idx: number) => (
            <Bar
              key={idx}
              dataKey={`value_${idx}`}
              name={dataset.label}
              fill={dataset.fill || dataset.color}
              stackId="stack" {/* KEY: stackId enables stacking */}
              onClick={(entry) => onClick?.(entry)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };


  // =========================================================================
  // SECTION 7: UPDATE THE CHART CARD RENDER TO INCLUDE EXPORT MENU
  // =========================================================================

  // FIND THIS SECTION IN Canvas:
  // <Card className="bg-white shadow-sm">
  //   <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
  //     <h2 className="text-lg font-semibold text-gray-900">{data?.title}</h2>
  //   </div>

  // REPLACE WITH THIS:
  <Card className="bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <h2 className="text-lg font-semibold text-gray-900">{data?.title}</h2>

      {/* ADD THIS: Export Menu Button */}
      {data && (
        <ExportMenu
          chartData={{
            labels: data.labels || [],
            datasets: data.datasets || [],
          }}
          chartTitle={data.title || 'Chart'}
          threadId={/* pass threadId from props if available */}
          turnId={/* pass turnId from props if available */}
        />
      )}
    </div>

    {/* Chart rendering area */}
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin mb-4">
              <div className="w-8 h-8 border-4 border-brand-purple border-t-brand-gold rounded-full" />
            </div>
            <p className="text-gray-600">Loading chart...</p>
          </div>
        </div>
      ) : (
        renderChart()
      )}
    </div>
  </Card>


  // =========================================================================
  // SECTION 8: ADD DRILL-DOWN PANEL AT END OF Canvas RETURN
  // =========================================================================

  // ADD THIS AT THE END OF THE Canvas COMPONENT RENDER
  // (After all other content, before the final closing div)

  {/* DRILL-DOWN PANEL */}
  <DrillDownPanel
    isOpen={drillDownOpen}
    onClose={handleCloseDrillDown}
    metric={drillDownMetric}
    filters={drillDownFilters}
    timeRange={
      /* pass timeRange from your state if available */
      { start: '', end: '' }
    }
    clientId={clientId}
  />


  // =========================================================================
  // SECTION 9: IMPORT RECHARTS COMPONENTS (if not already imported)
  // =========================================================================

  // Ensure these Recharts imports are at the top:
  // import {
  //   BarChart,
  //   Bar,
  //   LineChart,
  //   Line,
  //   AreaChart,
  //   Area,
  //   PieChart,
  //   Pie,
  //   CartesianGrid,
  //   XAxis,
  //   YAxis,
  //   Tooltip,
  //   Legend,
  //   ResponsiveContainer,
  // } from 'recharts';


  return (
    <div className="flex-1 flex flex-col gap-6 p-6">
      {/* Morning Brief component can be added here if needed */}

      {/* Chart Card with Export Menu */}
      {/* ... rendered chart content from Section 7 ... */}

      {/* Drill-down Panel */}
      {/* ... DrillDownPanel from Section 8 ... */}
    </div>
  );
};


// ============================================================================
// SUMMARY OF CHANGES:
// ============================================================================
//
// 1. Three new imports added (DrillDownPanel, DataTable, ExportMenu)
// 2. Canvas props interface updated with drill-down props
// 3. Local state added for managing drill-down open/close
// 4. renderChart() function updated to handle 'stacked_bar' and 'table' types
// 5. Two new handler functions added:
//    - handleChartClick() to open drill-down
//    - handleCloseDrillDown() to close drill-down
// 6. New StackedBarChart component added (with stackId on Bar components)
// 7. Chart card header updated with ExportMenu button
// 8. DrillDownPanel component rendered at bottom
// 9. Ensure Recharts imports are present
//
// ============================================================================
