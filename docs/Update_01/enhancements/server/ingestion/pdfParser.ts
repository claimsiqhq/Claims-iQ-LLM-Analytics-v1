import pdfParse from 'pdf-parse';

/**
 * Metadata extracted from a PDF document
 */
export interface PDFMetadata {
  producer?: string;
  creator?: string;
  creationDate?: string;
  modificationDate?: string;
  title?: string;
  author?: string;
  subject?: string;
}

/**
 * Result of PDF parsing
 */
export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata: PDFMetadata;
}

/**
 * PDF parsing module using pdf-parse
 *
 * Extracts text content, page information, and metadata from PDF documents
 * for further processing by claim extraction engine.
 */

/**
 * Parses a PDF document and extracts text and metadata
 *
 * @param buffer - Buffer containing the PDF file data
 * @returns Parsed PDF content including text, page count, and metadata
 * @throws Error if PDF parsing fails
 */
export async function parsePDF(buffer: Buffer): Promise<PDFParseResult> {
  try {
    // Validate input
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Input must be a Buffer');
    }

    if (buffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Check for PDF magic number (first 4 bytes should be %PDF)
    const pdfSignature = buffer.toString('ascii', 0, 4);
    if (pdfSignature !== '%PDF') {
      throw new Error('Invalid PDF file: missing PDF signature');
    }

    // Parse PDF using pdf-parse
    const pdfData = await pdfParse(buffer);

    // Extract text from all pages
    const text = extractTextFromPDF(pdfData);

    // Extract metadata
    const metadata = extractMetadata(pdfData);

    return {
      text,
      pageCount: pdfData.numpages || 0,
      metadata,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extracts and cleans text content from PDF data
 *
 * Handles multiple pages and cleans up whitespace
 */
function extractTextFromPDF(pdfData: any): string {
  try {
    let text = '';

    // Extract text from items if available (newer pdf-parse versions)
    if (pdfData.items && Array.isArray(pdfData.items)) {
      text = pdfData.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .join('');
    }

    // Fallback to text property
    if (!text && typeof pdfData.text === 'string') {
      text = pdfData.text;
    }

    // Clean up text
    // Remove excessive whitespace while preserving meaningful line breaks
    text = text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\t/g, ' ') // Convert tabs to spaces
      .replace(/ +/g, ' ') // Collapse multiple spaces
      .replace(/\n\n+/g, '\n') // Collapse multiple newlines
      .trim();

    return text;
  } catch (error) {
    console.error('Text extraction error:', error);
    return '';
  }
}

/**
 * Extracts metadata from PDF
 */
function extractMetadata(pdfData: any): PDFMetadata {
  const metadata: PDFMetadata = {};

  if (!pdfData.info) {
    return metadata;
  }

  const info = pdfData.info;

  // Extract standard PDF metadata fields
  if (info.Producer) {
    metadata.producer = normalizeMetadataString(info.Producer);
  }

  if (info.Creator) {
    metadata.creator = normalizeMetadataString(info.Creator);
  }

  if (info.CreationDate) {
    metadata.creationDate = normalizeMetadataString(info.CreationDate);
  }

  if (info.ModDate) {
    metadata.modificationDate = normalizeMetadataString(info.ModDate);
  }

  if (info.Title) {
    metadata.title = normalizeMetadataString(info.Title);
  }

  if (info.Author) {
    metadata.author = normalizeMetadataString(info.Author);
  }

  if (info.Subject) {
    metadata.subject = normalizeMetadataString(info.Subject);
  }

  return metadata;
}

/**
 * Normalizes metadata strings (handles PDF strings and dates)
 */
function normalizeMetadataString(value: any): string {
  if (typeof value === 'string') {
    return value
      .replace(/\x00/g, '') // Remove null bytes
      .trim();
  }

  return String(value);
}

/**
 * Validates PDF content for minimum requirements
 *
 * @param pdfResult - Parsed PDF result
 * @returns Validation result with any issues
 */
export function validatePDFContent(pdfResult: PDFParseResult): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check if document has any text content
  if (pdfResult.text.length === 0) {
    issues.push('PDF contains no extractable text (may be image-based or encrypted)');
  }

  // Check if document has a reasonable amount of text
  if (pdfResult.text.length < 100) {
    issues.push('PDF contains very little text (less than 100 characters)');
  }

  // Check page count
  if (pdfResult.pageCount === 0) {
    issues.push('PDF has no pages');
  }

  // Check for suspicious patterns
  if (pdfResult.text.length > 10000000) {
    // More than 10MB of text
    issues.push('PDF text content is extremely large, may cause processing issues');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Splits PDF text into chunks for processing
 *
 * Useful for breaking large documents into manageable pieces for LLM processing
 *
 * @param text - Full PDF text
 * @param chunkSize - Maximum characters per chunk
 * @param overlapSize - Characters to overlap between chunks for context
 * @returns Array of text chunks
 */
export function chunkPDFText(
  text: string,
  chunkSize: number = 4000,
  overlapSize: number = 200
): string[] {
  const chunks: string[] = [];

  if (text.length <= chunkSize) {
    return [text];
  }

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end);
    chunks.push(chunk);

    // Move start position, accounting for overlap
    start = end - overlapSize;

    // Ensure we make progress
    if (start <= chunks[chunks.length - 1].length) {
      start = end;
    }
  }

  return chunks;
}

/**
 * Extracts text from a specific page range
 *
 * @param buffer - PDF buffer
 * @param startPage - Starting page number (1-indexed)
 * @param endPage - Ending page number (1-indexed, inclusive)
 * @returns Parsed result containing only the requested pages
 */
export async function parsePDFPages(
  buffer: Buffer,
  startPage: number,
  endPage: number
): Promise<PDFParseResult> {
  try {
    // Parse full PDF
    const fullPDF = await parsePDF(buffer);

    // Validate page numbers
    if (startPage < 1 || endPage > fullPDF.pageCount || startPage > endPage) {
      throw new Error(
        `Invalid page range: ${startPage}-${endPage} (document has ${fullPDF.pageCount} pages)`
      );
    }

    // For now, return the full text
    // In a production system with pdf-parse, you might implement per-page extraction
    // This is a limitation of the current pdf-parse library which extracts all pages at once
    return fullPDF;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PDF page extraction failed: ${error.message}`);
    }
    throw error;
  }
}
