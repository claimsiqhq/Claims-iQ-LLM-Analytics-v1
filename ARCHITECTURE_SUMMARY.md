# Claims IQ Analytics — Architecture Summary

> Generated: 2026-02-11 | Branch: `claude/discover-codebase-architecture-LSB7s`

---

## Project Structure

```
Claims-iQ-LLM-Analytics-v1/
├── client/                          # Frontend (React SPA)
│   ├── index.html                   # HTML entry with Google Fonts
│   ├── public/
│   │   ├── favicon.png
│   │   └── opengraph.jpg
│   └── src/
│       ├── main.tsx                 # React root mount
│       ├── App.tsx                  # Root component — layout + state
│       ├── index.css                # Tailwind v4 theme + typography
│       ├── assets/
│       │   ├── logo.png
│       │   ├── logo-white.png
│       │   ├── logo-wordmark.png
│       │   └── empty-state.png
│       ├── components/
│       │   ├── ContextBar.tsx       # Top bar — logo, client selector, LIVE badge
│       │   ├── ChatPanel.tsx        # Left sidebar — thread list + chat input + messages
│       │   ├── Canvas.tsx           # Main area — charts, insight, assumptions, empty state
│       │   └── ui/                  # 50+ shadcn/ui primitives (accordion…tooltip)
│       ├── hooks/
│       │   ├── use-mobile.tsx
│       │   └── use-toast.ts
│       ├── lib/
│       │   ├── api.ts              # fetch wrappers for all endpoints
│       │   ├── mockData.ts         # Static thread/chart/prompt mock data
│       │   ├── queryClient.ts      # TanStack React Query client (unused currently)
│       │   └── utils.ts            # cn() classname merger
│       └── pages/
│           └── not-found.tsx        # 404 page (unused — no router)
├── server/                          # Backend (Express 5 + Supabase)
│   ├── index.ts                     # Express app, HTTP server, logging, port 5000
│   ├── routes.ts                    # All API routes registered here
│   ├── storage.ts                   # SupabaseStorage class — IStorage interface
│   ├── seed.ts                      # Demo data generator (500 claims + related data)
│   ├── static.ts                    # Production static file serving
│   ├── vite.ts                      # Dev-mode Vite middleware integration
│   ├── config/
│   │   └── supabase.ts             # Supabase client (lazy singleton via Proxy)
│   ├── engine/
│   │   ├── metricRegistry.ts       # Loads metric_definitions from Supabase (5-min cache)
│   │   ├── validator.ts            # Validates parsed intent against metric registry
│   │   ├── queryCompiler.ts        # Builds raw SQL per metric, executes via RPC
│   │   └── contextManager.ts       # Thread context stack — merge/create per intent type
│   ├── llm/
│   │   ├── adapter.ts             # Anthropic SDK wrapper (claude-sonnet-4-5)
│   │   ├── intentParser.ts        # NLQ → structured JSON intent via LLM
│   │   └── insightGenerator.ts    # Data + question → plain-text insight via LLM
│   └── replit_integrations/
│       ├── batch/
│       │   ├── index.ts
│       │   └── utils.ts
│       └── chat/
│           ├── index.ts
│           ├── routes.ts           # Replit chat integration (SSE streaming)
│           └── storage.ts          # Drizzle-based conversation storage
├── shared/
│   ├── schema.ts                   # Drizzle ORM schema (users table — minimal)
│   └── models/
│       └── chat.ts                 # Drizzle schema (conversations + messages)
├── attached_assets/                 # Design prompts, logo variants
├── supabase-migration.sql          # Full DDL — 12 tables, indexes, RPC function
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── components.json                 # shadcn/ui configuration
├── postcss.config.js
├── script/
│   └── build.ts                    # esbuild server + Vite client build
├── .replit
└── replit.md
```

---

## Tech Stack

