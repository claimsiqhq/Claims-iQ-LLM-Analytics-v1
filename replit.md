# Claims IQ Analytics

## Overview

Claims IQ Analytics is an LLM-powered conversational claims intelligence dashboard. It's a **chat-first analytics interface** where Claims Managers ask natural language questions (e.g., "Show me SLA breach rate this month by adjuster") and receive structured chart visualizations with AI-generated insights.

The core workflow is:
1. User asks a question in natural language
2. An LLM (Anthropic Claude) translates the question into a structured JSON intent specification
3. The backend validates the intent against known metrics and dimensions (the LLM never generates SQL)
4. A parameterized query is compiled and executed against Supabase
5. Chart data and an LLM-generated insight summary are returned to the frontend
6. Conversation threads maintain context for follow-up questions and drill-downs

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React + Vite)

- **Framework:** React with TypeScript, bundled via Vite
- **Styling:** Tailwind CSS v4 with a custom brand design system (Purple/Gold palette)
- **Typography:** Work Sans (headings), Source Sans Pro (body), Space Mono (data/KPIs)
- **UI Components:** shadcn/ui (new-york style) with Radix UI primitives
- **Charts:** Recharts for data visualization (bar, line, area, pie charts)
- **Icons:** Iconoir (primary) + Lucide (shadcn components)
- **State Management:** React useState/useCallback for local state; TanStack React Query available for server state
- **Source location:** `client/src/`
- **Path aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

The frontend has three main layout components:
- `ContextBar` — top navigation bar with client selector and data freshness indicator
- `ChatPanel` — left sidebar with conversation threads and chat input
- `Canvas` — main content area displaying charts, insights, and assumptions

### Backend (Express + Node.js)

- **Framework:** Express.js with TypeScript, run via `tsx`
- **Entry point:** `server/index.ts`
- **API routes:** `server/routes.ts` — RESTful endpoints under `/api/`
- **Key endpoints:**
  - `POST /api/ask` — main chat endpoint, processes natural language questions
  - `GET /api/threads` — list conversation threads
  - `GET /api/threads/:id` — get thread with turns
  - `PATCH /api/threads/:id/pin` — pin/unpin threads
  - `GET /api/metrics` — list available metric definitions
  - `GET /api/health` — health check
  - `POST /api/seed` — seed the database with sample data

### Settings Page

- **Settings Page** (`client/src/pages/SettingsPage.tsx`): Full settings interface accessible via gear icon in ContextBar
  - **Data Import**: Upload XLSX spreadsheets to add/replace claims data. Shows current data counts. Supports append (skip duplicates) and replace (purge + reimport) modes.
  - **App Preferences**: Theme selection (light/dark/system), default chart type, time range, notifications, auto-refresh interval
  - **Client & User Management**: View/add/delete client organizations, view adjusters imported from spreadsheet data
  - **AI Model Configuration**: View connected AI providers (Anthropic Claude, OpenAI), feature status, architecture overview
- **Settings Routes** (`server/routes/settings.ts`): Backend endpoints for import, data-summary, clients CRUD, adjusters list, AI config, preferences

### LLM Integration (Intent Translation Architecture)

**Critical design decision:** The LLM is strictly an **intent translator**, not a query generator. It produces structured JSON; the backend validates and compiles queries. This is a hard architectural boundary.

- **LLM Adapter** (`server/llm/adapter.ts`): Abstracted LLM interface using Anthropic Claude (claude-sonnet-4-5). Uses env vars `AI_INTEGRATIONS_ANTHROPIC_API_KEY` and `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`.
- **Intent Parser** (`server/llm/intentParser.ts`): Translates natural language → `ParsedIntent` JSON (metric, dimensions, filters, time range, chart type, assumptions)
- **Insight Generator** (`server/llm/insightGenerator.ts`): Generates concise analytical summaries from chart data
- **Batch Processing** (`server/replit_integrations/batch/`): Rate-limited batch processing utilities with retry logic

### Voice Agent (OpenAI Realtime API)

