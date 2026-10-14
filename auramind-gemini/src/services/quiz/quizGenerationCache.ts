/**
 * Quiz Generation Cache — Module-level service for background quiz generation.
 *
 * Survives component unmounts so users can navigate away while a quiz
 * generates, then come back to find it ready (or still in progress).
 *
 * Also provides ETA estimation based on card count.
 */

import type { Quiz, Card } from '../../types';
import { bonaAiClient } from '../api/bonaAiService';

// ─── Types ───────────────────────────────────────────────────────

export interface GenerationProgress {
  deckId: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  progress: number;          // 0–100
  elapsedSeconds: number;
  estimatedTotalSeconds: number;
  error?: string;
  quiz?: Quiz;
}

type Subscriber = (progress: GenerationProgress) => void;
type GlobalSubscriber = (deckId: string, progress: GenerationProgress) => void;

// ─── State ───────────────────────────────────────────────────────

const STORAGE_PREFIX = 'bonamind:quiz:';

/** In-flight generation promises, keyed by deckId. Module-level = survives unmounts. */
const inFlight = new Map<string, Promise<void>>();

/** Subscribers to progress updates for each deck. */
const subscribers = new Map<string, Set<Subscriber>>();

/** Global subscribers notified on ANY deck's generation completion or error. */
const globalSubscribers = new Set<GlobalSubscriber>();

// ─── ETA Estimation ──────────────────────────────────────────────

/** Estimate total generation time in seconds based on card count. */
function estimateDuration(cardCount: number): number {
  // Rough estimate: ~1.5s base overhead + ~1.2s per card for AI processing
  return 1.5 + Math.max(cardCount, 1) * 1.2;
}

// ─── localStorage Helpers ────────────────────────────────────────

function storageKey(deckId: string): string {
  return `${STORAGE_PREFIX}${deckId}`;
}

