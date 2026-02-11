# Claims IQ Analytics Frontend Enhancements

Complete React/TypeScript component library for extending the Claims IQ Analytics dashboard with advanced visualization, drill-down, and intelligence features.

## Overview

This enhancement package includes 9 files organized as:
- **6 Production Components** — Ready-to-use React components
- **3 Integration Patches** — Step-by-step guides for updating existing files

All components use:
- React 19 with TypeScript
- Tailwind CSS v4 with custom brand palette
- shadcn/ui (New York style)
- Recharts 2.15 for visualizations
- Iconoir React for icons
- Framer Motion for animations

## File Structure

```
enhancements/
├── client/
│   ├── components/
│   │   ├── DrillDownPanel.tsx       ✓ Production Ready
│   │   ├── MorningBrief.tsx         ✓ Production Ready
│   │   ├── ExportMenu.tsx           ✓ Production Ready
│   │   ├── ErrorBoundary.tsx        ✓ Production Ready
│   │   ├── AnomalyBadges.tsx        ✓ Production Ready
│   │   └── DataTable.tsx            ✓ Production Ready
│   └── patches/
│       ├── Canvas-enhancements.tsx  (Reference - see Section 1-9)
│       ├── ContextBar-enhancements.tsx (Reference - see Section 1-9)
│       └── App-enhancements.tsx     (Reference - see Section 1-9)
└── README.md                         ← You are here
```

## Component Details

### 1. DrillDownPanel.tsx

**Purpose:** Slide-in panel for exploring claim-level data

**Features:**
- Fetches drill-down data via `getDrilldown()` API
- Sortable claims table with columns: Claim #, Status, Adjuster, Stage, Age, Severity, Issues
- Summary statistics: total count, avg cycle time, SLA breach %
- Pagination (10 items per page)
- Breadcrumb filter trail
- Slide-in animation from right (300ms)
- Alternating row colors with responsive badges

**Props:**
```typescript
{
  isOpen: boolean;
  onClose: () => void;
  metric: string;
  filters?: Record<string, string | number>;
  timeRange?: { start: string; end: string };
  clientId: string;
}
```

**Usage in Canvas.tsx:**
```typescript
<DrillDownPanel
  isOpen={drillDownOpen}
  onClose={handleCloseDrillDown}
  metric={drillDownMetric}
  filters={drillDownFilters}
  timeRange={{ start: '', end: '' }}
  clientId={clientId}
/>
```

---

### 2. MorningBrief.tsx

**Purpose:** Executive intelligence brief displayed at top of dashboard

**Features:**
- Fetches daily brief from `GET /api/morning-brief`
- Gold-bordered card with collapsible content
- Metrics snapshot as mini KPI cards
- Anomaly count badge with color coding
- Refresh button (shows loading spinner)
- Dismiss button to hide temporarily
- Trend indicators (↑↓→) with color coding

**Props:**
```typescript
{
  clientId: string;
}
```

**Usage in Canvas.tsx:**
```typescript
<MorningBrief clientId={clientId} />
```

**API Response Expected:**
```json
{
  "date": "2026-02-11",
  "content": "Daily brief content...",
  "metrics": [
    { "label": "Open Claims", "value": 234, "unit": "count", "trend": "up" }
  ],
  "anomalies": 3
}
```

---

### 3. ExportMenu.tsx

**Purpose:** Export chart data in multiple formats

**Features:**
- Dropdown menu with three export options
- **CSV Export:** Converts chart data to CSV, triggers download
- **PNG Export:** Placeholder (shows "Coming soon" toast)
- **Copy Data:** Copies JSON to clipboard
- Success/error toast notifications
- Download icon in button

**Props:**
```typescript
{
  chartData: { labels: string[]; datasets: any[] };
  chartTitle: string;
  threadId?: string;
  turnId?: string;
}
```

**Usage in Canvas.tsx:**
```typescript
<ExportMenu
  chartData={{ labels: data.labels, datasets: data.datasets }}
  chartTitle={data.title}
  threadId={threadId}
  turnId={turnId}
/>
```

---

### 4. ErrorBoundary.tsx

**Purpose:** Catch and display React render errors gracefully

**Features:**
- Class component (required for error boundaries)
- Branded error UI with Claims IQ theme
- "Try Again" button to reset error state
- "Go to Home" button for recovery
- Development mode: Shows error stack trace
- Logs errors to console
- Animated error icon