| Layer         | Technology                     | Version    |
|---------------|--------------------------------|------------|
| **Runtime**   | Node.js (ESM)                  | —          |
| **Language**   | TypeScript                     | 5.6.3      |
| **Server**    | Express                        | 5.0.1      |
| **Database**  | Supabase (PostgreSQL)          | SDK 2.95.3 |
| **ORM (alt)** | Drizzle ORM (Replit chat only) | 0.39.3     |
| **LLM**       | Anthropic Claude Sonnet 4.5    | SDK 0.74.0 |
| **Frontend**  | React                          | 19.2.0     |
| **Bundler**   | Vite                           | 7.1.9      |
| **Build**     | esbuild (server) + Vite (client)| 0.25.0    |
| **Styling**   | Tailwind CSS v4                | 4.1.14     |
| **UI Kit**    | shadcn/ui (New York style)     | —          |
| **Charts**    | Recharts                       | 2.15.4     |
| **Icons**     | Iconoir React + Lucide React   | 7.11 / 0.545 |
| **Routing**   | None (SPA, single view)        | —          |
| **State**     | React useState/useCallback     | —          |
| **Animation** | Framer Motion + tw-animate-css | 12.23 / 1.4 |
| **Data Fetch**| Plain fetch (api.ts wrappers)  | —          |
| **PDF**       | pdf-parse (dependency only)    | 2.4.5      |

### Fonts
- **Display**: Work Sans (600, 800)
- **Body**: Source Sans Pro (400, 600)
- **Mono**: Space Mono (700)

### Color Palette
| Token                    | Hex       | Usage                      |
|--------------------------|-----------|----------------------------|
| `brand-purple`           | `#7763B7` | Primary CTA, chart accent  |
| `brand-purple-secondary` | `#9D8BBF` | Secondary text, icons      |
| `brand-purple-light`     | `#CDBFF7` | Hover, selection highlight |
| `brand-gold`             | `#C6A54E` | LIVE badge, assumptions    |
| `brand-deep-purple`      | `#342A4F` | Top bar, heading text      |
| `surface-purple-light`   | `#F0E6FA` | Chat panel background      |
| `surface-off-white`      | `#F0EDF4` | Main canvas background     |
| `status-alert`           | `#D94F4F` | Error states               |

---

## API Endpoints

| Method  | Path                       | Status        | Description                                               |
|---------|----------------------------|---------------|-----------------------------------------------------------|
| `GET`   | `/api/health`              | Implemented   | Health check — DB connectivity probe                      |
| `POST`  | `/api/seed`                | Implemented   | Seeds 500 demo claims + adjusters + metrics + stage/review/LLM data |
| `GET`   | `/api/metrics`             | Implemented   | Returns all active metric_definitions (5-min cache)       |
| `GET`   | `/api/clients`             | Implemented   | Returns all clients (or filtered by user_id header)       |
| `POST`  | `/api/ask`                 | Implemented   | Full NLQ pipeline: intent parse → validate → SQL → data → insight |
| `GET`   | `/api/threads`             | Implemented   | Lists threads grouped by pinned/today/this_week/earlier   |
| `GET`   | `/api/threads/:id`         | Implemented   | Single thread with all turns                              |
| `PATCH` | `/api/threads/:id/pin`     | Implemented   | Toggle pin status on a thread                             |
| `GET`   | `/api/drilldown`           | Implemented   | Paginated claim-level records with filters                |

### Replit Integration Endpoints (separate chat system)

| Method   | Path                                  | Status      | Description                              |
|----------|---------------------------------------|-------------|------------------------------------------|
| `GET`    | `/api/conversations`                  | Scaffolded  | List all conversations (Drizzle-based)   |
| `GET`    | `/api/conversations/:id`              | Scaffolded  | Get conversation + messages              |
| `POST`   | `/api/conversations`                  | Scaffolded  | Create new conversation                  |
| `DELETE`  | `/api/conversations/:id`             | Scaffolded  | Delete conversation                      |
| `POST`   | `/api/conversations/:id/messages`     | Scaffolded  | Send message + stream AI response (SSE)  |

