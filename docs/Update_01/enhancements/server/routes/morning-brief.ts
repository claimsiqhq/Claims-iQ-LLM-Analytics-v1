import { Router, Request, Response } from 'express';
import { morningBriefGenerator } from '../engine/morningBrief.js';
import { supabase } from '../config/supabase.js';

/**
 * Morning brief route handlers
 * Provides endpoints for generating and retrieving morning intelligence briefs
 */
export const morningBriefRouter = Router();

/**
 * GET /api/morning-brief
 * Generates or retrieves today's morning brief for the authenticated user's client
 *
 * Query parameters:
 * - client_id: Optional, uses authenticated user's client if not provided
 *
 * Response:
 * - 200: Brief generated/retrieved successfully
 * - 400: Invalid request
 * - 401: Unauthorized
 * - 500: Server error
 */
morningBriefRouter.get('/api/morning-brief', async (req: Request, res: Response) => {
  try {
    // Get client ID from request (would come from auth context in real app)
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    // Get user ID from auth context
    const userId = req.user?.userId || 'anonymous';

    // Generate morning brief
    const brief = await morningBriefGenerator.generateMorningBrief(clientId, userId);

    res.json({
      success: true,
      data: {
        briefDate: brief.briefDate,
        content: brief.content,
        metricsSnapshot: {
          queueDepth: brief.metricsSnapshot.queueDepth,
          slaBreachRate: brief.metricsSnapshot.slaBreachRate,
          claimsReceivedToday: brief.metricsSnapshot.claimsReceivedToday,
          claimsReceivedYesterday: brief.metricsSnapshot.claimsReceivedYesterday,
          anomalyCount: brief.metricsSnapshot.topAnomalies.length,
          slaRiskCount: brief.metricsSnapshot.topSlaRisks.length,
        },
        anomalyCount: brief.anomalyCount,
        generatedAt: brief.generatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to generate morning brief:', error);
    res.status(500).json({
      error: 'Failed to generate morning brief',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/morning-brief/history
 * Lists historical morning briefs with pagination
 *
 * Query parameters:
 * - client_id: Client ID (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 50)
 * - from_date: Optional start date (YYYY-MM-DD)
 * - to_date: Optional end date (YYYY-MM-DD)
 *
 * Response:
 * - 200: Briefs retrieved successfully
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 500: Server error
 */
morningBriefRouter.get('/api/morning-brief/history', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;

    // Validate date parameters
    if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return res.status(400).json({
        error: 'Invalid from_date format',
        message: 'Expected YYYY-MM-DD format',
      });
    }

    if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({
        error: 'Invalid to_date format',
        message: 'Expected YYYY-MM-DD format',
      });
    }

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('morning_briefs')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId);

    if (fromDate) {
      query = query.gte('brief_date', fromDate);
    }

    if (toDate) {
      query = query.lte('brief_date', toDate);
    }

    const { data: briefs, count, error } = await query
      .order('brief_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: briefs.map(brief => ({
        briefDate: brief.brief_date,
        content: brief.content.substring(0, 500) + (brief.content.length > 500 ? '...' : ''),
        metricsSnapshot: brief.metrics_snapshot,
        anomalyCount: brief.anomaly_count,
        generatedAt: brief.generated_at,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve brief history:', error);
    res.status(500).json({
      error: 'Failed to retrieve brief history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/morning-brief/:briefDate
 * Retrieves a specific morning brief by date
 *
 * Path parameters:
 * - briefDate: Date in YYYY-MM-DD format
 *
 * Query parameters:
 * - client_id: Client ID (required)
 *
 * Response:
 * - 200: Brief retrieved successfully
 * - 404: Brief not found
 * - 401: Unauthorized
 * - 500: Server error
 */
morningBriefRouter.get('/api/morning-brief/:briefDate', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const briefDate = req.params.briefDate as string;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
      return res.status(400).json({
        error: 'Invalid brief_date format',
        message: 'Expected YYYY-MM-DD format',
      });
    }

    const { data: brief, error } = await supabase
      .from('morning_briefs')
      .select('*')
      .eq('client_id', clientId)
      .eq('brief_date', briefDate)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: `No brief found for date ${briefDate}`,
        });
      }
      throw new Error(`Database query failed: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        briefDate: brief.brief_date,
        content: brief.content,
        metricsSnapshot: brief.metrics_snapshot,
        anomalyCount: brief.anomaly_count,
        generatedAt: brief.generated_at,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve brief:', error);
    res.status(500).json({
      error: 'Failed to retrieve brief',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default morningBriefRouter;
