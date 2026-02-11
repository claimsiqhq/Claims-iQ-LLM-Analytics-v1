# Claims IQ Analytics Enhancements - Quick Start Guide

Fast implementation checklist for integrating all enhancements.

## 30-Minute Setup

### Step 1: Copy Components (5 minutes)
```bash
cp client/components/*.tsx your-project/client/src/components/
```

Components copied:
- ✅ DrillDownPanel.tsx
- ✅ MorningBrief.tsx
- ✅ ExportMenu.tsx
- ✅ ErrorBoundary.tsx
- ✅ AnomalyBadges.tsx
- ✅ DataTable.tsx

### Step 2: Update App.tsx (5 minutes)

```typescript
// 1. Add imports at top
import { ErrorBoundary } from './components/ErrorBoundary';
import { MorningBrief } from './components/MorningBrief';

// 2. Add state
const [selectedClientId, setSelectedClientId] = useState('acme-corp');
const [drillDownState, setDrillDownState] = useState({
  isOpen: false, metric: '', filters: {}
});

// 3. Add handlers
const handleDrillDown = (metric, filters) => {
  setDrillDownState({ isOpen: true, metric, filters });
};

// 4. Wrap app in ErrorBoundary
return (
  <ErrorBoundary>
    <div className="flex h-screen">
      {/* ... rest of app ... */}
    </div>
  </ErrorBoundary>
);
```

### Step 3: Update ContextBar.tsx (5 minutes)

```typescript
// 1. Add import
import { AnomalyBadges } from './components/AnomalyBadges';

// 2. Update props
interface ContextBarProps {
  clientId: string;
  onClientChange: (id: string) => void;
}

// 3. Add to render
<ContextBar
  clientId={selectedClientId}
  onClientChange={setSelectedClientId}
/>

// 4. Add AnomalyBadges
<AnomalyBadges clientId={clientId} />
```

### Step 4: Update Canvas.tsx (10 minutes)

```typescript
// 1. Add imports
import { DrillDownPanel } from './components/DrillDownPanel';
import { DataTable } from './components/DataTable';
import { ExportMenu } from './components/ExportMenu';

// 2. Add state
const [drillDownOpen, setDrillDownOpen] = useState(false);
const [drillDownMetric, setDrillDownMetric] = useState('');

// 3. Update renderChart()
const renderChart = () => {
  switch (data?.type) {
    case 'table':
      return <DataTable data={{ labels: data.labels, datasets: data.datasets }} />;
    case 'stacked_bar':
      return <StackedBarChart data={data} />;
    // ... other cases
  }
};

// 4. Add StackedBarChart component (before Canvas)
const StackedBarChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={400}>
    <BarChart data={data.chartData || []}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" />
      <YAxis />
      <Tooltip />
      <Legend />
      {data.datasets?.map((dataset, idx) => (
        <Bar key={idx} dataKey={`value_${idx}`} stackId="stack" fill={dataset.fill} />
      ))}
    </BarChart>
  </ResponsiveContainer>
);

// 5. Add ExportMenu to chart header
<ExportMenu chartData={{ labels: data.labels, datasets: data.datasets }} chartTitle={data.title} />

// 6. Add DrillDownPanel at end
<DrillDownPanel isOpen={drillDownOpen} onClose={() => setDrillDownOpen(false)} metric={drillDownMetric} clientId={clientId} />
```

### Step 5: Add MorningBrief (2 minutes)

```typescript
// In Canvas.tsx or App.tsx, above the chart:
<MorningBrief clientId={clientId} />
```

## Backend APIs to Implement

Your backend must provide these endpoints:

### 1. GET /api/morning-brief
```json
{
  "date": "2026-02-11",
  "content": "Brief content...",
  "metrics": [
    { "label": "Open Claims", "value": 234, "unit": "count", "trend": "up" }
  ],
  "anomalies": 3
}
```

### 2. GET /api/anomalies
```json
{
  "anomalies": [
    {
      "id": "anom_1",
      "metric": "Resolution Time",
      "value": 28,
      "expectedValue": 21,
      "severity": "critical",
      "timestamp": "2026-02-11T08:30:00Z",
      "description": "9% above baseline"
    }
  ]
}
```

### 3. GET /api/clients
```json
[
  { "id": "acme-corp", "name": "Acme Corporation" },
  { "id": "globex-inc", "name": "Globex Inc" }
]
```

## Verification Checklist

- [ ] All 6 components copied to `client/src/components/`
- [ ] ErrorBoundary imported and wrapping App
- [ ] MorningBrief displaying above chart
- [ ] Client selector dropdown in ContextBar
- [ ] AnomalyBadges showing next to LIVE badge
- [ ] ExportMenu button in chart header
- [ ] DrillDownPanel opens on chart click
- [ ] DataTable renders when chart_type === 'table'
- [ ] Stacked bar charts render with multiple series
- [ ] All TypeScript types compile without errors
- [ ] Browser console shows no import errors

## Testing the Features

### Test Drill-down
1. Click on any chart data point
2. Panel should slide in from right
3. Table should show claim records
4. Try sorting columns
5. Try pagination

### Test Morning Brief
1. Page loads, brief appears above chart
2. Click "Show more" to expand
3. Click refresh icon (should be loading state)
4. Click X to dismiss
5. Refresh page (should reappear)

### Test Anomalies
1. Look for badge(s) in top right (next to LIVE)
2. Click badge to see popover
3. Should auto-refresh every 5 minutes

### Test Client Selector
1. Change client in dropdown
2. Chart and brief should update
3. Check network tab - request should have new clientId

### Test Error Boundary
1. Intentionally throw error in component
2. Should see branded error UI
3. Click "Try Again" button
4. Component should recover

### Test Export
1. Click Export button in chart header
2. Try "Export as CSV" - should download file
3. Try "Copy Data" - should show success toast
4. Try "Export as PNG" - should show "Coming soon"

## Common Pitfalls

### Issue: Components not found
**Solution:** Verify all components are in `client/src/components/` directory

### Issue: API calls returning 404
**Solution:** Check that backend endpoints are implemented (see APIs section above)

### Issue: Client selector not updating canvas
**Solution:** Ensure `selectedClientId` is in useEffect dependencies

### Issue: Drill-down panel won't open
**Solution:** Check `getDrilldown()` is working in api.ts

### Issue: Stacked bar shows as regular bar
**Solution:** Verify all Bar components have `stackId="stack"`

## Performance Tips

1. **Drill-down lazy loading** — Data only fetches when panel opens
2. **Anomaly polling** — Refreshes every 5 min, not on every render
3. **Morning brief caching** — Consider caching at API level
4. **Table virtualization** — For 100+ rows, add react-window

## Next Steps

1. **Test thoroughly** — Use checklist above
2. **Monitor performance** — Check DevTools Performance tab
3. **Get feedback** — Share with stakeholders
4. **Polish UI** — Adjust colors/spacing as needed
5. **Deploy** — Roll out to production

## Rollback Plan

If anything breaks:

```bash
# Revert components
git checkout client/src/components/

# Keep API enhancements (backward compatible)
# Rebuild
npm run build
```

## Need Help?

1. Check README.md for detailed component docs
2. Review patch files for step-by-step guides
3. Check TypeScript compiler: `tsc --noEmit`
4. Review browser console for errors
5. Check network tab for failed API calls

---

**Estimated Total Time:** 30 minutes (assuming APIs already exist)
**With Backend Implementation:** Add 2-4 hours
