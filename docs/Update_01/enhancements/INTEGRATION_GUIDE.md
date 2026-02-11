# Claims iQ Analytics — V2 Enhancement Integration Guide

> **Purpose:** Step-by-step instructions to integrate all enhancement modules into the running Claims-iQ-LLM-Analytics-v1 codebase.
> **Audience:** Claude Code agent or developer working in the repo.
> **Prerequisite:** The app is already running with the V1 architecture described in ARCHITECTURE_SUMMARY.md.

---

## Overview: What We're Adding

| Category | Files | New Capabilities |
|----------|-------|-----------------|
| **Database** | 1 migration SQL | 8 enhancement tables, 4 document tables, 11 new metrics, 3 views |
| **Backend Engine** | 4 modules | Anomaly detection, morning briefs, query caching, 11 new metric SQL builders |
| **Backend Routes** | 4 route files | `/api/anomalies`, `/api/morning-brief`, `/api/export`, `/api/ingest` |
| **Backend Ingestion** | 2 modules | PDF parser, claim extractor |
| **Frontend Components** | 6 new components | DrillDownPanel, MorningBrief, ExportMenu, ErrorBoundary, AnomalyBadges, DataTable |
| **Frontend Patches** | 3 existing files modified | Canvas.tsx, ContextBar.tsx, App.tsx |

**Total: ~7,000 lines of new code across 21 files.**

---

## Phase 0: Run the V2 Migration

**File:** `enhancements/migrations/supabase_migration_v2.sql`

### Instructions

1. Open the Supabase SQL Editor for your project
2. Paste the entire contents of `supabase_migration_v2.sql`
3. Execute

The migration is fully idempotent — every `CREATE TABLE` uses `IF NOT EXISTS`, every index uses `IF NOT EXISTS`, and metric inserts use `ON CONFLICT DO NOTHING`. Safe to run multiple times.

### What It Creates

**Enhancement Tables:**
- `alert_rules` — User-defined metric thresholds that trigger notifications
- `anomaly_events` — Detected statistical anomalies in metrics
- `morning_briefs` — Daily AI-generated intelligence summaries
- `thread_shares` — Collaboration through thread sharing
- `thread_annotations` — User annotations on thread turns
- `scheduled_reports` — Recurring report schedules
- `webhook_endpoints` — External webhook integrations
- `query_cache` — Cached query results with TTL

**Document Tables (if not already present from V1):**
- `claim_photos` — Photo/image documentation records
- `claim_policies` — Policy coverage information
- `claim_estimates` — Repair/replacement cost estimates
- `claim_billing` — Billing and expense records

**New Metrics (11 total):**
- Documentation: `photo_count_per_claim`, `areas_documented`, `damage_type_coverage`
- Policy: `coverage_type_distribution`, `endorsement_frequency`, `roof_coverage_rate`
- Financial: `estimate_accuracy`, `depreciation_ratio`, `net_claim_amount_trend`, `total_expenses_per_claim`, `expense_type_breakdown`

**Views:**
- `claim_photo_summary` — Photo documentation completeness
- `claim_coverage_flags` — Policy coverage gap identification
- `metric_anomaly_summary` — Recent anomaly dashboard view

### Verify Migration Success

```sql
-- Should return 8+ new tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('alert_rules', 'anomaly_events', 'morning_briefs',
                   'thread_shares', 'thread_annotations', 'scheduled_reports',
                   'webhook_endpoints', 'query_cache');

-- Should return 28+ metrics (17 original + 11 new)
SELECT count(*) FROM metric_definitions;

-- Should return 3 views
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN ('claim_photo_summary', 'claim_coverage_flags', 'metric_anomaly_summary');
```

---

## Phase 1: Backend Engine Modules

These are new files that go alongside the existing engine files.

### 1A. Anomaly Detector

**Source:** `enhancements/server/engine/anomalyDetector.ts`
**Destination:** `server/engine/anomalyDetector.ts`

**Import Adjustment Required:** The file imports `supabase` from `../config/supabase.js`. In the existing codebase, the Supabase client is accessed through `server/storage.ts` (which exports a `SupabaseStorage` class). You need to either:

**Option A (Recommended):** Create a thin re-export so all enhancement files work:
```typescript
// server/config/supabase.ts (NEW FILE)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

**Option B:** Update every import in the enhancement files to use the existing storage pattern:
```typescript
// Change: import { supabase } from '../config/supabase.js';
// To:     import { storage } from '../storage.js';
// Then use: storage.supabase instead of supabase
```

Option A is cleaner — create the one config file and all enhancement imports work as-is.

**Also imports:** `getMetricBySlug` from `./metricRegistry.js` — verify this function exists in the existing `server/engine/metricRegistry.ts`. If the export name differs, adjust the import.

### 1B. Morning Brief Generator

**Source:** `enhancements/server/engine/morningBrief.ts`
**Destination:** `server/engine/morningBrief.ts`

**Same import adjustments** as anomalyDetector — needs `supabase` config and the LLM adapter.

**LLM Integration:** The file imports an LLM adapter. The existing codebase uses `server/llm/adapter.ts` (Anthropic). Verify the import path matches:
```typescript
// Enhancement file expects:
import { llmAdapter } from '../llm/adapter.js';
// Verify the actual export name in server/llm/adapter.ts
```

### 1C. Query Cache

**Source:** `enhancements/server/engine/queryCache.ts`
**Destination:** `server/engine/queryCache.ts`

**Same supabase import adjustment.** This module is self-contained — it reads/writes the `query_cache` table. No other dependencies.

### 1D. Query Compiler Additions (11 New Metrics)

**Source:** `enhancements/server/engine/queryCompiler-additions.ts`
**Destination:** These SQL builders need to be **merged into** the existing `server/engine/queryCompiler.ts`

**Integration Steps:**

1. Open `server/engine/queryCompiler.ts`
2. Find the `METRIC_QUERIES` map (or equivalent pattern where metric slugs map to SQL builder functions)
3. Add these 11 new entries to that map:

```typescript
// ADD these to the existing METRIC_QUERIES object:
'photo_count_per_claim': (params: QueryParams) => buildPhotoCountPerClaim(params),
'areas_documented': (params: QueryParams) => buildAreasDocumented(params),
'damage_type_coverage': (params: QueryParams) => buildDamageTypeCoverage(params),
'coverage_type_distribution': (params: QueryParams) => buildCoverageTypeDistribution(params),
'endorsement_frequency': (params: QueryParams) => buildEndorsementFrequency(params),
'roof_coverage_rate': (params: QueryParams) => buildRoofCoverageRate(params),
'estimate_accuracy': (params: QueryParams) => buildEstimateAccuracy(params),
'depreciation_ratio': (params: QueryParams) => buildDepreciationRatio(params),
'net_claim_amount_trend': (params: QueryParams) => buildNetClaimAmountTrend(params),
'total_expenses_per_claim': (params: QueryParams) => buildTotalExpensesPerClaim(params),
'expense_type_breakdown': (params: QueryParams) => buildExpenseTypeBreakdown(params),
```

4. Copy the builder function implementations from `queryCompiler-additions.ts` into the same file (or import from a separate file)
5. Copy the `sanitize()` and `buildWhereClause()` helpers if they don't already exist

---

## Phase 2: Backend Route Handlers

### 2A. Create the Ingestion Directory

```bash
mkdir -p server/ingestion
```

### 2B. Copy Ingestion Modules

**Source → Destination:**
- `enhancements/server/ingestion/pdfParser.ts` → `server/ingestion/pdfParser.ts`
- `enhancements/server/ingestion/claimExtractor.ts` → `server/ingestion/claimExtractor.ts`

**Dependencies:** The ingestion routes require `multer` for file uploads:
```bash
npm install multer @types/multer
```

### 2C. Copy Route Handlers

**Source → Destination:**
- `enhancements/server/routes/anomalies.ts` → `server/routes/anomalies.ts`
- `enhancements/server/routes/morning-brief.ts` → `server/routes/morning-brief.ts`
- `enhancements/server/routes/export.ts` → `server/routes/export.ts`
- `enhancements/server/routes/ingestion.ts` → `server/routes/ingestion.ts`

**Important:** The existing app registers all routes in `server/routes.ts` (a single file). The enhancement route files export Express Router instances. You need to **import and mount** them.

### 2D. Register New Routes in server/routes.ts

Open `server/routes.ts` and add:

```typescript
// ADD these imports at the top:
import { anomaliesRouter } from './routes/anomalies.js';
import { morningBriefRouter } from './routes/morning-brief.js';
import { exportRouter } from './routes/export.js';
import { ingestionRouter } from './routes/ingestion.js';

