# Claims IQ Analytics Enhancements - Dependencies

Complete list of required libraries, components, and APIs.

## NPM Dependencies

### Already Installed (per project requirements)
- `react` ^19.0.0
- `react-dom` ^19.0.0
- `typescript` ^5.0.0
- `tailwindcss` ^4.0.0
- `recharts` ^2.15.0
- `iconoir-react` (any recent version)
- `framer-motion` (any recent version)

### Expected: shadcn/ui Components

All components reference shadcn/ui New York style components:

```
client/src/components/ui/
├── Table.tsx
├── Card.tsx
├── Badge.tsx
├── Button.tsx
├── Dialog.tsx
├── Select.tsx
├── Pagination.tsx
├── DropdownMenu.tsx
├── Popover.tsx
└── Toast.tsx
```

If any are missing, install via shadcn/ui:

```bash
npx shadcn-ui@latest add table
npx shadcn-ui@latest add card
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add select
npx shadcn-ui@latest add pagination
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add toast
```

## shadcn/ui Components Used by Feature

### DrillDownPanel.tsx
- **Table** — Display claim records
- **Badge** — Status and severity indicators
- **Button** — Back button, action buttons
- **Pagination** — Page navigation

### MorningBrief.tsx
- **Card** — Container for brief content
- **Badge** — Anomaly count indicator

### ExportMenu.tsx
- **DropdownMenu** — Export options menu
- **Button** — Trigger button
- **Toast** — Success/error notifications

### ErrorBoundary.tsx
- **Button** — "Try Again" and "Go to Home" actions

### AnomalyBadges.tsx
- **Badge** — Severity indicators
- **Popover** — Anomaly detail tooltips

### DataTable.tsx
- **Table** — Data display with sorting
- **Badge** — Optional cell highlights

### Canvas.tsx (Integration)
- **Card** — Chart container
- **Badge** — Filter badges
- **Button** — Action buttons

### ContextBar.tsx (Integration)
- **Select** — Client selector dropdown
- **Badge** — Status badges

### App.tsx (Integration)
- All inherited from child components

## Iconoir React Icons Used

```typescript
// DrillDownPanel.tsx
import { ChevronLeft, X } from 'iconoir-react';

// MorningBrief.tsx
import { ChevronDown, ChevronUp, X, Reload } from 'iconoir-react';

// ExportMenu.tsx
import { Download, Copy } from 'iconoir-react';

// ErrorBoundary.tsx
import { AlertTriangle, Reload } from 'iconoir-react';

// AnomalyBadges.tsx
import { InfoCircle } from 'iconoir-react';
```

**Required Iconoir Icons:**
- ChevronLeft, ChevronRight, ChevronUp, ChevronDown
- X (close)
- Reload (refresh)
- Download (export)
- Copy (clipboard)
- AlertTriangle (error)
- InfoCircle (information)

All icons should be available in iconoir-react package.

## Tailwind CSS Classes Used

### Brand Colors (Custom Config)
```css
.brand-purple { @apply text-[#7763B7]; }
.brand-gold { @apply text-[#C6A54E]; }
.brand-deep-purple { @apply text-[#342A4F]; }
.surface-purple-light { @apply bg-[#F0E6FA]; }
.surface-off-white { @apply bg-[#F0EDF4]; }
.status-alert { @apply text-[#D94F4F]; }
.text-secondary { @apply text-[#6B6280]; }
```

### Utility Classes Used
- Flexbox: `flex`, `flex-col`, `items-center`, `justify-between`, `gap-X`
- Grid: `grid`, `grid-cols-2`, `grid-cols-3`, `grid-cols-4`
- Sizing: `w-X`, `h-X`, `min-h-X`, `max-h-X`
- Spacing: `p-X`, `px-X`, `py-X`, `m-X`, `mx-X`, `my-X`
- Colors: `bg-white`, `text-gray-900`, `text-gray-500`, etc.
- Borders: `border`, `border-l-4`, `border-b`, `border-gray-200`, `rounded-lg`, `rounded-full`
- Effects: `shadow-sm`, `shadow-lg`, `opacity-50`, `hover:*`, `transition-*`
- Layout: `sticky`, `overflow-y-auto`, `overflow-hidden`, `fixed`, `inset-0`
- Animation: `animate-spin`, `animate-pulse`, `transition-all`, `duration-300`

### Responsive Classes
- `sm:grid-cols-4` — Small breakpoint
- `w-2/5` — Percentage widths (for DrillDownPanel)
- `text-xs`, `text-sm`, `text-lg`, `text-xl`, `text-2xl` — Font sizes

## Recharts Components Used

### BarChart (in Canvas.tsx enhancement)
```typescript
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
```

**Usage:**
- BarChart wrapper
- Bar component (with `stackId` for stacking)
- All other chart types already in use
- CartesianGrid, XAxis, YAxis for axes
- Tooltip, Legend for interactivity
- ResponsiveContainer for sizing