> Note: The Replit chat routes are defined but **not registered** in `server/routes.ts`. They use a separate Drizzle/pg storage layer (`server/replit_integrations/chat/storage.ts`) that imports a `db` module not present in the codebase (`../../db`), so they would error at runtime.

---

## Database Tables

Defined in `supabase-migration.sql`. All tables use UUID primary keys with `gen_random_uuid()`.

| Table                  | Purpose                                        | Status     |
|------------------------|------------------------------------------------|------------|
| `clients`              | Multi-tenant client organizations              | Seeded (1) |
| `users`                | Platform users with roles                      | Seeded (1) |
| `user_client_access`   | Many-to-many user↔client access               | Seeded (1) |
| `adjusters`            | Claims adjusters per client                    | Seeded (12)|
| `claims`               | Core claims domain table (30+ columns)         | Seeded (500)|
| `claim_stage_history`  | Stage transition log with dwell_days           | Seeded     |
| `claim_reviews`        | Review outcomes + LLM vs human decisions       | Seeded     |
| `claim_llm_usage`      | Token/cost/latency tracking per LLM call       | Seeded     |
| `source_documents`     | PDF upload tracking (pending/completed/failed) | Empty      |
| `sessions`             | User chat sessions                             | Created on use |
| `threads`              | Conversation threads (pinned, titled)          | Created on use |
| `thread_turns`         | Individual Q&A turns with full audit trail     | Created on use |
| `metric_definitions`   | Registry of 17 analytics metrics               | Seeded (17)|

### Key Indexes
- `claims`: indexed on `client_id`, `status`, `fnol_date`, `peril`, `region`, `adjuster`, `severity`, `sla_breached`, `current_stage`
- `claim_stage_history`: indexed on `claim_id`, `(stage, entered_at)`
- `threads`: indexed on `(user_id, client_id, created_at)`, partial index on pinned
- `thread_turns`: indexed on `(thread_id, turn_index)`

### RPC Function
- `execute_raw_sql(query_text TEXT) → JSONB`: Used by queryCompiler to execute dynamically built SQL. Defined with `SECURITY DEFINER`.

### Metric Definitions (17 seeded)

| Slug                    | Category    | Chart Default | Unit         |
|-------------------------|-------------|---------------|--------------|
| `claims_received`       | throughput  | line          | count        |
| `claims_in_progress`    | throughput  | stacked_bar   | count        |
| `queue_depth`           | throughput  | bar           | count        |
| `cycle_time_e2e`        | speed_sla   | line          | days         |
| `stage_dwell_time`      | speed_sla   | stacked_bar   | days         |
| `time_to_first_touch`   | speed_sla   | bar           | hours        |
| `sla_breach_rate`       | speed_sla   | line          | percentage   |
| `sla_breach_count`      | speed_sla   | bar           | count        |
| `issue_rate`            | quality     | bar           | percentage   |
| `re_review_count`       | quality     | bar           | count        |
| `human_override_rate`   | quality     | bar           | percentage   |
| `tokens_per_claim`      | cost_llm    | bar           | tokens       |
| `cost_per_claim`        | cost_llm    | line          | dollars      |
| `model_mix`             | cost_llm    | pie           | count        |
| `llm_latency`           | cost_llm    | line          | milliseconds |
| `severity_distribution` | risk        | bar           | count        |
| `high_severity_trend`   | risk        | line          | count        |

---

## Component Inventory

### Application Components