**Usage in App.tsx:**
```typescript
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

### 5. AnomalyBadges.tsx

**Purpose:** Display real-time anomaly indicators in ContextBar

**Features:**
- Fetches anomalies from `GET /api/anomalies`
- Auto-refreshes every 5 minutes
- Separate badges for Critical (red, pulsing), Warning (yellow), Info (purple)
- Popover tooltips showing anomaly details
- Color-coded severity (critical, warning, info)
- Direction indicators (↑↓→)
- Responsive grid layout in popover

**Props:**
```typescript
{
  clientId: string;
}
```

**Usage in ContextBar.tsx:**
```typescript
<AnomalyBadges clientId={clientId} />
```

**API Response Expected:**
```json
{
  "anomalies": [
    {
      "id": "a1",
      "metric": "Claim Resolution Time",
      "value": 28,
      "expectedValue": 21,
      "deviation": 7,
      "severity": "critical",
      "timestamp": "2026-02-11T08:30:00Z",
      "description": "9% higher than baseline"
    }
  ]
}
```

---

### 6. DataTable.tsx

**Purpose:** Render tabular data when chart_type === 'table'

**Features:**
- Sortable columns (click header to sort)
- Automatic value formatting:
  - Percentages: "45.2%"
  - Currency: "$12,345.67"
  - Days: "21 days"
  - Counts: "234"
- Alternating row colors (white / surface-off-white)
- Sticky header
- Empty state message
- Responsive table layout

**Props:**
```typescript
{
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      values: number[];
      unit?: string;
    }>;
  };
}
```

**Usage in Canvas.tsx:**
```typescript
case 'table':
  return <DataTable data={{ labels: data.labels, datasets: data.datasets }} />;
```

---

## Integration Patches

### Canvas-enhancements.tsx

**9 Integration Steps:**

1. **Add imports** — DrillDownPanel, DataTable, ExportMenu
2. **Add drill-down state** — Track open/close, metric, filters
3. **Update renderChart()** — Handle stacked_bar and table types
4. **Add handlers** — handleChartClick(), handleCloseDrillDown()
5. **Create StackedBarChart** — New component with stackId on Bars
6. **Add ExportMenu to header** — Include in chart toolbar
7. **Render DrillDownPanel** — Add to component footer
8. **Wire click handlers** — Connect chart clicks to drill-down
9. **Ensure Recharts imports** — Verify all chart components available

**Key Change: Stacked Bar Fix**
```typescript
// OLD: falls through to regular bar
case 'stacked_bar':
  return <Bar ... /> // Missing stackId

// NEW: proper stacking
case 'stacked_bar':
  return (
    <StackedBarChart data={data} onClick={handleChartClick} />
  );

// StackedBarChart component:
{data.datasets?.map((dataset, idx) => (
  <Bar
    key={idx}
    dataKey={`value_${idx}`}
    stackId="stack" // ← This enables stacking
    fill={dataset.fill}
  />
))}
```

---

### ContextBar-enhancements.tsx

**8 Integration Steps:**

1. **Add imports** — AnomalyBadges, getClients, Select UI component
2. **Update props** — Add clientId and onClientChange
3. **Add state** — clients[], selectedClient, loading, error
4. **Add fetch effect** — Load clients on mount
5. **Add sync effect** — Update selectedClient when clientId changes
6. **Add handler** — handleClientChange()
7. **Update title** — Make client name dynamic
8. **Add components** — Client selector + AnomalyBadges

**Key Change: Dynamic Client Selection**
```typescript
// OLD: Hardcoded
<span>Claims IQ Analytics — Acme Corp</span>

// NEW: Dynamic from state + dropdown selector
<span>
  Claims IQ Analytics
  {selectedClient && (
    <> — <span className="text-brand-purple">{selectedClient.name}</span></>
  )}
</span>

