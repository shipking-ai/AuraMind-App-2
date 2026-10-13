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

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const DEFAULT_VISION_MODEL = 'gemini-2.0-flash';
const NO_TEXT = 'NO_TEXT';

const TRANSCRIBE_INSTRUCTION =
  'These are photos of study material (notes, textbook pages, slides or a whiteboard), in order. ' +
  'Transcribe all of the text, including handwriting and the labels on diagrams, page by page. ' +
  `Output plain text only, with no commentary. If there is no readable text at all, reply exactly ${NO_TEXT}.`;

export class VisionError extends Error {
  constructor(public code: 'unavailable' | 'no_text') {
    super(code);
  }
}

/** Groq's image-capable model (verified against Groq's model list 2026-10-12). */
export const DEFAULT_GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';
/**
 * Groq's free tier allows ~1,000 output tokens per minute on that model and
 * refuses any request whose max_tokens would exceed it, so stay under.
 */
export const GROQ_VISION_MAX_TOKENS = 900;

interface VisionRoute {
  provider: 'gemini' | 'groq';
  key: string;
  model: string;
  maxTokens?: number;
}

/** Gemini when its key is set, then Groq (the key Vercel already has). */
function visionRoutes(): VisionRoute[] {
  const routes: VisionRoute[] = [];
  if (process.env.GEMINI_API_KEY) {
    routes.push({ provider: 'gemini', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_VISION_MODEL || DEFAULT_VISION_MODEL });
  }
  if (process.env.GROQ_API_KEY) {
    routes.push({
      provider: 'groq', key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL, maxTokens: GROQ_VISION_MAX_TOKENS,
    });
  }
  return routes;
}

/**
 * Transcribes 1-5 JPEG pages through an OpenAI-compatible image model,
 * falling through to the next provider when one fails.
 */
export async function imageText(images: string[]): Promise<string> {
  const { providerByName } = await import('../_providers.js');
  const content = [
    { type: 'text', text: TRANSCRIBE_INSTRUCTION },
    ...images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
  ];
  for (const route of visionRoutes()) {
    const provider = providerByName(route.provider);
    if (!provider) continue;
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.key}` },
      body: JSON.stringify({
        model: route.model,
        temperature: 0,
        ...(route.maxTokens ? { max_tokens: route.maxTokens } : {}),
        messages: [{ role: 'user', content }],
      }),
    }).catch(() => null);
    if (!res || !res.ok) continue;
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
    const text = String(body?.choices?.[0]?.message?.content ?? '').trim();
    if (!text || text === NO_TEXT) throw new VisionError('no_text');
    return text.slice(0, MAX_DOCUMENT_CHARS);
  }
  throw new VisionError('unavailable');
}