| Component       | File Path                              | Status      | Description                                      |
|-----------------|----------------------------------------|-------------|--------------------------------------------------|
| `App`           | `client/src/App.tsx`                   | Implemented | Root layout — state for thread, response, loading |
| `ContextBar`    | `client/src/components/ContextBar.tsx`  | Implemented | Top bar with logo, hardcoded client name, LIVE badge |
| `ChatPanel`     | `client/src/components/ChatPanel.tsx`   | Implemented | Thread list (grouped), chat messages, input, prompt chips |
| `Canvas`        | `client/src/components/Canvas.tsx`      | Implemented | Chart rendering, insight summary, assumptions, empty/error states |
| `DynamicChart`  | `client/src/components/Canvas.tsx`      | Implemented | Renders bar/line/area/pie via Recharts based on response type |
| `ThreadItem`    | `client/src/components/ChatPanel.tsx`   | Implemented | Individual thread row with icon, pin badge, time ago |
| `ChatMessage`   | `client/src/components/ChatPanel.tsx`   | Implemented | User/system message bubble with insight preview |
| `NotFound`      | `client/src/pages/not-found.tsx`        | Scaffolded  | 404 page (not wired — no router in use) |

### UI Primitives (shadcn/ui — 50+ components)

All located in `client/src/components/ui/`. Includes: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp, item, kbd, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip.

### Backend Modules

| Module              | File Path                              | Status      | Description                                        |
|---------------------|----------------------------------------|-------------|----------------------------------------------------|
| `server/index.ts`   | Entry point                           | Implemented | Express app + JSON/URL middleware + logging + port  |
| `routes.ts`         | Route registration                    | Implemented | 9 endpoints registered on the Express app          |
| `storage.ts`        | SupabaseStorage                       | Implemented | CRUD for clients, threads, turns, sessions, drilldown |
| `supabase.ts`       | Supabase client config                | Implemented | Lazy singleton with env var parsing                |
| `seed.ts`           | Data seeder                           | Implemented | Generates 500 claims + stage history + reviews + LLM usage |
| `metricRegistry.ts` | Metric loader                         | Implemented | Cached metric_definitions from Supabase            |
| `validator.ts`      | Intent validator                      | Implemented | Validates metric, dimensions, filters, chart type, time range |
| `queryCompiler.ts`  | SQL builder + executor                | Implemented | 17 metric-specific SQL builders + formatChartData  |
| `contextManager.ts` | Thread context                        | Implemented | Create/merge context per intent type (query/refine/compare/drill_down) |
| `adapter.ts`        | LLM adapter                           | Implemented | Anthropic Messages API wrapper with latency tracking |
| `intentParser.ts`   | Intent parser                         | Implemented | System prompt + metric list → structured JSON intent |
| `insightGenerator.ts`| Insight generator                    | Implemented | Takes chart data → 2-4 sentence actionable insight |

---

## NLQ Pipeline (POST /api/ask)

The core round-trip when a user asks a natural language question:

```
User Message
  ↓
1. Load metrics from registry (cached 5 min)
  ↓
2. Get or create thread + session
  ↓
3. Load thread context from last turn's context_stack
  ↓
4. Parse intent via LLM (intentParser.ts)
   → Sends system prompt with all 17 metrics + filter fields + output schema
   → Returns structured JSON: metric, dimensions, filters, time_range, chart_type, assumptions
  ↓
5. Validate intent (validator.ts)
   → Check metric exists & is active
   → Check dimensions allowed for metric
   → Check filter fields & operators valid
   → Check chart type valid
   → Check time range has start/end
  ↓
6. Merge context (contextManager.ts)
   → query/new_topic: replace all context
   → refine: merge filters, override time/chart
   → compare: set comparison
   → drill_down: no context change
  ↓
7. Execute query (queryCompiler.ts)
   → Builds metric-specific SQL with WHERE/GROUP BY/JOIN
   → Executes via Supabase RPC execute_raw_sql()
  ↓
8. Format chart data (queryCompiler.ts → formatChartData)
   → Maps raw rows to { labels[], datasets[{ label, values[], unit }] }
   → Formats date labels based on time grain
  ↓
9. Generate insight via LLM (insightGenerator.ts)
   → Sends chart data + question → returns plain-text insight
  ↓
10. Save turn to thread_turns (full audit: intent, chart_data, insight, LLM telemetry)
  ↓
11. Return response:
    { thread_id, turn_id, chart: { type, data, title }, insight, assumptions, metadata }
```