// ADD these route registrations (inside the function that sets up routes):
app.use(anomaliesRouter);
app.use(morningBriefRouter);
app.use(exportRouter);
app.use(ingestionRouter);
```

**Note:** The existing `server/routes.ts` might define routes inline rather than importing routers. If so, you have two options:

**Option A (Preferred):** Move to a router-based pattern:
```typescript
// server/routes.ts
import { Router } from 'express';
import { anomaliesRouter } from './routes/anomalies.js';
// ... etc

export function registerRoutes(app: Express) {
  // existing routes stay as they are...

  // Mount enhancement routers
  app.use(anomaliesRouter);
  app.use(morningBriefRouter);
  app.use(exportRouter);
  app.use(ingestionRouter);
}
```

**Option B:** Copy the route handler logic directly into the existing `routes.ts` file. This keeps everything in one place but makes the file very long.

### 2E. New API Endpoints Summary

After integration, these endpoints should be available:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/anomalies` | List recent anomaly events |
| GET | `/api/anomalies/detect` | Trigger anomaly detection run |
| GET | `/api/alert-rules` | List alert rules |
| POST | `/api/alert-rules` | Create alert rule |
| PATCH | `/api/alert-rules/:id` | Update alert rule |
| DELETE | `/api/alert-rules/:id` | Delete alert rule |
| GET | `/api/morning-brief` | Get/generate today's brief |
| GET | `/api/morning-brief/history` | Past briefs |
| GET | `/api/morning-brief/:briefDate` | Specific date's brief |
| GET | `/api/export/csv` | Export data as CSV |
| GET | `/api/export/json` | Export data as JSON |
| GET | `/api/export/status` | Export job status |
| POST | `/api/ingest/pdf` | Upload and process PDF |
| GET | `/api/ingest/status/:jobId` | Check ingestion status |
| GET | `/api/ingest/jobs` | List ingestion jobs |

---

## Phase 3: Frontend — New Components

### 3A. Copy All 6 Components

```bash
cp enhancements/client/components/*.tsx client/src/components/
```

**Files:**
- `DrillDownPanel.tsx` — Slide-in panel with sortable claims table, pagination, breadcrumbs
- `MorningBrief.tsx` — Collapsible daily intelligence card with metric snapshot
- `ExportMenu.tsx` — Dropdown with CSV export and clipboard copy
- `ErrorBoundary.tsx` — React class component error boundary with branded UI
- `AnomalyBadges.tsx` — Real-time anomaly indicators with severity coloring
- `DataTable.tsx` — Table chart renderer for `chart_type === 'table'`

### 3B. Verify shadcn/ui Components Exist

The new components depend on these shadcn/ui components. Install any that are missing:

```bash
# Check which exist
ls client/src/components/ui/

# Install missing ones (run only for those not present)
npx shadcn-ui@latest add table
npx shadcn-ui@latest add pagination
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add toast
```

The existing app already has: Card, Badge, Button, Dialog, Select (per architecture summary: 50+ shadcn/ui components).

### 3C. Add API Client Functions

Open `client/src/lib/api.ts` and add these functions:

