import { Router, Request, Response } from "express";
import multer from "multer";
import { supabase } from "../config/supabase";
import { parsePDF } from "../ingestion/pdfParser";
import { extractClaims } from "../ingestion/claimExtractor";
import { getDefaultClientId } from "../config/defaults";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const ingestionRouter = Router();

async function processDocumentAsync(
  clientId: string,
  jobId: string,
  fileBuffer: Buffer
): Promise<void> {
  try {
    const pdfData = await parsePDF(fileBuffer);
    const extractedClaims = await extractClaims(pdfData.text, clientId);

    const claimsToInsert = extractedClaims.map((claim) => ({
      client_id: clientId,
      claim_number: claim.claimNumber,
      claimant_name: claim.claimantName,
      peril: claim.claimType || "other",
      severity: claim.severity || "medium",
      status: "open",
      current_stage: claim.stage || "fnol",
      fnol_date: claim.dateReported || claim.dateOfLoss || new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from("claims")
      .insert(claimsToInsert);

    if (insertError) {
      throw new Error(`Failed to insert claims: ${insertError.message}`);
    }

    const { error: jobError } = await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        extraction_results: {
          total_records: extractedClaims.length,
          successful_records: extractedClaims.filter((c) => c.confidenceScore >= 0.7)
            .length,
          failed_records: extractedClaims.filter((c) => c.confidenceScore < 0.7)
            .length,
          average_confidence:
            extractedClaims.reduce((s, c) => s + c.confidenceScore, 0) /
            (extractedClaims.length || 1),
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (jobError) {
      console.error("Failed to update job status:", jobError.message);
    }
  } catch (error) {
    console.error(`Processing failed for job ${jobId}:`, error);
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw error;
  }
}

ingestionRouter.post(
  "/api/ingest/pdf",
  upload.single("document"),
  async (req: Request, res: Response) => {
    try {
      const clientId =
        (req.query.client_id as string) || DEFAULT_CLIENT_ID;

      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({
          error: "Invalid input",
          message: 'No PDF file provided (use form field "document")',
        });
      }

      if (file.mimetype !== "application/pdf") {
        return res.status(415).json({
          error: "Unsupported file type",
          message: "Only PDF files are supported",
        });
      }

      const { data: ingestionJob, error: jobError } = await supabase
        .from("ingestion_jobs")
        .insert([
          {
            client_id: clientId,
            document_name: file.originalname,
            document_size: file.size,
            status: "processing",
            started_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (jobError) {
        throw new Error(`Failed to create ingestion job: ${jobError.message}`);
      }

      processDocumentAsync(clientId, ingestionJob.id, file.buffer).catch((err) =>
        console.error("Async processing failed:", err)
      );

      res.status(202).json({
        success: true,
        data: {
          jobId: ingestionJob.id,
          status: "processing",
          documentName: ingestionJob.document_name,
          message:
            "Document accepted for processing. Check /api/ingest/status/{jobId} for progress.",
        },
      });
    } catch (error) {
      console.error("PDF ingestion failed:", error);
      res.status(500).json({
        error: "PDF ingestion failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

ingestionRouter.get("/api/ingest/status/:jobId", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const jobId = req.params.jobId;

    const { data: job, error } = await supabase
      .from("ingestion_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("client_id", clientId)
      .single();

    if (error || !job) {
      return res.status(404).json({
        error: "Not found",
        message: `Ingestion job ${jobId} not found`,
      });
    }

    const { count } = await supabase
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        documentName: job.document_name,
        documentSize: job.document_size,
        claimsExtracted: count || 0,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        extractionResults: job.extraction_results,
        errorMessage: job.error_message,
      },
    });
  } catch (error) {
    console.error("Failed to get ingestion status:", error);
    res.status(500).json({
      error: "Failed to get ingestion status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

ingestionRouter.get("/api/ingest/jobs", async (req: Request, res: Response) => {
  try {
    const clientId =
      (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));

    const offset = (page - 1) * limit;

    let query = supabase
      .from("ingestion_jobs")
      .select("*", { count: "exact" })
      .eq("client_id", clientId);

    if (status && ["processing", "completed", "failed"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data: jobs, count, error } = await query
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: (jobs || []).map((j: any) => ({
        jobId: j.id,
        documentName: j.document_name,
        status: j.status,
        documentSize: j.document_size,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        errorMessage: j.error_message,
      })),
      pagination: { page, limit, totalCount, totalPages },
    });
  } catch (error) {
    console.error("Failed to list ingestion jobs:", error);
    res.status(500).json({
      error: "Failed to list ingestion jobs",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