---

## Feature Checklist

```
[x] Implemented  — Feature works end-to-end
[~] Scaffolded   — Route/component exists but logic is incomplete
[ ] Not started  — No code exists for this

Core Pipeline:
[x] POST /api/ask — full NLQ → intent → validate → SQL → data → insight round-trip
[x] Intent parsing via LLM (Anthropic Claude Sonnet 4.5)
[x] Metric registry validation (17 metrics, dimensions, filters, operators, chart types)
[x] Query compilation from intent JSON (17 per-metric SQL builders)
[x] Context stacking across thread turns (query/refine/compare/drill_down)
[x] Insight generation via LLM (2-4 sentence actionable text)
[x] execute_raw_sql RPC function for dynamic query execution

Conversation:
[x] Thread creation and management (auto-created on first ask)
[x] Thread pinning (PATCH /api/threads/:id/pin)
[x] Thread history loading (GET /api/threads/:id with all turns)
[x] Thread list with temporal grouping (pinned/today/this_week/earlier)
[ ] Undo/redo refinements

Frontend:
[x] Chat panel with input and thread list (ChatPanel.tsx)
[x] Canvas with chart rendering (Canvas.tsx + DynamicChart)
[x] Context bar with client selector (ContextBar.tsx — hardcoded client name)
[x] Insight summary display (Canvas.tsx — left-bordered card)
[x] Metadata bar with query/LLM timing + record count
[~] Drill-down panel (API exists, frontend getDrilldown() in api.ts, but no UI wired)
[x] Assumption pills (Canvas.tsx — gold-bordered chips)
[x] Empty state / loading / error states (all three implemented)
[ ] Morning brief display

Charts:
[x] Bar chart
[x] Line chart
[x] Area chart
[x] Pie chart
[~] Stacked bar (falls through to regular bar in DynamicChart)
[~] Table chart type (accepted by validator, no table renderer in Canvas)

Data:
[ ] PDF ingestion pipeline (pdf-parse dependency present, source_documents table exists, no code)
[x] Demo data seeded (500 claims, 12 adjusters, stage history, reviews, LLM usage)
[ ] Real claims data loaded
[ ] Photo metadata
[ ] Policy data
[ ] Estimate data
[ ] Billing data

Enhancement Features:
[ ] Anomaly detection (z-scores)
[ ] Morning brief generation
[ ] Alert rules
[ ] Thread sharing
[ ] Thread annotations
[ ] Scheduled reports
[ ] Query caching (metric registry is cached 5 min, but query results are not)
[ ] Webhook endpoints
[ ] Export/download (buttons exist in UI, no handlers wired)
[ ] Client selector functionality (dropdown is static/hardcoded)
[ ] Authentication (x-user-id header only, no login/auth flow)
[ ] Multi-tenant client switching (hardcoded DEFAULT_CLIENT_ID)

Replit Integrations:
[~] Chat integration (routes + storage defined, not registered, missing db module)
[~] Batch processing (files exist, not analyzed — likely Replit-specific scaffolding)
```

---

## Code Quality Notes

### Architecture Strengths
1. **Clean pipeline separation**: The NLQ pipeline is well-decomposed — intent parsing, validation, query compilation, context management, and insight generation are all independent modules
2. **Full audit trail**: Every turn stores parsed_intent, context_stack, chart_data, insight, LLM telemetry (provider, model, latency), and query latency
3. **Metric registry pattern**: Adding a new metric only requires a DB insert + a SQL builder function in queryCompiler.ts
4. **Type-safe intent schema**: ParsedIntent interface is well-defined with intent_type discriminator for context merging behavior

