import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { anomaliesRouter } from "./routes/anomalies";
import { morningBriefRouter } from "./routes/morning-brief";
import { exportRouter } from "./routes/export";
import { ingestionRouter } from "./routes/ingestion";
import { kpisRouter } from "./routes/kpis";
import { sharesRouter } from "./routes/shares";
import { annotationsRouter } from "./routes/annotations";
import { scheduledReportsRouter } from "./routes/scheduled-reports";
import { dashboardsRouter } from "./routes/dashboards";
import { apiKeysRouter } from "./routes/api-keys";
import { getMetrics } from "./engine/metricRegistry";
import { parseIntent } from "./llm/intentParser";
import { validateIntent } from "./engine/validator";
import {
  executeMetricQuery,
  formatChartData,
  formatChartDataForComparison,
} from "./engine/queryCompiler";
import {
  getComparisonDateRange,
  createComparisonIntent,
} from "./engine/comparisonHelper";
import {
  generateInsight,
  generateFollowUpSuggestions,
} from "./llm/insightGenerator";
import {
  createEmptyContext,
  mergeContext,
  type ThreadContext,
} from "./engine/contextManager";
import { queryCache } from "./engine/queryCache";
import { log } from "./index";
import { runSeed } from "./seed";
import { getDefaultClientId, getDefaultUserId, invalidateDefaultsCache } from "./config/defaults";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(anomaliesRouter);
  app.use(morningBriefRouter);
  app.use(exportRouter);
  app.use(ingestionRouter);
  app.use(kpisRouter);
  app.use(sharesRouter);
  app.use(annotationsRouter);
  app.use(scheduledReportsRouter);
  app.use(dashboardsRouter);
  app.use(apiKeysRouter);

  app.get("/api/health", async (_req, res) => {
    try {
      const { supabase } = await import("./config/supabase");
      const { data, error } = await supabase.from("metric_definitions").select("slug", { count: "exact", head: true });
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: error ? "not_seeded" : "connected",
      });
    } catch {
      res.json({ status: "ok", timestamp: new Date().toISOString(), database: "error" });
    }
  });

  app.post("/api/seed", async (_req, res) => {
    try {
      log("Starting database seed...", "seed");
      await runSeed();
      invalidateDefaultsCache();
      res.json({ status: "ok", message: "Database seeded successfully" });
    } catch (err: any) {
      log(`Seed error: ${err.message}`, "seed");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/metrics", async (_req, res) => {
    try {
      const metrics = await getMetrics();
      res.json(metrics);
    } catch (err: any) {
      log(`Error loading metrics: ${err.message}`, "metrics");
      res.status(500).json({ error: "Failed to load metrics" });
    }
  });

  app.get("/api/clients", async (req, res) => {
    try {
      const userId = (req.headers["x-user-id"] as string) || await getDefaultUserId();
      const clients = await storage.getClients();
      res.json(clients);
    } catch (err: any) {
      log(`Error loading clients: ${err.message}`, "clients");
      res.status(500).json({ error: "Failed to load clients" });
    }
  });

  app.post("/api/ask", async (req, res) => {
    try {
      const {
        message,
        thread_id,
        client_id,
      } = req.body;
      const resolvedClientId = client_id || await getDefaultClientId();
      const userId =
        (req.headers["x-user-id"] as string) || await getDefaultUserId();

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const metrics = await getMetrics();

      let threadId = thread_id;
      let context: ThreadContext = createEmptyContext();
      let turnIndex = 0;

      if (threadId) {
        const turns = await storage.getThreadTurns(threadId);
        turnIndex = turns.length;
        const lastTurn = turns[turns.length - 1];
        if (lastTurn?.context_stack) {
          context = lastTurn.context_stack as ThreadContext;
        }
      } else {
        const session = await storage.getOrCreateSession(userId, resolvedClientId);
        const thread = await storage.createThread(
          session.id,
          userId,
          resolvedClientId,
          message.slice(0, 80)
        );
        threadId = thread.id;
      }

      const { intent, llmResponse: intentLlm } = await parseIntent(
        message,
        metrics,
        context.metric ? context : null
      );

      const validation = validateIntent(intent, metrics);
      if (!validation.valid) {
        const errorTurn = await storage.createTurn({
          thread_id: threadId,
          turn_index: turnIndex,
          user_message: message,
          parsed_intent: intent,
          intent_valid: false,
          validation_errors: validation.errors,
          context_stack: context,
          error_type: "unsupported",
          error_message: validation.errors.join("; "),
          suggested_alternatives: metrics.slice(0, 5).map((m) => m.display_name),
          llm_provider: intentLlm.provider,
          llm_model: intentLlm.model,
          llm_latency_ms: intentLlm.latencyMs,
        });

        return res.json({
          thread_id: threadId,
          turn_id: errorTurn.id,
          error: {
            type: "unsupported",
            message: validation.errors.join("; "),
            suggestions: metrics.slice(0, 5).map((m) => m.display_name),
          },
        });
      }

      const newContext = mergeContext(context, intent, turnIndex, message);

      let rawData: any[];
      let queryMs: number;
      let recordCount: number;
      const cacheKey = queryCache.generateCacheKey(
        validation.metric!.slug,
        resolvedClientId,
        { filters: intent.filters, dimensions: intent.dimensions },
        intent.time_range?.value || "last_30_days",
        { start: intent.time_range?.start, end: intent.time_range?.end }
      );
      const cached = await queryCache.getCachedResult(cacheKey);
      let cacheHit = false;

      try {
        if (cached && Array.isArray(cached)) {
          rawData = cached as any[];
          queryMs = 0;
          recordCount = rawData.length;
          cacheHit = true;
        } else {
          const result = await executeMetricQuery(
            intent,
            validation.metric!,
            resolvedClientId
          );
          rawData = result.data;
          queryMs = result.queryMs;
          recordCount = result.recordCount;
          await queryCache.setCachedResult(
            cacheKey,
            validation.metric!.slug,
            resolvedClientId,
            rawData,
            15
          );
        }
      } catch (queryErr: any) {
        log(`Query execution error: ${queryErr.message}`, "ask");
        const errorTurn = await storage.createTurn({
          thread_id: threadId,
          turn_index: turnIndex,
          user_message: message,
          parsed_intent: intent,
          intent_valid: true,
          context_stack: newContext,
          error_type: "query_error",
          error_message: `Unable to run this analysis: ${queryErr.message}`,
          suggested_alternatives: ["Try rephrasing your question", "Use a different metric or filter"],
          llm_provider: intentLlm.provider,
          llm_model: intentLlm.model,
          llm_latency_ms: intentLlm.latencyMs,
        });
        return res.json({
          thread_id: threadId,
          turn_id: errorTurn.id,
          error: {
            type: "query_error",
            message: "Unable to run this analysis. Try rephrasing your question or using different filters.",
            suggestions: ["Try a different time range", "Remove specific filters", "Ask about a different metric"],
          },
        });
      }

      let chartData: {
        type: string;
        data: { labels: string[]; datasets: Array<{ label: string; values: number[]; unit: string }> };
        title: string;
      };
      if (intent.comparison?.offset) {
        const { start: currStart, end: currEnd } = intent.time_range || {
          start: "",
          end: "",
        };
        const { start: compStart, end: compEnd } = getComparisonDateRange(
          currStart,
          currEnd,
          intent.comparison.offset
        );
        const compIntent = createComparisonIntent(intent, compStart, compEnd);
        const compResult = await executeMetricQuery(
          compIntent,
          validation.metric!,
          resolvedClientId
        );
        chartData = formatChartDataForComparison(
          rawData,
          compResult.data as any[],
          intent,
          validation.metric!,
          "Previous Period"
        );
      } else {
        chartData = formatChartData(rawData, intent, validation.metric!);
      }

      let insight = "";
      let insightLlmMs = 0;
      if (rawData.length > 0) {
        const { insight: generatedInsight, llmResponse: insightLlm } =
          await generateInsight(
            message,
            chartData,
            chartData.type,
            validation.metric!.display_name
          );
        insight = generatedInsight;
        insightLlmMs = insightLlm.latencyMs;
      } else {
        insight = "No data found for the specified criteria. Try adjusting your filters or time range.";
      }

      let followUpSuggestions: string[] = [];
      if (rawData.length > 0) {
        followUpSuggestions = await generateFollowUpSuggestions(
          message,
          validation.metric!.display_name,
          chartData
        );
      }

      const turn = await storage.createTurn({
        thread_id: threadId,
        turn_index: turnIndex,
        user_message: message,
        parsed_intent: intent,
        intent_valid: true,
        assumptions: intent.assumptions,
        context_stack: newContext,
        chart_data: chartData.data,
        chart_type: chartData.type,
        insight_summary: insight,
        llm_provider: intentLlm.provider,
        llm_model: intentLlm.model,
        llm_latency_ms: intentLlm.latencyMs + insightLlmMs,
        query_latency_ms: queryMs,
      });

      await storage.updateThread(threadId, { title: message.slice(0, 80) });

      res.json({
        thread_id: threadId,
        turn_id: turn.id,
        chart: {
          type: chartData.type,
          data: chartData.data,
          title: chartData.title,
        },
        insight,
        followUpSuggestions,
        assumptions: intent.assumptions,
        metadata: {
          metric_definition: validation.metric!.description,
          filters_applied: intent.filters,
          time_range: intent.time_range,
          data_freshness_seconds: 120,
          record_count: recordCount,
          query_ms: queryMs,
          llm_ms: intentLlm.latencyMs + insightLlmMs,
          cache_hit: cacheHit,
        },
      });
    } catch (err: any) {
      log(`Error in /api/ask: ${err.message}`, "ask");
      console.error(err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  app.get("/api/threads", async (req, res) => {
    try {
      const userId =
        (req.headers["x-user-id"] as string) || await getDefaultUserId();
      const clientId =
        (req.query.client_id as string) || await getDefaultClientId();

      const threads = await storage.getThreads(userId, clientId);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      const pinned = threads.filter((t) => t.is_pinned);
      const unpinned = threads.filter((t) => !t.is_pinned);

      const today = unpinned.filter(
        (t) => new Date(t.updated_at) >= todayStart
      );
      const thisWeek = unpinned.filter(
        (t) =>
          new Date(t.updated_at) >= weekStart &&
          new Date(t.updated_at) < todayStart
      );
      const earlier = unpinned.filter(
        (t) => new Date(t.updated_at) < weekStart
      );

      res.json({ pinned, today, this_week: thisWeek, earlier });
    } catch (err: any) {
      log(`Error in /api/threads: ${err.message}`, "threads");
      res.status(500).json({ error: "Failed to load threads" });
    }
  });

  app.get("/api/threads/:id", async (req, res) => {
    try {
      const thread = await storage.getThread(req.params.id);
      const turns = await storage.getThreadTurns(req.params.id);
      res.json({ ...thread, turns });
    } catch (err: any) {
      log(`Error loading thread: ${err.message}`, "threads");
      res.status(500).json({ error: "Failed to load thread" });
    }
  });

  app.patch("/api/threads/:id/pin", async (req, res) => {
    try {
      const { is_pinned, pin_order } = req.body;
      const updated = await storage.updateThread(req.params.id, {
        is_pinned,
        pin_order,
      });
      res.json(updated);
    } catch (err: any) {
      log(`Error pinning thread: ${err.message}`, "threads");
      res.status(500).json({ error: "Failed to update thread" });
    }
  });

  app.get("/api/drilldown", async (req, res) => {
    try {
      const clientId =
        (req.query.client_id as string) || await getDefaultClientId();
      const page = parseInt((req.query.page as string) || "1", 10);
      const pageSize = parseInt(
        (req.query.page_size as string) || "25",
        10
      );

      let filters: any = {};
      if (req.query.filters) {
        try {
          filters = JSON.parse(req.query.filters as string);
        } catch {
          return res.status(400).json({ error: "Invalid filters JSON" });
        }
      }

      if (req.query.metric) {
        filters.metric = req.query.metric;
      }
      if (req.query.time_range) {
        try {
          const tr = JSON.parse(req.query.time_range as string);
          if (tr.start) filters.start_date = tr.start;
          if (tr.end) filters.end_date = tr.end;
        } catch {}
      }

      const result = await storage.getDrilldownClaims(
        clientId,
        filters,
        page,
        pageSize
      );
      res.json(result);
    } catch (err: any) {
      log(`Error in drilldown: ${err.message}`, "drilldown");
      res.status(500).json({ error: "Failed to load drilldown data" });
    }
  });

  return httpServer;
}
