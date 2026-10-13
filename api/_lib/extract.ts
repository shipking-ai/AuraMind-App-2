/**
 * Source -> text for creating a course on the phone: PDFs (unpdf, pdf.js
 * packaged for serverless) and photos (Gemini's image understanding).
 */

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 60_000;

/** Decodes base64; null when it is not base64 or decodes to more than `maxBytes`. */
export function decodeBase64Limited(data: string, maxBytes: number): Buffer | 'too_large' | null {
  if (!/^[A-Za-z0-9+/=\s]*$/.test(data)) return null;
  // Cheap upper bound before allocating the decoded buffer.
  if (Math.floor((data.length * 3) / 4) - 2 > maxBytes) return 'too_large';
  const bytes = Buffer.from(data, 'base64');
  return bytes.length > maxBytes ? 'too_large' : bytes;
}

/** A PDF starts with "%PDF-" (allowing a little leading junk, as readers do). */
export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

/** Text of every page, merged and capped; pages is the page count. */
export async function pdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: String(text).trim().slice(0, MAX_DOCUMENT_CHARS), pages: totalPages };
}