### Architecture Concerns
1. **SQL injection surface**: `queryCompiler.ts` builds SQL via string concatenation with a basic `sanitize()` that only escapes single quotes. The `execute_raw_sql` RPC function with `SECURITY DEFINER` amplifies this risk. The LLM output is parsed directly into filter values that become part of SQL strings.
2. **No authentication**: User identity is passed via `x-user-id` header with a hardcoded fallback `DEFAULT_USER_ID`. No login, no session auth, no JWT.
3. **Hardcoded client**: The client selector UI shows "Global Insurance Co." but is non-functional. `DEFAULT_CLIENT_ID` is hardcoded in routes and api.ts.
4. **No error boundaries**: React has no ErrorBoundary wrapper. An unhandled error in any component crashes the whole app.
5. **`any` types**: `storage.ts` uses `any` for most return types and parameters. The IStorage interface is weakly typed.
6. **Stacked bar not truly implemented**: The DynamicChart falls through stacked_bar to the default bar renderer without stack configuration.
7. **Table chart type not rendered**: The validator allows `table` chart type, but Canvas has no table rendering path.
8. **Unused dependencies**: `@tanstack/react-query` is configured (queryClient.ts) but unused — api.ts uses plain fetch. `wouter` is imported nowhere. `framer-motion` is listed but unused. `passport`/`passport-local`/`express-session`/`memorystore`/`connect-pg-simple` are dependency-listed but unused.
9. **Dead code**: `shared/schema.ts` defines a minimal `users` table (username/password) that conflicts with the Supabase `users` table (email/full_name/role). `shared/models/chat.ts` defines Drizzle tables for the unused Replit chat integration.
10. **No tests**: Zero test files in the entire repository.

### Performance Characteristics
- Metric definitions cached for 5 minutes (server-side)
- Raw SQL execution via Supabase RPC (no query caching beyond metric registry)
- LLM calls: 2 per ask request (intent parse + insight generation) — expect ~2-5s total latency
- 500 demo claims with comprehensive related data (stage history, reviews, LLM usage)

---

## Enhancement Readiness

### Fastest Paths to New Features

1. **Add a new metric**: Insert into `metric_definitions` table + add SQL builder to `METRIC_QUERIES` in `queryCompiler.ts`. No frontend changes needed — the chart rendering is fully dynamic.

2. **Stacked bar chart**: Add `stackId` prop to the Bar components in DynamicChart when `type === 'stacked_bar'`. Requires restructuring datasets from the query compiler to produce multiple series.

3. **Table chart type**: Add a `type === 'table'` branch in DynamicChart that renders an HTML table using the shadcn/ui Table component (already installed).

4. **Client selector**: Wire up `getClients()` API call in ContextBar, store selected client in App state, pass it through to ChatPanel's `askQuestion()` calls.

5. **Drilldown UI**: The backend endpoint exists and the `getDrilldown()` client function is ready. Need a drill-down panel/drawer component that opens when clicking a chart data point.

6. **Export/download**: The download button exists in Canvas. Wire it to export chart data as CSV or the chart as PNG via Recharts' built-in SVG export.

7. **Authentication**: The passport/express-session dependencies are already installed. Need to create login routes, session middleware, and protect API endpoints.

8. **PDF ingestion**: `pdf-parse` is installed, `source_documents` table exists. Need an upload endpoint, PDF parsing logic, and claim extraction pipeline.

### Key Integration Points
- **LLM adapter** (`server/llm/adapter.ts`): Single point to swap/add LLM providers
- **Metric registry** (`server/engine/metricRegistry.ts`): DB-driven, no code changes to add metrics (except SQL builder)
- **Storage layer** (`server/storage.ts`): IStorage interface allows swapping backends
- **Chart renderer** (`client/src/components/Canvas.tsx`): Fully data-driven — any chart type with `{labels, datasets}` format renders automatically