```typescript
// ─── Morning Brief ───
export async function getMorningBrief(clientId: string): Promise<MorningBriefData> {
  const res = await fetch(`/api/morning-brief?client_id=${clientId}`);
  if (!res.ok) throw new Error('Failed to fetch morning brief');
  const json = await res.json();
  return json.data;
}

// ─── Anomalies ───
export async function getAnomalies(clientId: string): Promise<AnomalyData> {
  const res = await fetch(`/api/anomalies?client_id=${clientId}`);
  if (!res.ok) throw new Error('Failed to fetch anomalies');
  const json = await res.json();
  return json.data;
}

// ─── Alert Rules ───
export async function getAlertRules(clientId: string): Promise<AlertRule[]> {
  const res = await fetch(`/api/alert-rules?client_id=${clientId}`);
  if (!res.ok) throw new Error('Failed to fetch alert rules');
  const json = await res.json();
  return json.data;
}

export async function createAlertRule(rule: CreateAlertRulePayload): Promise<AlertRule> {
  const res = await fetch('/api/alert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error('Failed to create alert rule');
  const json = await res.json();
  return json.data;
}

// ─── Export ───
export async function exportCSV(
  metric: string,
  clientId: string,
  startDate: string,
  endDate: string
): Promise<Blob> {
  const params = new URLSearchParams({ metric, client_id: clientId, start_date: startDate, end_date: endDate });
  const res = await fetch(`/api/export/csv?${params}`);
  if (!res.ok) throw new Error('Failed to export CSV');
  return res.blob();
}

// ─── Ingestion ───
export async function ingestPDF(file: File, clientId: string): Promise<IngestionJob> {
  const formData = new FormData();
  formData.append('document', file);
  const res = await fetch(`/api/ingest/pdf?client_id=${clientId}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload PDF');
  const json = await res.json();
  return json.data;
}
```

---

## Phase 4: Frontend — Modify Existing Components

Each patch file in `enhancements/client/patches/` is a **reference document** showing exactly what to add and where. They are NOT drop-in replacements — they show the changes to make to your existing files.

### 4A. Modify Canvas.tsx

**Reference:** `enhancements/client/patches/Canvas-enhancements.tsx`

**Changes to make:**

1. **Add imports** at the top of `Canvas.tsx`:
```typescript
import { DrillDownPanel } from './DrillDownPanel';
import { DataTable } from './DataTable';
import { ExportMenu } from './ExportMenu';
```

2. **Add state** for drill-down:
```typescript
const [drillDownOpen, setDrillDownOpen] = useState(false);
const [drillDownMetric, setDrillDownMetric] = useState('');
const [drillDownFilters, setDrillDownFilters] = useState<Record<string, any>>({});
```

3. **Fix stacked bar** — find the `renderChart()` function's switch statement. Add a `case 'stacked_bar':` that renders a `BarChart` where each `<Bar>` component has `stackId="stack"`:
```typescript
case 'stacked_bar':
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        {datasets.map((ds, i) => (
          <Bar key={i} dataKey={ds.dataKey} name={ds.label}
               stackId="stack" fill={ds.fill || COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
```

4. **Add table chart** — add a `case 'table':` in the same switch:
```typescript
case 'table':
  return <DataTable data={{ labels: chartData.labels, datasets: chartData.datasets }} />;
```

5. **Add click handler** for drill-down on chart data points:
```typescript
const handleChartClick = (data: any) => {
  if (data?.activePayload?.[0]) {
    const point = data.activePayload[0];
    setDrillDownMetric(currentMetric);
    setDrillDownFilters({ label: point.payload.name, ...currentFilters });
    setDrillDownOpen(true);
  }
};
```
Then pass `onClick={handleChartClick}` to `BarChart`, `LineChart`, etc.

6. **Add ExportMenu** to the chart header area (next to existing buttons):
```typescript
<ExportMenu
  chartData={{ labels: data.labels, datasets: data.datasets }}
  chartTitle={data.title || currentMetric}
/>
```

7. **Add DrillDownPanel** at the end of the Canvas component's return:
```typescript
<DrillDownPanel
  isOpen={drillDownOpen}
  onClose={() => setDrillDownOpen(false)}
  metric={drillDownMetric}
  clientId={clientId}
  filters={drillDownFilters}
/>
```

### 4B. Modify ContextBar.tsx

**Reference:** `enhancements/client/patches/ContextBar-enhancements.tsx`

**Changes to make:**

1. **Add imports:**
```typescript
import { AnomalyBadges } from './AnomalyBadges';
import { getClients } from '../lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
```

2. **Add props** for client selection:
```typescript
interface ContextBarProps {
  clientId: string;
  onClientChange: (clientId: string) => void;
  // ...existing props
}
```

3. **Add client list state** and fetch:
```typescript
const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);

useEffect(() => {
  getClients().then(setClients).catch(console.error);
}, []);
```

4. **Replace the hardcoded client display** with a Select dropdown:
```typescript
<Select value={clientId} onValueChange={onClientChange}>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Select client" />
  </SelectTrigger>
  <SelectContent>
    {clients.map(c => (
      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

5. **Add AnomalyBadges** next to the LIVE indicator:
```typescript
<AnomalyBadges clientId={clientId} />
```

### 4C. Modify App.tsx

**Reference:** `enhancements/client/patches/App-enhancements.tsx`

**Changes to make:**

1. **Add imports:**
```typescript
import { ErrorBoundary } from './components/ErrorBoundary';
import { MorningBrief } from './components/MorningBrief';
```

2. **Add state** for client selection:
```typescript
const [selectedClientId, setSelectedClientId] = useState<string>('acme-corp');
```

3. **Wrap entire app** in ErrorBoundary:
```typescript
return (
  <ErrorBoundary>
    {/* existing layout */}
  </ErrorBoundary>
);
```

4. **Add MorningBrief** above the Canvas area:
```typescript
<MorningBrief clientId={selectedClientId} />
```

5. **Pass client props** down to ContextBar:
```typescript
<ContextBar
  clientId={selectedClientId}
  onClientChange={setSelectedClientId}
/>
```

6. **Pass clientId** to Canvas:
```typescript
<Canvas clientId={selectedClientId} />
```

---

## Phase 5: Verify Everything

### 5A. TypeScript Compilation

```bash
npx tsc --noEmit
```

Fix any import path issues. Common adjustments:
- `.js` extensions in imports (required for ESM TypeScript)
- Supabase client path (`../config/supabase.js` vs existing pattern)
- LLM adapter export names

### 5B. Run the Dev Server

```bash
npm run dev
```

### 5C. Test Each Feature

**Morning Brief:**
1. Load the app → gold-bordered brief card should appear above the canvas
2. Brief should show date, content, metric snapshot, anomaly count
3. Click expand/collapse → content toggles
4. Click refresh → loading state, then new content

**Anomaly Badges:**
1. Look for colored badges in the ContextBar area
2. Click a badge → popover with anomaly details
3. Should auto-refresh every 5 minutes

**Client Selector:**
1. Open dropdown in ContextBar → should list clients from `/api/clients`
2. Select a different client → canvas and brief should update
3. All API calls should include the new client ID

**Drill-Down:**
1. Click any chart data point → panel slides in from right
2. Table shows claim records with sortable columns
3. Pagination works (10 items per page)
4. Close button dismisses panel

**Stacked Bar Charts:**
1. Ask a question that produces a stacked bar (e.g. "show claims by stage broken down by severity")
2. Bars should stack on top of each other with legend

**Table Chart:**
1. Ask a question that produces tabular data (e.g. "list the top 10 adjusters by caseload")
2. Should render as a sortable table instead of a chart

**Export:**
1. Click Export button in chart header
2. "Export as CSV" → browser downloads a .csv file
3. "Copy Data" → clipboard gets JSON, success toast appears

**Error Boundary:**
1. Temporarily throw an error in a component
2. Should see branded error page with "Try Again" button
3. Click "Try Again" → component recovers

### 5D. Test Backend Routes Directly

```bash
# Morning brief
curl http://localhost:5000/api/morning-brief?client_id=YOUR_CLIENT_ID

# Anomalies
curl http://localhost:5000/api/anomalies?client_id=YOUR_CLIENT_ID

# Detect anomalies (trigger scan)
curl http://localhost:5000/api/anomalies/detect?client_id=YOUR_CLIENT_ID

# Alert rules
curl http://localhost:5000/api/alert-rules?client_id=YOUR_CLIENT_ID

# Export CSV
curl http://localhost:5000/api/export/csv?metric=avg_cycle_time&client_id=YOUR_CLIENT_ID&start_date=2024-01-01&end_date=2025-12-31

# Export JSON
curl http://localhost:5000/api/export/json?metric=avg_cycle_time&client_id=YOUR_CLIENT_ID
```

---

## Troubleshooting

### Import Errors

**Problem:** `Cannot find module '../config/supabase.js'`
**Fix:** Create `server/config/supabase.ts` as shown in Phase 1A, Option A.

**Problem:** `Cannot find module './routes/anomalies.js'`
**Fix:** Ensure the route files are in `server/routes/` (plural), not `server/route/`.

**Problem:** `Module not found: 'multer'`
**Fix:** `npm install multer @types/multer`

### TypeScript Errors

**Problem:** `Property 'user' does not exist on type 'Request'`
**Fix:** The enhancement routes reference `req.user` for auth context. Since auth isn't implemented yet, replace with:
```typescript
// Instead of: req.user?.clientId
// Use: req.query.client_id as string
```

**Problem:** `Type 'string | undefined' is not assignable to type 'string'`
**Fix:** Add null checks or use non-null assertion where appropriate.

### Runtime Errors

**Problem:** Morning brief returns 500 error
**Fix:** Verify the LLM adapter is configured and the `morning_briefs` table exists.

**Problem:** Anomaly detection returns empty array
**Fix:** Normal if there are no statistically significant deviations. Run with a lower threshold:
```
GET /api/anomalies/detect?client_id=X&threshold=1.5
```

**Problem:** Export returns empty CSV
**Fix:** Verify the metric slug matches a known metric in `metric_definitions` and there's data in the date range.

---

## File Placement Summary

```
YOUR_REPO/
├── server/
│   ├── config/
│   │   └── supabase.ts          ← NEW (thin Supabase client export)
│   ├── engine/
│   │   ├── anomalyDetector.ts   ← NEW
│   │   ├── morningBrief.ts      ← NEW
│   │   ├── queryCache.ts        ← NEW
│   │   └── queryCompiler.ts     ← MODIFY (add 11 metric builders)
│   ├── ingestion/
│   │   ├── pdfParser.ts         ← NEW
│   │   └── claimExtractor.ts    ← NEW
│   ├── routes/
│   │   ├── anomalies.ts         ← NEW
│   │   ├── morning-brief.ts     ← NEW
│   │   ├── export.ts            ← NEW
│   │   └── ingestion.ts         ← NEW
│   └── routes.ts                ← MODIFY (register new routers)
├── client/
│   └── src/
│       ├── components/
│       │   ├── DrillDownPanel.tsx    ← NEW
│       │   ├── MorningBrief.tsx     ← NEW
│       │   ├── ExportMenu.tsx       ← NEW
│       │   ├── ErrorBoundary.tsx    ← NEW
│       │   ├── AnomalyBadges.tsx    ← NEW
│       │   ├── DataTable.tsx        ← NEW
│       │   ├── Canvas.tsx           ← MODIFY
│       │   ├── ContextBar.tsx       ← MODIFY
│       │   └── App.tsx              ← MODIFY (or wherever root component lives)
│       └── lib/
│           └── api.ts               ← MODIFY (add 6 new API functions)
└── migrations/
    └── supabase_migration_v2.sql    ← NEW (run in Supabase SQL Editor)
```

**NEW files:** 16
**MODIFIED files:** 5 (queryCompiler.ts, routes.ts, Canvas.tsx, ContextBar.tsx, App.tsx, api.ts)

---

## Claude Code Integration Prompt

If you're using Claude Code to apply these changes, you can use this prompt:

> I have enhancement files in the `enhancements/` directory that need to be integrated into the running Claims iQ Analytics app. Follow `enhancements/INTEGRATION_GUIDE.md` exactly:
>
> 1. Copy the 16 new files to their correct locations (see "File Placement Summary")
> 2. Create `server/config/supabase.ts` as a thin Supabase client export
> 3. Merge the 11 metric SQL builders from `queryCompiler-additions.ts` into the existing `queryCompiler.ts`
> 4. Register the 4 new routers in `server/routes.ts`
> 5. Add the 6 new API client functions to `client/src/lib/api.ts`
> 6. Modify `Canvas.tsx` per the Canvas-enhancements.tsx patch file
> 7. Modify `ContextBar.tsx` per the ContextBar-enhancements.tsx patch file
> 8. Modify `App.tsx` per the App-enhancements.tsx patch file
> 9. Install `multer` and `@types/multer`
> 10. Run `npx tsc --noEmit` and fix any type errors
> 11. Test with `npm run dev`

---

## What's Still Not Covered

These features from the Enhancement Strategy doc do NOT have code yet:

- **Authentication / RBAC** — No auth middleware, no user sessions
- **Thread Sharing UI** — Backend table exists, no frontend UI
- **Thread Annotations UI** — Backend table exists, no frontend UI
- **Scheduled Reports** — Backend table exists, no scheduler or UI
- **Webhook Endpoints** — Backend table exists, no webhook delivery logic
- **Undo/Redo Refinements** — No code exists for this
- **Real claims data loading** — Demo data only; PDF ingestion is ready but needs real documents

These can be built incrementally once the V2 enhancement foundation is in place.

---

*Generated: 2026-02-11 | Claims iQ Analytics Enhancement Suite v2.0*
