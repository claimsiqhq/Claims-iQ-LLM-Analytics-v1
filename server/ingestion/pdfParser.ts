import { PDFParse } from "pdf-parse";

export interface PDFMetadata {
  producer?: string;
  creator?: string;
  creationDate?: string;
  modificationDate?: string;
  title?: string;
  author?: string;
  subject?: string;
}

export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata: PDFMetadata;
}

export async function parsePDF(buffer: Buffer): Promise<PDFParseResult> {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("Input must be a Buffer");
    }
    if (buffer.length === 0) {
      throw new Error("PDF buffer is empty");
    }
    const pdfSignature = buffer.toString("ascii", 0, 4);
    if (pdfSignature !== "%PDF") {
      throw new Error("Invalid PDF file: missing PDF signature");
    }

    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();
      await parser.destroy();

      let text = textResult?.text || "";
      text = text
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, " ")
        .replace(/ +/g, " ")
        .replace(/\n\n+/g, "\n")
        .trim();

      const metadata: PDFMetadata = {};
      if (infoResult?.info) {
        const info = infoResult.info as Record<string, string>;
        if (info.Producer) metadata.producer = String(info.Producer).trim();
        if (info.Creator) metadata.creator = String(info.Creator).trim();
        if (info.Title) metadata.title = String(info.Title).trim();
        if (info.Author) metadata.author = String(info.Author).trim();
      }

      const pageCount = textResult?.pages?.length ?? infoResult?.total ?? 0;

      return {
        text,
        pageCount,
        metadata,
      };
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
    throw error;
  }
}