## API Dependencies

### Existing APIs (in lib/api.ts)
```typescript
export async function getThreads(clientId: string): Promise<Thread[]>
export async function getThread(id: string): Promise<ThreadDetail>
export async function askQuestion(q: string, threadId?: string): Promise<Response>
export async function pinThread(id: string): Promise<void>
export async function getDrilldown(
  clientId: string,
  metric: string,
  filters: Record<string, any>,
  timeRange: { start: string; end: string }
): Promise<DrilldownData>
export async function getMetrics(clientId: string): Promise<MetricsData>
export async function getClients(): Promise<ClientData[]>
```

### New APIs to Implement

**GET /api/morning-brief?clientId=:clientId**
- Required by: MorningBrief.tsx
- Response type:
```typescript
{
  date: string;
  content: string;
  metrics: BriefMetric[];
  anomalies: number;
}
```

**GET /api/anomalies?clientId=:clientId**
- Required by: AnomalyBadges.tsx
- Response type:
```typescript
{
  anomalies: Anomaly[];
}
```

**POST /api/export/csv**
- Required by: ExportMenu.tsx (optional)
- Could generate server-side CSV instead

## Type Definitions

All TypeScript types used by enhancements:

```typescript
// DrillDownPanel.tsx
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

// MorningBrief.tsx
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

// AnomalyBadges.tsx
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

// DataTable.tsx
interface Dataset {
  label: string;
  values: number[];
  unit?: string;
}

interface DataTableProps {
  data: {
    labels: string[];
    datasets: Dataset[];
  };
}

// Shared
interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    values: number[];
    unit?: string;
  }>;
}
```

## Browser API Requirements

- **Clipboard API** — For "Copy Data" in ExportMenu
  - `navigator.clipboard.writeText()`
  - Requires HTTPS or localhost in production

- **Blob & URL.createObjectURL()** — For CSV download in ExportMenu
  - Standard in all modern browsers

- **localStorage** — Optional for caching (not used in current code)

## Node.js / Build Requirements

```json
{
  "name": "claims-iq-analytics",
  "version": "1.0.0",
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  }
}
```

## Testing Dependencies (Optional)

For unit testing enhancements:

```json
{
  "devDependencies": {
    "@testing-library/react": "^15.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "vitest": "^1.0.0",
    "jsdom": "^23.0.0"
  }
}
```

## Missing Dependencies - How to Identify

If you see these errors during `npm install` or build:

```
Cannot find module 'iconoir-react'
→ npm install iconoir-react

Missing UI component 'Table'
→ npx shadcn-ui@latest add table

Cannot find type 'BriefMetric'
→ Type is defined in component, ensure TypeScript sees it

Tailwind class 'brand-purple' not found
→ Add to tailwind.config.ts extend.colors section

localStorage not available
→ Wrap in typeof window !== 'undefined' check
```

## Dependency Tree

```
Claims IQ Analytics
├── React 19
├── TypeScript 5
├── Tailwind CSS 4
│   └── Custom Theme (brand colors)
├── shadcn/ui (New York)
│   ├── Table
│   ├── Card
│   ├── Badge
│   ├── Button
│   ├── Select
│   ├── Pagination
│   ├── DropdownMenu
│   └── Popover
├── Recharts 2.15
│   ├── BarChart
│   ├── LineChart
│   ├── AreaChart
│   └── PieChart
├── Iconoir React
│   ├── ChevronLeft, ChevronRight
│   ├── X
│   ├── Reload
│   ├── Download
│   ├── Copy
│   ├── AlertTriangle
│   └── InfoCircle
└── Framer Motion
    └── CSS animations preferred in components
```

## Verification Script

Check if all dependencies are available:

```bash
#!/bin/bash
echo "Checking dependencies..."

# Check npm packages
npm list react recharts iconoir-react tailwindcss

# Check shadcn/ui components
for component in Table Card Badge Button Select Pagination DropdownMenu Popover Toast
do
  if [ -f "src/components/ui/$component.tsx" ]; then
    echo "✓ $component"
  else
    echo "✗ $component MISSING"
  fi
done

# Check TypeScript
npx tsc --noEmit && echo "✓ TypeScript compilation OK"

# Check Tailwind build
npx tailwindcss -i ./src/globals.css -o ./dist/output.css && echo "✓ Tailwind CSS OK"

echo "Dependency check complete!"
```

Run with:
```bash
chmod +x verify-deps.sh
./verify-deps.sh
```

## Summary

**All required dependencies are standard for a modern React 19 + TypeScript + Tailwind + shadcn/ui stack.**

- No exotic libraries added
- All components use existing patterns
- Backward compatible with existing code
- No breaking changes to dependencies
- Optional enhancements can be disabled individually

**Most critical: Ensure all shadcn/ui components are installed!**

If shadcn/ui is not in your project, install the required components before using these enhancements.
