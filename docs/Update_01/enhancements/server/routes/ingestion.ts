import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { parsePDF } from '../ingestion/pdfParser.js';
import { extractClaims } from '../ingestion/claimExtractor.js';

/**
 * Document ingestion route handlers
 * Provides endpoints for uploading and processing claim documents
 */
export const ingestionRouter = Router();

/**
 * POST /api/ingest/pdf
 * Uploads and processes a PDF claim document
 *
 * Query parameters:
 * - client_id: Client ID (required)
 *
 * Body: multipart/form-data
 * - document: PDF file (required)
 *
 * Response:
 * - 202: Document accepted for processing
 * - 400: Invalid input
 * - 401: Unauthorized
 * - 413: File too large (max 50MB)
 * - 415: Unsupported file type
 * - 500: Server error
 */
ingestionRouter.post('/api/ingest/pdf', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'No PDF file provided in request body (use form field "document")',
      });
    }

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(415).json({
        error: 'Unsupported file type',
        message: 'Only PDF files are supported',
      });
    }

    // Validate file size (max 50MB)
    const maxSizeBytes = 50 * 1024 * 1024;
    if (req.file.size > maxSizeBytes) {
      return res.status(413).json({
        error: 'File too large',
        message: `Maximum file size is 50MB, received ${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      });
    }

    // Create ingestion job record
    const { data: ingestionJob, error: jobError } = await supabase
      .from('ingestion_jobs')
      .insert([
        {
          client_id: clientId,
          document_name: req.file.originalname,
          document_size: req.file.size,
          status: 'processing',
          started_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create ingestion job: ${jobError.message}`);
    }

    // Start asynchronous processing
    // In a production system, this would be queued to a job processor
    processDocumentAsync(clientId, ingestionJob.id, req.file.buffer).catch(error => {
      console.error(`Async processing failed for job ${ingestionJob.id}:`, error);
      // Update job status on failure
      supabase
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', ingestionJob.id)
        .catch(err => console.error('Failed to update job status:', err));
    });

    res.status(202).json({
      success: true,
      data: {
        jobId: ingestionJob.id,
        status: 'processing',
        documentName: ingestionJob.document_name,
        message: 'Document accepted for processing. Check /api/ingest/status/{jobId} for progress.',
      },
    });
  } catch (error) {
    console.error('PDF ingestion failed:', error);
    res.status(500).json({
      error: 'PDF ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ingest/status/:jobId
 * Checks the processing status of an ingestion job
 *
 * Path parameters:
 * - jobId: Ingestion job ID
 *
 * Query parameters:
 * - client_id: Client ID (required)
 *
 * Response:
 * - 200: Job status retrieved
 * - 404: Job not found
 * - 401: Unauthorized
 * - 500: Server error
 */
ingestionRouter.get('/api/ingest/status/:jobId', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const jobId = req.params.jobId as string;

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const { data: job, error } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('client_id', clientId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: `Ingestion job ${jobId} not found`,
        });
      }
      throw new Error(`Status query failed: ${error.message}`);
    }

    // Get extracted claims count
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('id', { count: 'exact' })
      .eq('ingestion_job_id', jobId);

    let claimCount = 0;
    if (!claimsError && claims) {
      claimCount = claims.length;
    }

    const response: Record<string, unknown> = {
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        documentName: job.document_name,
        documentSize: job.document_size,
        claimsExtracted: claimCount,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      },
    };

    // Add extraction results if completed
    if (job.status === 'completed' && job.extraction_results) {
      response.data = {
        ...response.data,
        extractionResults: {
          totalRecords: job.extraction_results.total_records,
          successfulRecords: job.extraction_results.successful_records,
          failedRecords: job.extraction_results.failed_records,
          averageConfidence: job.extraction_results.average_confidence,
        },
      };
    }

    // Add error if failed
    if (job.status === 'failed') {
      response.data = {
        ...response.data,
        errorMessage: job.error_message,
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Failed to get ingestion status:', error);
    res.status(500).json({
      error: 'Failed to get ingestion status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ingest/jobs
 * Lists ingestion jobs for a client
 *
 * Query parameters:
 * - client_id: Client ID (required)
 * - status: Optional status filter (processing, completed, failed)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 *
 * Response:
 * - 200: Jobs retrieved successfully
 * - 401: Unauthorized
 * - 500: Server error
 */
ingestionRouter.get('/api/ingest/jobs', async (req: Request, res: Response) => {
  try {
    const clientId = req.query.client_id as string || req.user?.clientId;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    if (!clientId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No client ID provided or authenticated',
      });
    }

    const offset = (page - 1) * limit;

    let query = supabase
      .from('ingestion_jobs')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId);

    if (status && ['processing', 'completed', 'failed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: jobs, count, error } = await query
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: jobs.map(job => ({
        jobId: job.id,
        documentName: job.document_name,
        status: job.status,
        documentSize: job.document_size,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to list ingestion jobs:', error);
    res.status(500).json({
      error: 'Failed to list ingestion jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Processes a document asynchronously
 * In production, this would be triggered by a background job processor
 */
async function processDocumentAsync(
  clientId: string,
  jobId: string,
  fileBuffer: Buffer
): Promise<void> {
  try {
    // Parse PDF
    const pdfData = await parsePDF(fileBuffer);

    // Extract claims using LLM
    const extractedClaims = await extractClaims(pdfData.text, clientId);

    // Insert claims into database
    const claimsToInsert = extractedClaims.map(claim => ({
      client_id: clientId,
      ingestion_job_id: jobId,
      claim_number: claim.claimNumber,
      claimant_name: claim.claimantName,
      claim_type: claim.claimType,
      claim_amount: claim.claimAmount,
      date_of_loss: claim.dateOfLoss,
      date_reported: claim.dateReported,
      stage: claim.stage,
      priority: claim.priority,
      severity: claim.severity,
      description: claim.description,
      extracted_data: claim.extractedData,
      confidence_score: claim.confidenceScore,
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('claims')
      .insert(claimsToInsert);

    if (insertError) {
      throw new Error(`Failed to insert claims: ${insertError.message}`);
    }

    // Calculate extraction statistics
    const successfulRecords = extractedClaims.filter(c => c.confidenceScore >= 0.7).length;
    const averageConfidence =
      extractedClaims.reduce((sum, c) => sum + c.confidenceScore, 0) / extractedClaims.length;

    // Update job status
    await supabase
      .from('ingestion_jobs')
      .update({
        status: 'completed',
        extraction_results: {
          total_records: extractedClaims.length,
          successful_records: successfulRecords,
          failed_records: extractedClaims.length - successfulRecords,
          average_confidence: averageConfidence,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(
      `Job ${jobId} completed: ${extractedClaims.length} claims extracted with ${averageConfidence.toFixed(2)} average confidence`
    );
  } catch (error) {
    console.error(`Processing failed for job ${jobId}:`, error);
    throw error;
  }
}

export default ingestionRouter;
