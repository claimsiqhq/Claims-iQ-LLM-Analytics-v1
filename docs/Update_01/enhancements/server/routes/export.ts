import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

/**
 * Export route handlers for chart data and analytics
 * Provides endpoints for exporting data in CSV and JSON formats
 */
export const exportRouter = Router();

/**
 * Converts an array of objects to CSV format
 */
function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(h => escapeCSVField(String(h))).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      return escapeCSVField(String(value));
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Escapes a field value for CSV format
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * GET /api/export/csv
 * Exports chart data as CSV
 *
 * Query parameters:
 * - thread_id: Optional thread ID to filter data
 * - turn_id: Optional turn ID to filter data
 * - client_id: Client ID (required)
 * - include_metadata: Optional boolean to include metadata columns
 *
 * Response:
 * - 200: CSV data with attachment header
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 404: Data not found
 * - 500: Server error
 */
exportRouter.get('/api/export/csv', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const threadId = req.query.thread_id as string | undefined;
    const turnId = req.query.turn_id as string | undefined;
    const includeMetadata = req.query.include_metadata === 'true';

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    let query = supabase
      .from('chart_data')
      .select('*')
      .eq('client_id', clientId);

    if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    if (turnId) {
      query = query.eq('turn_id', turnId);
    }

    const { data: chartData, error } = await query.order('created_at', {
      ascending: true,
    });

    if (error) {
      throw new Error(`Data retrieval failed: ${error.message}`);
    }

    if (!chartData || chartData.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'No chart data found for the specified filters',
      });
    }

    // Prepare export data
    const exportData = chartData.map(row => {
      const obj: Record<string, unknown> = {
        timestamp: row.created_at,
        metric: row.metric_slug,
        value: row.value,
      };

      if (row.dimension_values) {
        Object.entries(row.dimension_values).forEach(([key, value]) => {
          obj[`dimension_${key}`] = value;
        });
      }

      if (includeMetadata) {
        obj.threadId = row.thread_id;
        obj.turnId = row.turn_id;
        obj.chartType = row.chart_type;
      }

      return obj;
    });

    // Convert to CSV
    const csv = convertToCSV(exportData);

    // Set response headers
    const fileName = `claims-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    res.send(csv);
  } catch (error) {
    console.error('CSV export failed:', error);
    res.status(500).json({
      error: 'CSV export failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/export/json
 * Exports raw chart data as JSON
 *
 * Query parameters:
 * - thread_id: Optional thread ID to filter data
 * - turn_id: Optional turn ID to filter data
 * - client_id: Client ID (required)
 * - pretty: Optional boolean to pretty-print JSON (default: false)
 *
 * Response:
 * - 200: JSON data
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 404: Data not found
 * - 500: Server error
 */
exportRouter.get('/api/export/json', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const threadId = req.query.thread_id as string | undefined;
    const turnId = req.query.turn_id as string | undefined;
    const pretty = req.query.pretty === 'true';

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    let query = supabase
      .from('chart_data')
      .select('*')
      .eq('client_id', clientId);

    if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    if (turnId) {
      query = query.eq('turn_id', turnId);
    }

    const { data: chartData, error } = await query.order('created_at', {
      ascending: true,
    });

    if (error) {
      throw new Error(`Data retrieval failed: ${error.message}`);
    }

    if (!chartData || chartData.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'No chart data found for the specified filters',
      });
    }

    // Prepare export structure
    const exportData = {
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        clientId,
        rowCount: chartData.length,
        filters: {
          threadId: threadId || null,
          turnId: turnId || null,
        },
      },
      data: chartData.map(row => ({
        timestamp: row.created_at,
        metric: row.metric_slug,
        value: row.value,
        dimensionValues: row.dimension_values || {},
        chartType: row.chart_type,
        threadId: row.thread_id,
        turnId: row.turn_id,
      })),
    };

    // Set response headers
    const fileName = `claims-export-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    if (pretty) {
      res.send(JSON.stringify(exportData, null, 2));
    } else {
      res.send(JSON.stringify(exportData));
    }
  } catch (error) {
    console.error('JSON export failed:', error);
    res.status(500).json({
      error: 'JSON export failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/export/status
 * Gets export operation status (for async exports)
 *
 * Query parameters:
 * - export_id: Export operation ID
 * - client_id: Client ID (required)
 *
 * Response:
 * - 200: Export status
 * - 404: Export not found
 * - 401: Unauthorized
 * - 500: Server error
 */
exportRouter.get('/api/export/status', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const exportId = req.query.export_id as string;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    if (!exportId) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'export_id is required',
      });
    }

    const { data: exportStatus, error } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', exportId)
      .eq('client_id', clientId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: `Export ${exportId} not found`,
        });
      }
      throw new Error(`Status query failed: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        id: exportStatus.id,
        status: exportStatus.status,
        progress: exportStatus.progress,
        rowsProcessed: exportStatus.rows_processed,
        totalRows: exportStatus.total_rows,
        downloadUrl: exportStatus.status === 'completed' ? exportStatus.download_url : null,
        createdAt: exportStatus.created_at,
        completedAt: exportStatus.completed_at,
      },
    });
  } catch (error) {
    console.error('Failed to get export status:', error);
    res.status(500).json({
      error: 'Failed to get export status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default exportRouter;
