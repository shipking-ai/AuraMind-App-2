/**
 * aiVoice — natural-sounding voices generated on the server.
 *
 * Built-in voices depend on the device: an old Android engine or a Windows
 * desktop voice sounds robotic no matter how it is chosen. These voices are
 * synthesised by /api/ai/speech (Canopy Labs Orpheus on Groq) and played
 * with an <audio> element, which works the same in browsers and in the
 * Android WebView.
 *
 * Groq accepts at most 200 characters per request, so text is split at
 * sentence (then word) boundaries and played clip by clip, fetching the next
 * clip while the current one plays. Clips are cached for the session so a
 * flipped-back card does not cost a second request.
 *
 * Failure is never silence: `playAiVoice` rejects when the first clip cannot
 * be fetched, and speechOutput falls back to the built-in voice. After a
 * refusal that will not fix itself (no subscription, voices not enabled on
 * the server) AI voices are skipped for a while instead of retried per card.
 */
import { requireSupabase } from '../database/supabase';
import { readClientEnv } from '../../lib/env';

export const AI_VOICE_PREFIX = 'ai:';

export const AI_VOICES = [
  { id: 'ai:hannah', label: 'Hannah (natural AI voice)' },
  { id: 'ai:autumn', label: 'Autumn (natural AI voice)' },
  { id: 'ai:diana', label: 'Diana (natural AI voice)' },
  { id: 'ai:austin', label: 'Austin (natural AI voice)' },
  { id: 'ai:daniel', label: 'Daniel (natural AI voice)' },
  { id: 'ai:troy', label: 'Troy (natural AI voice)' },
] as const;

export const MAX_CLIP_CHARS = 200;

const SPEECH_URL = `${readClientEnv('VITE_API_BASE_URL') ?? ''}/api/ai/speech`;
const CACHE_LIMIT = 60;
const BACKOFF_MS = 10 * 60 * 1000;

export function isAiVoice(choice: string | undefined): boolean {
  return typeof choice === 'string' && choice.startsWith(AI_VOICE_PREFIX);
}

/**
 * Splits text into clips of at most `max` characters, preferring sentence
 * ends, then commas/semicolons, then spaces. A single word longer than `max`
 * is cut hard (rare: URLs, chemical names).
 */
export function splitForSpeech(text: string, max = MAX_CLIP_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [clean];
  const clips: string[] = [];
  let current = '';

  const pushPiece = (piece: string) => {
    const p = piece.trim();
    if (!p) return;
    if (!current) current = p;
    else if (current.length + 1 + p.length <= max) current = `${current} ${p}`;
    else {
      clips.push(current);
      current = p;
    }
  };

  for (const sentence of sentences) {
    if (sentence.trim().length <= max) {
      pushPiece(sentence);
      continue;
    }
    // Long sentence: break at clause punctuation, then at spaces.
    for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
      if (clause.length <= max) {
        pushPiece(clause);
        continue;
      }
      let rest = clause.trim();
      while (rest.length > max) {
        const cut = rest.lastIndexOf(' ', max);
        const at = cut > max / 2 ? cut : max;
        pushPiece(rest.slice(0, at));
        rest = rest.slice(at).trim();
      }
      pushPiece(rest);
    }
  }
  if (current) clips.push(current);
  return clips;
}

// ── Network + cache ───────────────────────────────────────────────────────

const cache = new Map<string, string>(); // key → object URL
let unavailableUntil = 0;

/** Test seam. */
export function resetAiVoiceState(): void {
  for (const url of cache.values()) URL.revokeObjectURL?.(url);
  cache.clear();
  unavailableUntil = 0;
}

export function aiVoiceTemporarilyUnavailable(now = Date.now()): boolean {
  return now < unavailableUntil;
}

async function sessionToken(): Promise<string | null> {
  try {
    const { data } = await requireSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchClip(text: string, voice: string): Promise<string> {
  const key = `${voice}\n${text}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const token = await sessionToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(SPEECH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    // 402 no subscription, 503 voices not enabled server-side: these will
    // not change within a session, so stop asking for a while.
    if (res.status === 402 || res.status === 503) unavailableUntil = Date.now() + BACKOFF_MS;
    throw new Error(`speech ${res.status}`);
  }
  const url = URL.createObjectURL(await res.blob());
  cache.set(key, url);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    URL.revokeObjectURL(cache.get(oldest)!);
    cache.delete(oldest);
  }
  return url;
}

// ── Playback ──────────────────────────────────────────────────────────────

let currentAudio: HTMLAudioElement | null = null;

function playClip(url: string, rate: number, isCurrent: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    currentAudio = audio;
    const done = (finished: boolean) => {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      if (currentAudio === audio) currentAudio = null;
      resolve(finished);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    // stopAiVoice pauses; a pause that is not the natural end is a stop.
    audio.onpause = () => {
      if (!audio.ended) done(false);
    };
    if (!isCurrent()) {
      done(false);
      return;
    }
    audio.play().catch(() => done(false));
  });
}

/**
 * Speaks `text` with an AI voice. Rejects if the first clip cannot be
 * fetched (caller falls back to a built-in voice); after that, resolves with
 * `interrupted: true` on a stop, a newer utterance, or a later failure.
 */
export async function playAiVoice(
  text: string,
  choice: string,
  { rate = 1, isCurrent }: { rate?: number; isCurrent: () => boolean },
): Promise<{ interrupted: boolean }> {
  const voice = choice.slice(AI_VOICE_PREFIX.length);
  const clips = splitForSpeech(text);
  if (clips.length === 0) return { interrupted: false };
  if (aiVoiceTemporarilyUnavailable()) throw new Error('ai voice unavailable');

  let next: Promise<string> = fetchClip(clips[0], voice);
  for (let i = 0; i < clips.length; i++) {
    let url: string;
    try {
      url = await next;
    } catch (err) {
      if (i === 0) throw err;
      return { interrupted: true };
    }
    if (!isCurrent()) return { interrupted: true };
    // Prefetch the following clip while this one plays.
    if (i + 1 < clips.length) {
      next = fetchClip(clips[i + 1], voice);
      next.catch(() => undefined);
    }
    const finished = await playClip(url, rate, isCurrent);
    if (!finished || !isCurrent()) return { interrupted: true };
  }
  return { interrupted: false };
}

export function stopAiVoice(): void {
  currentAudio?.pause();
  currentAudio = null;
}
