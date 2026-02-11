import { callLLM } from '../llm/adapter.js';

/**
 * Extracted claim record ready for database insertion
 */
export interface ExtractedClaim {
  claimNumber: string;
  claimantName: string;
  claimType: string;
  claimAmount: number;
  dateOfLoss: string; // ISO 8601 date
  dateReported: string; // ISO 8601 date
  stage: 'fnol' | 'investigation' | 'evaluation' | 'negotiation' | 'settlement' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  extractedData: Record<string, unknown>;
  confidenceScore: number; // 0.0 to 1.0
}

/**
 * Raw claim data returned from LLM
 */
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

/**
 * LLM-based claim extraction engine
 *
 * Uses Claude to extract structured claim information from unstructured PDF text
 * and normalizes the results into database-ready format.
 */

/**
 * Extracts claims from PDF text using LLM
 *
 * @param pdfText - Extracted text from PDF document
 * @param clientId - Client ID for context
 * @returns Array of extracted and normalized claim records
 * @throws Error if extraction fails
 */
export async function extractClaims(pdfText: string, clientId: string): Promise<ExtractedClaim[]> {
  try {
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('PDF text is empty');
    }

    // Limit text to avoid token overflow (last 50k characters)
    const maxChars = 50000;
    const truncatedText = pdfText.length > maxChars ? pdfText.substring(0, maxChars) : pdfText;

    // Build extraction prompt
    const systemPrompt = buildExtractionSystemPrompt();
    const userMessage = buildExtractionUserMessage(truncatedText, clientId);

    // Call LLM
    const response = await callLLM(systemPrompt, userMessage);

    // Parse response
    const rawClaims = parseExtractionResponse(response.content);

    // Normalize and validate
    const extractedClaims = rawClaims.map((rawClaim, index) => {
      try {
        return normalizeClaim(rawClaim);
      } catch (error) {
        console.warn(
          `Failed to normalize claim ${index + 1}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Return null for failed claims, will be filtered out
        return null;
      }
    });

    // Filter out failed claims and return
    const validClaims = extractedClaims.filter((claim): claim is ExtractedClaim => claim !== null);

    if (validClaims.length === 0) {
      console.warn('No valid claims extracted from PDF');
    }

    return validClaims;
  } catch (error) {
    console.error('Claim extraction failed:', error);
    throw error;
  }
}

/**
 * Builds the system prompt for claim extraction
 */
function buildExtractionSystemPrompt(): string {
  return `You are an expert claims processing assistant. Your task is to extract structured claim information from insurance claim documents.

Extract ALL claims found in the document. For each claim, identify and extract:
- Claim number (reference ID)
- Claimant name (person or entity filing the claim)
- Claim type (auto, property, health, liability, workers_comp, other)
- Claim amount (in USD, as a number)
- Date of loss (YYYY-MM-DD format)
- Date reported (YYYY-MM-DD format)
- Stage (fnol, investigation, evaluation, negotiation, settlement, closed)
- Priority (low, medium, high, critical)
- Severity (low, medium, high, critical)
- Description (2-3 sentence summary)

IMPORTANT: Return your response as valid JSON only, in this exact format:
{
  "claims": [
    {
      "claimNumber": "CLM-2024-001",
      "claimantName": "John Doe",
      "claimType": "auto",
      "claimAmount": 5000,
      "dateOfLoss": "2024-01-15",
      "dateReported": "2024-01-16",
      "stage": "investigation",
      "priority": "high",
      "severity": "high",
      "description": "Multi-vehicle collision on Highway 101...",
      "confidenceScore": 0.95,
      "extractedData": {
        "vin": "1HGCV1F32HL123456",
        "policyNumber": "POL-123456",
        "agentName": "Jane Smith"
      }
    }
  ]
}

If you cannot find any claims, return: {"claims": []}

Do NOT include any explanatory text outside the JSON.`;
}

/**
 * Builds the user message for extraction
 */
function buildExtractionUserMessage(pdfText: string, clientId: string): string {
  return `Client ID: ${clientId}

Please extract all claims from this document:

---
${pdfText}
---

Return ONLY valid JSON with no additional text.`;
}

/**
 * Parses the LLM response to extract claims
 */
function parseExtractionResponse(response: string): RawClaimData[] {
  try {
    // Extract JSON from response
    // Try direct parse first
    try {
      const parsed = JSON.parse(response);
      if (parsed.claims && Array.isArray(parsed.claims)) {
        return parsed.claims;
      }
      return [];
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.claims && Array.isArray(parsed.claims)) {
          return parsed.claims;
        }
      }

      // Try to find JSON object pattern
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        const parsed = JSON.parse(objectMatch[0]);
        if (parsed.claims && Array.isArray(parsed.claims)) {
          return parsed.claims;
        }
      }

      console.warn('Could not parse LLM response as JSON');
      return [];
    }
  } catch (error) {
    console.error('JSON parsing error:', error);
    return [];
  }
}

/**
 * Normalizes a raw claim into the standard format
 */
function normalizeClaim(rawClaim: RawClaimData): ExtractedClaim {
  // Extract field values (handle both camelCase and snake_case)
  const claimNumber = getString(rawClaim, ['claimNumber', 'claim_number']);
  const claimantName = getString(rawClaim, ['claimantName', 'claimant_name']);
  const claimType = getString(rawClaim, ['claimType', 'claim_type']);
  const claimAmount = getNumber(rawClaim, ['claimAmount', 'claim_amount']);
  const dateOfLoss = getISODate(rawClaim, ['dateOfLoss', 'date_of_loss']);
  const dateReported = getISODate(rawClaim, ['dateReported', 'date_reported']);
  const stage = getEnumValue(rawClaim, ['stage'], [
    'fnol',
    'investigation',
    'evaluation',
    'negotiation',
    'settlement',
    'closed',
  ]);
  const priority = getEnumValue(rawClaim, ['priority'], ['low', 'medium', 'high', 'critical']);
  const severity = getEnumValue(rawClaim, ['severity'], ['low', 'medium', 'high', 'critical']);
  const description = getString(rawClaim, ['description']);
  const confidenceScore = getConfidenceScore(rawClaim, ['confidenceScore', 'confidence_score']);

  // Validate required fields
  if (!claimNumber) {
    throw new Error('Claim number is required');
  }

  if (!claimantName) {
    throw new Error('Claimant name is required');
  }

  if (!dateOfLoss) {
    throw new Error('Date of loss is required');
  }

  // Extract additional data (any fields not in the standard set)
  const extractedData: Record<string, unknown> = {};
  const standardKeys = new Set([
    'claimNumber',
    'claim_number',
    'claimantName',
    'claimant_name',
    'claimType',
    'claim_type',
    'claimAmount',
    'claim_amount',
    'dateOfLoss',
    'date_of_loss',
    'dateReported',
    'date_reported',
    'stage',
    'priority',
    'severity',
    'description',
    'confidenceScore',
    'confidence_score',
    'extractedData',
    'extracted_data',
  ]);

  for (const [key, value] of Object.entries(rawClaim)) {
    if (!standardKeys.has(key) && value !== undefined && value !== null) {
      extractedData[key] = value;
    }
  }

  return {
    claimNumber,
    claimantName,
    claimType: claimType || 'other',
    claimAmount: claimAmount || 0,
    dateOfLoss,
    dateReported: dateReported || dateOfLoss,
    stage: (stage as any) || 'fnol',
    priority: (priority as any) || 'medium',
    severity: (severity as any) || 'medium',
    description: description || 'Claim extracted from document',
    extractedData,
    confidenceScore,
  };
}

/**
 * Helper: Get string value from object with fallback keys
 */
function getString(obj: Record<string, unknown>, keys: string[], defaultValue: string = ''): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return defaultValue;
}

/**
 * Helper: Get numeric value from object with fallback keys
 */
function getNumber(obj: Record<string, unknown>, keys: string[], defaultValue: number = 0): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return defaultValue;
}

/**
 * Helper: Get ISO 8601 date from object with fallback keys
 */
function getISODate(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') {
      const normalized = normalizeDate(value);
      if (normalized) {
        return normalized;
      }
    }
  }
  throw new Error(`Could not find valid date in keys: ${keys.join(', ')}`);
}

/**
 * Helper: Get enum value from object with fallback keys
 */
function getEnumValue(
  obj: Record<string, unknown>,
  keys: string[],
  validValues: string[]
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      if (validValues.includes(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

/**
 * Helper: Get confidence score (0-1 range)
 */
function getConfidenceScore(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number') {
      return Math.min(1, Math.max(0, value)); // Clamp to 0-1
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return Math.min(1, Math.max(0, parsed));
      }
    }
  }
  return 0.5; // Default middle confidence
}

/**
 * Normalizes various date formats to ISO 8601 (YYYY-MM-DD)
 */
function normalizeDate(dateString: string): string | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();

  // Already in ISO 8601 format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try common date formats
  const formats = [
    // MM/DD/YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parse: (m: RegExpMatchArray) => `${m[3]}-${pad(m[1])}-${pad(m[2])}` },
    // DD/MM/YYYY
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, parse: (m: RegExpMatchArray) => `${m[3]}-${pad(m[2])}-${pad(m[1])}` },
    // MMMM DD, YYYY or MMM DD, YYYY
    {
      regex: /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
      parse: (m: RegExpMatchArray) => {
        const month = parseMonth(m[1]);
        return month ? `${m[3]}-${month}-${pad(m[2])}` : null;
      },
    },
  ];

  for (const format of formats) {
    const match = trimmed.match(format.regex);
    if (match) {
      const result = format.parse(match);
      if (result && /^\d{4}-\d{2}-\d{2}$/.test(result)) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Parses month name to number (01-12)
 */
function parseMonth(monthName: string): string | null {
  const months: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  return months[monthName.toLowerCase()] || null;
}

/**
 * Pads a number with leading zero
 */
function pad(num: string | number): string {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  return n < 10 ? `0${n}` : String(n);
}