- **Voice Token Endpoint** (`server/routes/voice.ts`): `POST /api/voice/token` — creates ephemeral session tokens for WebRTC connections using OpenAI's Realtime API. Configured with `gpt-4o-realtime-preview` model, server-side VAD, Whisper transcription, and function calling tool.
- **VoiceAgent Component** (`client/src/components/VoiceAgent.tsx`): WebRTC-based two-way voice chat. Manages RTCPeerConnection, data channel events, mic permissions, and audio playback. Supports function calling — when user asks about claims data, the AI calls `ask_claims_question` which hits `/api/ask` and displays charts on Canvas.
- **Flow**: User speaks → Whisper transcribes → AI processes → function call to `/api/ask` if data question → chart appears on Canvas + AI speaks insight summary
- **Security**: `OPENAI_API_KEY` stored as secret, ephemeral keys generated server-side with short TTL, never exposed to browser
- **UI**: Expandable floating panel with status indicators (connecting, listening, speaking), transcript display, connect/disconnect controls

### Query Engine

- **Metric Registry** (`server/engine/metricRegistry.ts`): Loads and caches metric definitions from Supabase with 5-min TTL
- **Validator** (`server/engine/validator.ts`): Validates parsed intents against allow-lists of metrics, dimensions, chart types, and filter fields
- **Query Compiler** (`server/engine/queryCompiler.ts`): Compiles validated intents into parameterized Supabase queries
- **Context Manager** (`server/engine/contextManager.ts`): Manages conversation thread context for follow-up questions, refinements, and drill-downs

### Data Storage

**Primary database: Supabase (PostgreSQL)**
- Accessed via `@supabase/supabase-js` client (`server/config/supabase.ts`)
- Uses service key authentication (not user-level RLS for backend operations)
- Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Storage abstraction in `server/storage.ts` (SupabaseStorage class)

**Drizzle ORM (secondary/scaffolded)**
- Schema in `shared/schema.ts` — currently has a basic `users` table and chat models in `shared/models/chat.ts`
- Drizzle config points to PostgreSQL via `DATABASE_URL` env var
- The `server/replit_integrations/chat/` module uses Drizzle for a generic chat feature (conversations/messages tables)
- Run `npm run db:push` to push Drizzle schema changes

**Key Supabase tables** (managed via seed, not Drizzle):
- `clients` — organizations/tenants
- `users` — system users with roles
- `user_client_access` — user-client access mapping
- `metric_definitions` — analytics metrics catalog (17 defined metrics across throughput, speed/SLA, quality, cost/LLM, risk categories)
- `claims` — individual insurance claims with full lifecycle data
- `claim_stage_history` — stage transition tracking
- `claim_llm_usage` — LLM processing costs per claim
- `threads` — conversation threads
- `thread_turns` — individual Q&A turns within threads
- `sessions` — user sessions

### Data Seeding

`server/seed.ts` generates realistic sample data:
- 12 adjusters across 2 teams
- Claims across 5 perils, 4 severity levels, 4 regions
- 17 metric definitions covering throughput, SLA, quality, cost, and risk categories

### Build System

- **Development:** `npm run dev` — runs Express server with Vite middleware for HMR
- **Production build:** `npm run build` — Vite builds client to `dist/public/`, esbuild bundles server to `dist/index.cjs`
- **Production start:** `npm start` — runs compiled `dist/index.cjs`
- Vite dev server runs on port 5000

## External Dependencies

### Required Services & Environment Variables

| Service | Env Variable | Purpose |
|---------|-------------|---------|
| Supabase | `SUPABASE_URL` | PostgreSQL database and API |
| Supabase | `SUPABASE_SERVICE_KEY` | Service-role authentication key |
| Anthropic Claude | `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | LLM for intent parsing and insight generation |
| Anthropic Claude | `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic API base URL (Replit integration) |
| OpenAI | `OPENAI_API_KEY` | Realtime API for voice chat (WebRTC) |
| PostgreSQL | `DATABASE_URL` | Used by Drizzle ORM for schema management |

### Key NPM Dependencies

- **Backend:** express, @supabase/supabase-js, @anthropic-ai/sdk, drizzle-orm, drizzle-zod, zod, nanoid, connect-pg-simple
- **Frontend:** react, recharts, @tanstack/react-query, @radix-ui/* (full suite), iconoir-react, lucide-react, class-variance-authority, tailwindcss, react-hook-form
- **Build:** vite, esbuild, tsx, @tailwindcss/vite