<Select value={clientId} onValueChange={handleClientChange}>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Select client" />
  </SelectTrigger>
  <SelectContent>
    {clients.map(client => (
      <SelectItem key={client.id} value={client.id}>
        {client.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

### App-enhancements.tsx

**8 Integration Steps:**

1. **Add imports** — ErrorBoundary, MorningBrief
2. **Update types** — Add drillDownState and selectedClientId
3. **Add state variables** — drillDownState, selectedClientId
4. **Add handlers** — handleDrillDown(), handleCloseDrillDown()
5. **Update useEffect** — Replace hardcoded IDs, add dependencies
6. **Wrap in ErrorBoundary** — Top-level error handling
7. **Add MorningBrief** — Above Canvas component
8. **Update props** — Canvas gets drill-down, ContextBar gets client selector

**Key Change: ErrorBoundary + Dynamic Client**
```typescript
// OLD: No error boundary, hardcoded client
return (
  <div className="flex h-screen">
    <ChatPanel ... />
    <div className="flex-col flex-1">
      <ContextBar />
      <Canvas data={data} />
    </div>
  </div>
);

// NEW: Error boundary, dynamic client, morning brief, drill-down
return (
  <ErrorBoundary>
    <div className="flex h-screen">
      <ChatPanel ... />
      <div className="flex-col flex-1">
        <ContextBar clientId={selectedClientId} onClientChange={setSelectedClientId} />
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <MorningBrief clientId={selectedClientId} />
            <Canvas
              clientId={selectedClientId}
              onDrillDown={handleDrillDown}
              drillDownState={drillDownState}
              data={data}
            />
          </div>
        </div>
      </div>
    </div>
  </ErrorBoundary>
);
```

---

## Implementation Timeline

### Phase 1: Foundation (Day 1)
1. Add ErrorBoundary.tsx to App.tsx
2. Integrate MorningBrief.tsx above Canvas
3. Create DataTable.tsx renderer in Canvas

### Phase 2: Navigation (Day 2)
4. Implement DrillDownPanel.tsx with table
5. Wire chart click handlers in Canvas
6. Add ExportMenu.tsx to chart toolbar

### Phase 3: Intelligence (Day 3)
7. Integrate AnomalyBadges.tsx in ContextBar
8. Implement client selector dropdown
9. Fix stacked_bar chart rendering
10. Test all functionality

---

## API Endpoints Required

These endpoints are called by the components:

```typescript
// Existing (already in api.ts)
GET /api/threads
POST /api/question
GET /api/drilldown

// New (must be implemented in backend)
GET /api/morning-brief?clientId=X
GET /api/anomalies?clientId=X
GET /api/clients
```

### Morning Brief Response
```json
{
  "date": "2026-02-11",
  "content": "Daily brief markdown content...",
  "metrics": [
    {
      "label": "Open Claims",
      "value": 234,
      "unit": "count",
      "trend": "up"
    }
  ],
  "anomalies": 3
}
```

### Anomalies Response
```json
{
  "anomalies": [
    {
      "id": "anom_1",
      "metric": "Avg Resolution Time",
      "value": 28,
      "expectedValue": 21,
      "deviation": 7,
      "severity": "critical",
      "timestamp": "2026-02-11T08:30:00Z",
      "description": "9% above baseline"
    }
  ]
}
```

### Clients Response
```json
[
  { "id": "acme-corp", "name": "Acme Corporation" },
  { "id": "globex-inc", "name": "Globex Inc" }
]
```

### Drill-down Response
```json
{
  "claims": [
    {
      "claimNumber": "CLM-2026-001234",
      "status": "in_review",
      "adjuster": "Jane Doe",
      "stage": "Documentation",
      "ageInDays": 14,
      "severity": "high",
      "issues": ["Missing documentation", "Under review"]
    }
  ],
  "summary": {
    "totalCount": 42,
    "avgCycleTime": 18,
    "breachPercentage": 12.5
  }
}
```

---

## Styling & Theming

All components use the existing Tailwind configuration:

### Brand Colors
- `brand-purple`: #7763B7 (primary)
- `brand-gold`: #C6A54E (accent)
- `brand-deep-purple`: #342A4F (dark variant)
- `surface-purple-light`: #F0E6FA (light background)
- `surface-off-white`: #F0EDF4 (alternating rows)
- `status-alert`: #D94F4F (errors)
- `text-secondary`: #6B6280 (muted text)

### Component-Specific Classes
```typescript
// Success badge
className="bg-green-100 text-green-800 border border-green-300"

// Warning badge
className="bg-yellow-100 text-yellow-800 border border-yellow-300"

// Critical badge
className="bg-red-100 text-red-800 border border-red-300"

// Alternating rows
className={idx % 2 === 0 ? 'bg-white' : 'bg-surface-off-white'}
```

---

## Type Definitions

### Shared Types

```typescript
interface ClaimRecord {
  claimNumber: string;
  status: 'open' | 'closed' | 'pending' | 'in_review';
  adjuster: string;
  stage: string;
  ageInDays: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issues: string[];
}

interface SummaryStats {
  totalCount: number;
  avgCycleTime: number;
  breachPercentage: number;
}

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

interface BriefMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    values: number[];
    unit?: string;
  }>;
}
```

---

## Performance Considerations

### Lazy Loading
- DrillDownPanel: Data fetched only when opened
- AnomalyBadges: Fetched once on mount, auto-refresh every 5 mins
- MorningBrief: Single fetch per client change

### Memoization
```typescript
// Use React.memo for table rows with many columns
export const TableRowCell = React.memo(({ value, format }) => {
  return <TableCell>{formatValue(value, format)}</TableCell>;
});
```

### Virtualization (Optional Enhancement)
For tables with 100+ rows, consider `react-window`:
```typescript
import { FixedSizeList } from 'react-window';
```

---

## Testing Guidelines

### Unit Tests
```typescript
// DataTable sorting
test('DataTable sorts by column ascending', () => {
  // Click header, verify order
});

// Error Boundary
test('ErrorBoundary catches and displays errors', () => {
  // Render with throwing child
  // Verify error UI appears
});

// ExportMenu
test('ExportMenu generates valid CSV', () => {
  // Click CSV export
  // Verify download content
});
```

### Integration Tests
```typescript
// Full drill-down flow
test('Clicking chart opens drill-down panel', () => {
  render(<Canvas />);
  fireEvent.click(getByText('Chart data point'));
  expect(getByText('Drill-down')).toBeInTheDocument();
});

// Client switching
test('Changing client updates all components', () => {
  render(<App />);
  fireEvent.change(getByRole('combobox'), { target: { value: 'globex' } });
  // Verify API calls with new clientId
});
```

---

## Troubleshooting

### Common Issues

**Problem:** DrillDownPanel doesn't open
- Check that `isOpen` state is being passed correctly
- Verify `getDrilldown()` API is implemented
- Check browser console for fetch errors

**Problem:** MorningBrief shows "Failed to load"
- Verify `/api/morning-brief` endpoint exists
- Check that clientId is passed correctly
- Ensure response matches expected schema

**Problem:** Stacked bar chart doesn't stack
- Verify `stackId="stack"` is on ALL Bar components
- Check that multiple Bar elements are rendered (one per dataset)
- Ensure chart data structure is correct

**Problem:** Client selector doesn't update canvas
- Verify `onClientChange` callback is wired
- Check that `selectedClientId` is passed to Canvas
- Ensure useEffect dependencies include `selectedClientId`

**Problem:** ErrorBoundary doesn't catch errors
- Remember it only catches render errors, not event handlers
- For handler errors, use try/catch manually
- Verify component is wrapped correctly

---

## Future Enhancements

1. **PNG Export** — Implement using html2canvas
2. **Real-time Updates** — WebSocket instead of polling
3. **Custom Drill-down Columns** — User-configurable table columns
4. **Drill-down Filters** — Multi-select filter UI
5. **Anomaly Settings** — Configure alert thresholds
6. **Performance Analytics** — Track component render times
7. **Accessibility** — WCAG 2.1 AA compliance audit
8. **Dark Mode** — Theme toggle support

---

## File Sizes & Performance

```
DrillDownPanel.tsx       ~8 KB  (gzipped ~2.5 KB)
MorningBrief.tsx         ~5 KB  (gzipped ~1.8 KB)
ExportMenu.tsx           ~4 KB  (gzipped ~1.3 KB)
ErrorBoundary.tsx        ~4 KB  (gzipped ~1.2 KB)
AnomalyBadges.tsx        ~7 KB  (gzipped ~2.1 KB)
DataTable.tsx            ~5 KB  (gzipped ~1.6 KB)
Total Components         ~33 KB (gzipped ~10.5 KB)
```

---

## Support & Questions

For implementation questions:
1. Check the specific component's "Usage in Canvas.tsx" section
2. Review the patch files for exact code placement
3. Verify API response schemas match expected types
4. Check browser console for fetch/render errors
5. Run TypeScript compiler: `tsc --noEmit`

---

## License & Attribution

These enhancements are part of the Claims IQ Analytics application.
All components follow the existing project conventions and styling guidelines.

**Created:** 2026-02-11
**Version:** 1.0.0
**React Version:** 19+
**TypeScript Version:** 5.0+
