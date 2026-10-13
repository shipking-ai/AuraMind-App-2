/**
 * Turning a source into a course draft: one or more calls to the AI proxy,
 * a forgiving parse of each reply, and a retry policy that prefers a slightly
 * smaller course over a failed one. The network call is injected (`ask`), so
 * this stays platform-free.
 */
import { dedupeCards, parseCards, parseTopicDeck, type DraftCard } from './parse';
import { cardsPrompt, topicPrompt } from './prompts';
import { COURSE_SIZES, splitSource, type CourseSize } from './split';

export type CreateErrorKind = 'offline' | 'subscription' | 'rate_limited' | 'unreadable' | 'too_large' | 'empty' | 'busy';

export interface BuildPartial {
  /** Pieces (text) or rounds (topic) already finished. */
  donePieces: number;
  cards: DraftCard[];
  /** A topic's model-given title and description, once known. */
  title?: string;
  description?: string;
}

export class CreateError extends Error {
  constructor(public kind: CreateErrorKind, message?: string, public partial?: BuildPartial) {
    super(message ?? kind);
    this.name = 'CreateError';
  }
}

export type CourseSource =
  | { kind: 'topic'; topic: string }
  | { kind: 'text'; text: string; title: string; label: string };

/** The part of an AbortSignal this module reads (core has no DOM types). */
export interface AbortLike {
  readonly aborted: boolean;
}

/** One call to /api/ai/chat; returns the reply text or throws a CreateError. */
export type AskFn = (prompt: string, signal?: AbortLike) => Promise<string>;

export interface BuildProgress {
  step: 'reading' | 'ideas' | 'writing' | 'done';
  cardsSoFar: number;
  target: number;
  latest?: DraftCard;
}

export interface CourseDraft {
  title: string;
  description: string;
  cards: DraftCard[];
  truncated: boolean;
  skippedPieces: number;
}

/** A deep topic asks in two rounds; one reply rarely holds 35 good cards. */
const TOPIC_FIRST_ROUND = 20;
const RATE_LIMIT_WAITS_MS = [3000, 8000];

const timers = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
const defaultSleep = (ms: number) => new Promise<void>((resolve) => { timers.setTimeout(resolve, ms); });
const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

export async function buildCourse(opts: {
  source: CourseSource;
  size: CourseSize;
  ask: AskFn;
  onProgress?: (p: BuildProgress) => void;
  signal?: AbortLike;
  sleep?: (ms: number) => Promise<void>;
  resume?: BuildPartial;
}): Promise<CourseDraft> {
  const { source, ask, signal } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const target = COURSE_SIZES[opts.size];
  const emit = (p: Omit<BuildProgress, 'target'>) => opts.onProgress?.({ ...p, target });

  let all: DraftCard[] = opts.resume ? [...opts.resume.cards] : [];
  // Cards past the target are dropped at the end; don't show them arriving.
  const add = (fresh: DraftCard[]) => {
    for (const card of fresh) {
      if (all.length >= target) return;
      const next = dedupeCards([...all, card]);
      if (next.length === all.length) continue;
      all = next;
      emit({ step: 'writing', cardsSoFar: all.length, latest: card });
    }
  };

  /**
   * One prompt under the retry policy: a busy proxy or an unusable reply gets
   * one retry; a rate limit waits 3 s then 8 s. Returns null when the piece is
   * skipped. A missing subscription or a lost connection ends the build.
   */
  async function attempt<T>(prompt: string, parse: (reply: string) => T | null): Promise<T | null> {
    let retried = false;
    const waits = [...RATE_LIMIT_WAITS_MS];
    for (;;) {
      try {
        const parsed = parse(await ask(prompt, signal));
        if (parsed !== null) return parsed;
      } catch (e) {
        if (isAbort(e)) throw e;
        const kind = e instanceof CreateError ? e.kind : 'busy';
        if (kind === 'rate_limited') {
          const wait = waits.shift();
          if (wait === undefined) { rateLimitedSkip = true; return null; }
          await sleep(wait);
          continue;
        }
        if (kind !== 'busy') throw e instanceof CreateError ? e : new CreateError(kind);
      }
      if (retried) return null;
      retried = true;
    }
  }
  const nonEmpty = (cards: DraftCard[]) => (cards.length ? cards : null);
  let rateLimitedSkip = false;

  let title = '';
  let description = '';
  /** A lost connection stops the build with what's done, so it can resume. */
  async function guard<T>(done: number, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof CreateError && e.kind === 'offline') {
        throw new CreateError('offline', e.message, { donePieces: done, cards: all, title, description });
      }
      throw e;
    }
  }

  emit({ step: 'reading', cardsSoFar: all.length });

  let truncated = false;
  let skippedPieces = 0;

  if (source.kind === 'topic') {
    const done = opts.resume?.donePieces ?? 0;
    title = opts.resume?.title || source.topic;
    description = opts.resume?.description ?? '';
    emit({ step: 'ideas', cardsSoFar: all.length });
    let firstRound = done >= 1;
    if (!firstRound) {
      const first = await guard(0, () => attempt(topicPrompt(source.topic, Math.min(target, TOPIC_FIRST_ROUND)), (reply) => {
        const deck = parseTopicDeck(reply);
        return deck?.cards.length ? deck : null;
      }));
      if (first) {
        title = first.title || source.topic;
        description = first.description;
        add(first.cards);
        firstRound = true;
      }
    }
    if (firstRound && all.length < target) {
      const more = await guard(1, () => attempt(topicPrompt(source.topic, target - all.length, all.map((c) => c.front)), (r) => nonEmpty(parseCards(r))));
      if (more) add(more);
    }
  } else {
    title = source.title;
    description = `From ${source.label}`;
    const split = splitSource(source.text, target);
    if (!split.pieces.length) throw new CreateError('unreadable');
    truncated = split.truncated;
    emit({ step: 'ideas', cardsSoFar: all.length });
    for (let i = opts.resume?.donePieces ?? 0; i < split.pieces.length; i++) {
      const piece = split.pieces[i];
      const cards = await guard(i, () => attempt(cardsPrompt(piece.text, piece.cards, source.title), (r) => nonEmpty(parseCards(r))));
      if (cards) add(cards);
      else skippedPieces += 1;
    }
  }

  const cards = all.slice(0, target);
  // Nothing made because the AI was rate limited: say so, not "try another source".
  if (!cards.length) throw new CreateError(rateLimitedSkip ? 'rate_limited' : 'empty');
  emit({ step: 'done', cardsSoFar: cards.length });
  return { title, description, cards, truncated, skippedPieces };
}
