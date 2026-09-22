/**
 * Chrome's built-in AI — Gemini Nano running inside the browser.
 *
 * Chrome and Edge ship Summarizer, Translator and LanguageDetector as web
 * APIs backed by an on-device model. For AuraMind that is worth having for
 * reasons the server model can't match: it costs nothing, it works offline,
 * the card text never leaves the machine, and there is no quota to burn on
 * "say that shorter".
 *
 * Every entry point here is defensive on purpose. The APIs may be missing,
 * may need a one-time model download, may need a user gesture, and
 * `availability()` itself can hang while the browser checks its component
 * updater — so every call is raced against a timeout and resolves to a plain
 * "unavailable" rather than leaving a spinner on screen forever.
 */

export type LocalAIStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'available';

/** Availability answers fast or not at all; a study screen cannot wait. */
const AVAILABILITY_TIMEOUT_MS = 4_000;
const RUN_TIMEOUT_MS = 30_000;

interface CreateMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface SummarizerApi {
  availability(options?: Record<string, unknown>): Promise<string>;
  create(options?: Record<string, unknown>): Promise<{
    summarize(input: string, options?: { context?: string }): Promise<string>;
    destroy?(): void;
  }>;
}

interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: Record<string, unknown>): Promise<{
    translate(input: string): Promise<string>;
    destroy?(): void;
  }>;
}

interface DetectorApi {
  availability(): Promise<string>;
  create(options?: Record<string, unknown>): Promise<{
    detect(input: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
    destroy?(): void;
  }>;
}

function api<T>(name: string): T | null {
  if (typeof self === 'undefined') return null;
  return (self as unknown as Record<string, T | undefined>)[name] ?? null;
}

/** True when the browser exposes the built-in AI surface at all. */
export function hasBuiltInAI(): boolean {
  return api<SummarizerApi>('Summarizer') !== null;
}

export function hasBuiltInTranslator(): boolean {
  return api<TranslatorApi>('Translator') !== null;
}

async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Maps the spec's availability strings onto what the UI needs to say. */
function toStatus(raw: string | null | undefined): LocalAIStatus {
  switch (raw) {
    case 'available':
    case 'readily':
      return 'available';
    case 'downloadable':
    case 'downloading':
    case 'after-download':
      return 'downloadable';
    default:
      return 'unavailable';
  }
}

const SUMMARY_OPTIONS = {
  type: 'tldr',
  format: 'plain-text',
  length: 'short',
} as const;

export async function summarizerStatus(): Promise<LocalAIStatus> {
  const summarizer = api<SummarizerApi>('Summarizer');
  if (!summarizer) return 'unsupported';
  const raw = await withTimeout(
    summarizer.availability(SUMMARY_OPTIONS).catch(() => null),
    AVAILABILITY_TIMEOUT_MS,
    null,
  );
  return toStatus(raw);
}

/**
 * The one-sentence version of a long answer, produced on the device.
 * Returns null whenever the model can't do it — the caller keeps the card as
 * it is, because a missing summary is a non-event.
 */
export async function summarizeLocally(
  text: string,
  options: { context?: string; onDownload?: (fraction: number) => void } = {},
): Promise<string | null> {
  const summarizer = api<SummarizerApi>('Summarizer');
  if (!summarizer || !text.trim()) return null;
  return withTimeout(
    (async () => {
      const session = await summarizer.create({
        ...SUMMARY_OPTIONS,
        sharedContext:
          'A flashcard answer being revised. Keep the meaning exact; never add facts.',
        monitor: (m: CreateMonitor) =>
          m.addEventListener('downloadprogress', (e) => options.onDownload?.(e.loaded)),
      });
      try {
        const summary = await session.summarize(text, { context: options.context });
        return summary.trim() || null;
      } finally {
        session.destroy?.();
      }
    })().catch(() => null),
    RUN_TIMEOUT_MS,
    null,
  );
}

export async function translatorStatus(
  target: string,
  source = 'en',
): Promise<LocalAIStatus> {
  const translator = api<TranslatorApi>('Translator');
  if (!translator) return 'unsupported';
  const raw = await withTimeout(
    translator
      .availability({ sourceLanguage: source, targetLanguage: target })
      .catch(() => null),
    AVAILABILITY_TIMEOUT_MS,
    null,
  );
  return toStatus(raw);
}

export async function translateLocally(
  text: string,
  target: string,
  options: { source?: string; onDownload?: (fraction: number) => void } = {},
): Promise<string | null> {
  const translator = api<TranslatorApi>('Translator');
  if (!translator || !text.trim()) return null;
  const source = options.source ?? (await detectLanguage(text)) ?? 'en';
  if (source === target) return null;
  return withTimeout(
    (async () => {
      const session = await translator.create({
        sourceLanguage: source,
        targetLanguage: target,
        monitor: (m: CreateMonitor) =>
          m.addEventListener('downloadprogress', (e) => options.onDownload?.(e.loaded)),
      });
      try {
        const translated = await session.translate(text);
        return translated.trim() || null;
      } finally {
        session.destroy?.();
      }
    })().catch(() => null),
    RUN_TIMEOUT_MS,
    null,
  );
}

/** BCP-47 tag of the text's language, or null when the browser can't say. */
export async function detectLanguage(text: string): Promise<string | null> {
  const detector = api<DetectorApi>('LanguageDetector');
  if (!detector || !text.trim()) return null;
  return withTimeout(
    (async () => {
      const session = await detector.create();
      try {
        const [best] = await session.detect(text);
        // Below ~0.5 the guess is noise; a wrong source language produces a
        // confident translation of the wrong thing.
        return best && best.confidence >= 0.5 ? best.detectedLanguage : null;
      } finally {
        session.destroy?.();
      }
    })().catch(() => null),
    RUN_TIMEOUT_MS,
    null,
  );
}
