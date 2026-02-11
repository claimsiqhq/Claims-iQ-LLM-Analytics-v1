import { callLLM } from "../llm/adapter";

export interface ExtractedClaim {
  claimNumber: string;
  claimantName: string;
  claimType: string;
  claimAmount: number;
  dateOfLoss: string;
  dateReported: string;
  stage: string;
  priority: string;
  severity: string;
  description: string;
  extractedData: Record<string, unknown>;
  confidenceScore: number;
}

interface RawClaimData {
  claim_number?: string;
  claimNumber?: string;
  claimant_name?: string;
  claimantName?: string;
  claim_type?: string;
  claimType?: string;
  claim_amount?: number | string;
  claimAmount?: number | string;
  date_of_loss?: string;
  dateOfLoss?: string;
  date_reported?: string;
  dateReported?: string;
  stage?: string;
  priority?: string;
  severity?: string;
  description?: string;
  confidence_score?: number | string;
  confidenceScore?: number | string;
  [key: string]: unknown;
}

export async function extractClaims(
  pdfText: string,
  clientId: string
): Promise<ExtractedClaim[]> {
  try {
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error("PDF text is empty");
    }

    const maxChars = 50000;
    const truncatedText =
      pdfText.length > maxChars ? pdfText.substring(0, maxChars) : pdfText;

    const systemPrompt = `You are an expert claims processing assistant. Extract structured claim information from insurance claim documents.
Extract ALL claims. For each: claim number, claimant name, claim type, claim amount (USD), date of loss (YYYY-MM-DD), date reported (YYYY-MM-DD), stage (fnol/investigation/evaluation/negotiation/settlement/closed), priority (low/medium/high/critical), severity (low/medium/high/critical), description (2-3 sentence summary).
Return ONLY valid JSON: {"claims": [{"claimNumber":"","claimantName":"","claimType":"","claimAmount":0,"dateOfLoss":"","dateReported":"","stage":"","priority":"","severity":"","description":"","confidenceScore":0.9,"extractedData":{}}]}
If no claims found: {"claims": []}`;

    const userMessage = `Client ID: ${clientId}\n\nExtract all claims from:\n---\n${truncatedText}\n---\n\nReturn ONLY valid JSON.`;

    const response = await callLLM(systemPrompt, userMessage);
    const rawClaims = parseExtractionResponse(response.content);

    const extractedClaims = rawClaims
      .map((raw) => {
        try {
          return normalizeClaim(raw);
        } catch {
          return null;
        }
      })
      .filter((c): c is ExtractedClaim => c !== null);

    return extractedClaims;
  } catch (error) {
    console.error("Claim extraction failed:", error);
    throw error;
  }
}

function parseExtractionResponse(response: string): RawClaimData[] {
  try {
    const parsed = JSON.parse(response);
    if (parsed.claims && Array.isArray(parsed.claims)) return parsed.claims;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[1]);
      if (p.claims && Array.isArray(p.claims)) return p.claims;
    }
    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const p = JSON.parse(objMatch[0]);
      if (p.claims && Array.isArray(p.claims)) return p.claims;
    }
  } catch {}
  return [];
}

function normalizeClaim(raw: RawClaimData): ExtractedClaim {
  const getStr = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const getNum = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "number" && !isNaN(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
        if (!isNaN(n)) return n;
      }
    }
    return 0;
  };
  const claimNumber = getStr("claimNumber", "claim_number");
  const claimantName = getStr("claimantName", "claimant_name");
  if (!claimNumber || !claimantName) {
    throw new Error("Claim number and claimant name required");
  }
  const dateOfLoss = getStr("dateOfLoss", "date_of_loss") || "2024-01-01";
  const dateReported = getStr("dateReported", "date_reported") || dateOfLoss;
  const conf = getNum("confidenceScore", "confidence_score") || 0.5;

  return {
    claimNumber,
    claimantName,
    claimType: getStr("claimType", "claim_type") || "other",
    claimAmount: getNum("claimAmount", "claim_amount"),
    dateOfLoss,
    dateReported,
    stage: getStr("stage") || "fnol",
    priority: getStr("priority") || "medium",
    severity: getStr("severity") || "medium",
    description: getStr("description") || "Extracted from document",
    extractedData: {},
    confidenceScore: Math.min(1, Math.max(0, conf)),
  };
}