function loadFromStorage(deckId: string): Quiz | null {
  try {
    const raw = localStorage.getItem(storageKey(deckId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate it looks like a quiz
    if (parsed && parsed.questions && Array.isArray(parsed.questions)) {
      return parsed as Quiz;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(deckId: string, quiz: Quiz): void {
  try {
    localStorage.setItem(storageKey(deckId), JSON.stringify(quiz));
  } catch {
    // localStorage full or unavailable — silently fail, quiz still in memory
    console.warn(`[QuizCache] Failed to persist quiz for deck ${deckId}`);
  }
}

function removeFromStorage(deckId: string): void {
  try {
    localStorage.removeItem(storageKey(deckId));
  } catch {
    // ignore
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Strip markdown code fences (```json ... ``` or ``` ... ```) from AI responses. */
function extractJsonFromResponse(raw: string): string {
  let trimmed = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` wrapping
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) {
    trimmed = fenced[1].trim();
  }
  return trimmed;
}

function notify(deckId: string, progress: GenerationProgress): void {
  const subs = subscribers.get(deckId);
  if (subs) {
    subs.forEach((fn) => {
      try { fn(progress); } catch { /* swallow subscriber errors */ }
    });
  }

  // Notify global subscribers on terminal states (done or error)
  if (progress.status === 'done' || progress.status === 'error') {
    globalSubscribers.forEach((fn) => {
      try { fn(deckId, progress); } catch { /* swallow */ }
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Get the current state for a deck's quiz generation.
 * Returns cached quiz if available, or the latest progress snapshot.
 */
export function getQuizState(deckId: string): GenerationProgress {
  // Check localStorage first
  const cached = loadFromStorage(deckId);
  if (cached) {
    return {
      deckId,
      status: 'done',
      progress: 100,
      elapsedSeconds: 0,
      estimatedTotalSeconds: 0,
      quiz: cached,
    };
  }

  // Is generation in flight?
  if (inFlight.has(deckId)) {
    // Return an approximate "generating" state — the subscriber will
    // receive real updates when they subscribe.
    return {
      deckId,
      status: 'generating',
      progress: 10,
      elapsedSeconds: 0,
      estimatedTotalSeconds: 0,
    };
  }

  return { deckId, status: 'idle', progress: 0, elapsedSeconds: 0, estimatedTotalSeconds: 0 };
}

/**
 * Subscribe to progress updates for a deck's quiz generation.
 * Returns an unsubscribe function.
 */
export function subscribeToGeneration(
  deckId: string,
  callback: Subscriber
): () => void {
  if (!subscribers.has(deckId)) {
    subscribers.set(deckId, new Set());
  }
  subscribers.get(deckId)!.add(callback);

  // Immediately notify with current state
  const current = getQuizState(deckId);
  if (current.status !== 'idle') {
    // Use setTimeout to avoid issues with calling during render
    setTimeout(() => callback(current), 0);
  }

  return () => {
    const subs = subscribers.get(deckId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(deckId);
    }
  };
}

/**
 * Start generating a quiz from cards in the background.
 * If already generating or done, returns the current state.
 */
export function startGeneration(deckId: string, cards: Card[]): GenerationProgress {
  // Already done?
  const cached = loadFromStorage(deckId);
  if (cached) {
    return {
      deckId,
      status: 'done',
      progress: 100,
      elapsedSeconds: 0,
      estimatedTotalSeconds: 0,
      quiz: cached,
    };
  }

  // Already generating?
  if (inFlight.has(deckId)) {
    return {
      deckId,
      status: 'generating',
      progress: 0,
      elapsedSeconds: 0,
      estimatedTotalSeconds: estimateDuration(cards.length),
    };
  }

  // Start generation
  const estimatedTotal = estimateDuration(cards.length);
  let elapsed = 0;
  let cancelled = false;

  // Progress simulation via interval
  const startTime = Date.now();
  const interval = setInterval(() => {
    if (cancelled) return;
    elapsed = (Date.now() - startTime) / 1000;
    // Progress ramps up quickly at first, then slows (logarithmic approach)
    const rawProgress = Math.min((elapsed / estimatedTotal) * 100, 95);
    // Use a slightly optimistic curve so it never hits 100 until actually done
    const progress = Math.round(rawProgress * 0.9 + 5);

    notify(deckId, {
      deckId,
      status: 'generating',
      progress,
      elapsedSeconds: Math.round(elapsed),
      estimatedTotalSeconds: Math.round(estimatedTotal),
    });
  }, 300);

  const promise = (async () => {
    try {
      const content = cards.map(c => {
        const q = (c as any).front || (c as any).question || '';
        const a = (c as any).back || (c as any).answer || '';
        return `Q: ${q}\nA: ${a}`;
      }).join('\n\n');

      const response = await bonaAiClient.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a quiz generator. Return ONLY valid JSON.' },
          {
            role: 'user',
            content: `Generate a quiz with ${Math.min(cards.length, 8)} multiple choice questions based on this content. Return JSON with format: { "id": string, "title": string, "topic": string, "difficulty": "easy"|"medium"|"hard", "questions": [{ "id": string, "question": string, "options": string[], "correctAnswer": number, "explanation": string }] }\n\nContent:\n${content}`
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      if (cancelled) return;

      const rawContent = response.choices?.[0]?.message?.content || '';
      if (!rawContent.trim()) throw new Error('Empty response');
      const cleaned = extractJsonFromResponse(rawContent);
      const parsed = JSON.parse(cleaned) as Quiz;

      // Persist to localStorage
      saveToStorage(deckId, parsed);

      // Notify completion
      notify(deckId, {
        deckId,
        status: 'done',
        progress: 100,
        elapsedSeconds: Math.round(elapsed),
        estimatedTotalSeconds: Math.round(estimatedTotal),
        quiz: parsed,
      });
    } catch (err) {
      if (cancelled) return;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      notify(deckId, {
        deckId,
        status: 'error',
        progress: 0,
        elapsedSeconds: Math.round(elapsed),
        estimatedTotalSeconds: Math.round(estimatedTotal),
        error: errorMsg,
      });
    } finally {
      clearInterval(interval);
      inFlight.delete(deckId);
    }
  })();

  inFlight.set(deckId, promise);

  // Provide a cancellation mechanism on the promise
  (promise as any).cancel = () => {
    cancelled = true;
    clearInterval(interval);
    inFlight.delete(deckId);
  };

  // Immediately notify with initial progress (avoids 300ms gap before first update)
  notify(deckId, {
    deckId,
    status: 'generating',
    progress: 5,
    elapsedSeconds: 0,
    estimatedTotalSeconds: Math.round(estimatedTotal),
  });

  return {
    deckId,
    status: 'generating',
    progress: 5,
    elapsedSeconds: 0,
    estimatedTotalSeconds: Math.round(estimatedTotal),
  };
}

/**
 * Clear the cached quiz for a deck (to allow regeneration).
 * Also cancels any in-flight generation.
 */
export function clearCache(deckId: string): void {
  removeFromStorage(deckId);

  const promise = inFlight.get(deckId);
  if (promise && (promise as any).cancel) {
    (promise as any).cancel();
  }
  inFlight.delete(deckId);

  // Notify idle
  notify(deckId, {
    deckId,
    status: 'idle',
    progress: 0,
    elapsedSeconds: 0,
    estimatedTotalSeconds: 0,
  });
}

/**
 * Check if a quiz is cached for a deck.
 */
export function isCached(deckId: string): boolean {
  return loadFromStorage(deckId) !== null;
}

/**
 * Subscribe to ALL quiz generation completions (across all decks).
 * Returns an unsubscribe function.
 */
export function onQuizCompleted(callback: GlobalSubscriber): () => void {
  globalSubscribers.add(callback);
  return () => { globalSubscribers.delete(callback); };
}

/**
 * Load all cached quizzes from localStorage.
 * Returns a Map of deckId → Quiz for all persisted quizzes.
 */
export function loadAllCachedQuizzes(): Map<string, Quiz> {
  const result = new Map<string, Quiz>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const deckId = key.slice(STORAGE_PREFIX.length);
        const quiz = loadFromStorage(deckId);
        if (quiz) result.set(deckId, quiz);
      }
    }
  } catch { /* ignore */ }
  return result;
}



