import { Router, Request, Response } from 'express';
import { anomalyDetector } from '../engine/anomalyDetector.js';
import { supabase } from '../config/supabase.js';

/**
 * Anomaly detection and alert management route handlers
 * Provides endpoints for querying anomalies and managing alert rules
 */
export const anomaliesRouter = Router();

/**
 * GET /api/anomalies
 * Lists recent anomaly events with filtering and pagination
 *
 * Query parameters:
 * - client_id: Client ID (required)
 * - metric: Optional metric slug to filter by
 * - severity: Optional severity filter (info, warning, critical)
 * - from_date: Optional start date (YYYY-MM-DD)
 * - to_date: Optional end date (YYYY-MM-DD)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 *
 * Response:
 * - 200: Anomalies retrieved successfully
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.get('/api/anomalies', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const metric = req.query.metric as string | undefined;
    const severity = req.query.severity as string | undefined;
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Validate severity parameter
    if (severity && !['info', 'warning', 'critical'].includes(severity)) {
      return res.status(400).json({
        error: 'Invalid severity',
        message: 'Severity must be info, warning, or critical',
      });
    }

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
      .from('anomaly_events')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId);

    if (metric) {
      query = query.eq('metric_slug', metric);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (fromDate) {
      query = query.gte('detected_at', `${fromDate}T00:00:00`);
    }

    if (toDate) {
      query = query.lte('detected_at', `${toDate}T23:59:59`);
    }

    const { data: anomalies, count, error } = await query
      .order('detected_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: anomalies.map(anomaly => ({
        id: anomaly.id,
        metricSlug: anomaly.metric_slug,
        direction: anomaly.direction,
        zScore: anomaly.z_score,
        currentValue: anomaly.current_value,
        baselineMean: anomaly.baseline_mean,
        baselineStdDev: anomaly.baseline_std_dev,
        severity: anomaly.severity,
        detectedAt: anomaly.detected_at,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve anomalies:', error);
    res.status(500).json({
      error: 'Failed to retrieve anomalies',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/anomalies/detect
 * Triggers an anomaly detection scan for the client
 *
 * Query parameters:
 * - client_id: Client ID (required)
 * - metrics: Optional comma-separated list of metric slugs to scan
 * - lookback_days: Optional lookback period (default: 30)
 * - threshold: Optional z-score threshold (default: 2.0)
 *
 * Response:
 * - 200: Detection completed successfully
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.get('/api/anomalies/detect', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const metricsParam = req.query.metrics as string | undefined;
    const lookbackDays = parseInt(req.query.lookback_days as string) || 30;
    const threshold = parseFloat(req.query.threshold as string) || 2.0;

    // Validate parameters
    if (lookbackDays < 3 || lookbackDays > 365) {
      return res.status(400).json({
        error: 'Invalid lookback_days',
        message: 'Must be between 3 and 365 days',
      });
    }

    if (threshold < 1 || threshold > 5) {
      return res.status(400).json({
        error: 'Invalid threshold',
        message: 'Must be between 1.0 and 5.0',
      });
    }

    const metricSlugs = metricsParam ? metricsParam.split(',').map(s => s.trim()) : undefined;

    // Run detection
    const anomalies = await anomalyDetector.detectAnomalies(clientId, {
      metricSlugs,
      lookbackDays,
      threshold,
    });

    // Count by severity
    const severityCount = {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      info: anomalies.filter(a => a.severity === 'info').length,
    };

    res.json({
      success: true,
      data: {
        detectionTime: new Date(),
        anomaliesDetected: anomalies.length,
        severityBreakdown: severityCount,
        anomalies: anomalies.slice(0, 10).map(a => ({
          metricSlug: a.metricSlug,
          direction: a.direction,
          zScore: a.zScore,
          currentValue: a.currentValue,
          baselineMean: a.baselineMean,
          severity: a.severity,
        })),
      },
    });
  } catch (error) {
    console.error('Anomaly detection failed:', error);
    res.status(500).json({
      error: 'Anomaly detection failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/alert-rules
 * Lists user's alert rules
 *
 * Query parameters:
 * - client_id: Client ID (required)
 * - active_only: Optional boolean to filter to active rules only
 *
 * Response:
 * - 200: Alert rules retrieved successfully
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.get('/api/alert-rules', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const activeOnly = req.query.active_only === 'true';

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    let query = supabase
      .from('alert_rules')
      .select('*')
      .eq('client_id', clientId)
      .eq('deleted_at', null);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: rules, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    res.json({
      success: true,
      data: rules.map(rule => ({
        id: rule.id,
        name: rule.name,
        metricSlug: rule.metric_slug,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
        notificationChannels: rule.notification_channels,
        createdAt: rule.created_at,
      })),
    });
  } catch (error) {
    console.error('Failed to retrieve alert rules:', error);
    res.status(500).json({
      error: 'Failed to retrieve alert rules',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/alert-rules
 * Creates a new alert rule
 *
 * Body:
 * - name: Rule name
 * - metricSlug: Metric to monitor
 * - condition: Condition type (exceeds, below, anomaly)
 * - threshold: Threshold value
 * - severity: Alert severity (info, warning, critical)
 * - notificationChannels: Array of channels (email, slack, webhook)
 *
 * Response:
 * - 201: Rule created successfully
 * - 400: Invalid input
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.post('/api/alert-rules', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const { name, metricSlug, condition, threshold, severity, notificationChannels } = req.body;

    // Validate required fields
    if (!name || !metricSlug || !condition || threshold === undefined) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'name, metricSlug, condition, and threshold are required',
      });
    }

    // Validate condition
    if (!['exceeds', 'below', 'anomaly'].includes(condition)) {
      return res.status(400).json({
        error: 'Invalid condition',
        message: 'Condition must be exceeds, below, or anomaly',
      });
    }

    // Validate severity
    if (severity && !['info', 'warning', 'critical'].includes(severity)) {
      return res.status(400).json({
        error: 'Invalid severity',
        message: 'Severity must be info, warning, or critical',
      });
    }

    const { data: rule, error } = await supabase
      .from('alert_rules')
      .insert([
        {
          client_id: clientId,
          name,
          metric_slug: metricSlug,
          condition,
          threshold,
          severity: severity || 'warning',
          notification_channels: notificationChannels || [],
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        metricSlug: rule.metric_slug,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
        createdAt: rule.created_at,
      },
    });
  } catch (error) {
    console.error('Failed to create alert rule:', error);
    res.status(500).json({
      error: 'Failed to create alert rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/alert-rules/:id
 * Updates an alert rule
 *
 * Path parameters:
 * - id: Rule ID
 *
 * Body: Any of the following fields
 * - name: Rule name
 * - condition: Condition type
 * - threshold: Threshold value
 * - severity: Alert severity
 * - isActive: Boolean to enable/disable
 * - notificationChannels: Array of channels
 *
 * Response:
 * - 200: Rule updated successfully
 * - 400: Invalid input
 * - 404: Rule not found
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.patch('/api/alert-rules/:id', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const ruleId = req.params.id as string;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const updates: Record<string, unknown> = {};

    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.condition !== undefined) updates.condition = req.body.condition;
    if (req.body.threshold !== undefined) updates.threshold = req.body.threshold;
    if (req.body.severity !== undefined) updates.severity = req.body.severity;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;
    if (req.body.notificationChannels !== undefined) {
      updates.notification_channels = req.body.notificationChannels;
    }

    const { data: rule, error } = await supabase
      .from('alert_rules')
      .update(updates)
      .eq('id', ruleId)
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: `Alert rule ${ruleId} not found`,
        });
      }
      throw new Error(`Failed to update alert rule: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        metricSlug: rule.metric_slug,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        isActive: rule.is_active,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to update alert rule:', error);
    res.status(500).json({
      error: 'Failed to update alert rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/alert-rules/:id
 * Soft-deletes an alert rule
 *
 * Path parameters:
 * - id: Rule ID
 *
 * Query parameters:
 * - client_id: Client ID (required)
 *
 * Response:
 * - 204: Rule deleted successfully
 * - 404: Rule not found
 * - 401: Unauthorized
 * - 500: Server error
 */
anomaliesRouter.delete('/api/alert-rules/:id', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const ruleId = req.params.id as string;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const { error } = await supabase
      .from('alert_rules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ruleId)
      .eq('client_id', clientId);

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: `Alert rule ${ruleId} not found`,
        });
      }
      throw new Error(`Failed to delete alert rule: ${error.message}`);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete alert rule:', error);
    res.status(500).json({
      error: 'Failed to delete alert rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default anomaliesRouter;
