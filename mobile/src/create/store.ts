import {
  buildCourse, COURSE_SIZES, createCourse, CreateError,
  type BuildPartial, type BuildProgress, type CourseDraft, type CourseSize, type CourseSource, type CreateErrorKind, type DraftCard,
} from '@bonamind/core';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { getData } from '../data/app';
import { getSupabase } from '../data/supabase';
import { ask } from './ask';

export type CreatePhase = 'input' | 'building' | 'waiting' | 'review' | 'saving' | 'ready' | 'error';

interface CreateState {
  phase: CreatePhase;
  size: CourseSize;
  progress: BuildProgress | null;
  draft: CourseDraft | null;
  error: CreateErrorKind | null;
  savedDeckId: string | null;
  /** The last course saved here, until Courses has shown it as new once; survives reset(). */
  justCreated: string | null;
  clearJustCreated(): void;
  /** Reads the source, then builds; ignored unless idle or after an error (one build at a time). */
  start(read: () => Promise<CourseSource>, size: CourseSize): void;
  removeCard(i: number): void;
  restoreCard(i: number, card: DraftCard): void;
  editCard(i: number, card: DraftCard): void;
  rename(title: string): void;
  save(userId: string, onSaved: (deckId: string) => void): Promise<void>;
  reset(): void;
}

/** Pause before resuming a build after the connection returns. */
export const RESUME_DELAY_MS = 2_000;

const kindOf = (e: unknown): CreateErrorKind => (e instanceof CreateError ? e.kind : 'busy');

// The build lives outside any screen: leaving the sheet doesn't cancel it.
let source: CourseSource | null = null;
/** The title the course was made with: used when the user clears it. */
let generatedTitle = '';
let stopWaiting: (() => void) | null = null;
let run = 0;

const IDLE = { phase: 'input' as CreatePhase, progress: null, draft: null, error: null, savedDeckId: null };

export const useCreateStore = create<CreateState>()((set, get) => {
  const patchDraft = (fn: (d: CourseDraft) => CourseDraft) => {
    const d = get().draft;
    if (d) set({ draft: fn(d) });
  };

  /**
   * Resume from the last finished piece once the connection is back: at most
   * once per pause, after RESUME_DELAY_MS. NetInfo calls a new listener at
   * once, and can say "connected" while requests still fail, so resuming
   * immediately would spin and leak a listener per turn.
   */
  function waitForConnection(id: number, partial: BuildPartial) {
    stopWaiting?.();
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const stop = () => { settled = true; unsubscribe?.(); if (stopWaiting === stop) stopWaiting = null; };
    unsubscribe = NetInfo.addEventListener((s) => {
      if (settled || s.isConnected === false || s.isInternetReachable === false) return;
      settled = true;
      setTimeout(() => {
        stop();
        if (id !== run || get().phase !== 'waiting') return;
        set({ phase: 'building' });
        void generate(id, partial);
      }, RESUME_DELAY_MS);
    });
    stopWaiting = stop;
  }

  async function generate(id: number, resume?: BuildPartial) {
    if (!source) return;
    try {
      const draft = await buildCourse({
        source,
        size: get().size,
        ask,
        resume,
        onProgress: (progress) => { if (id === run) set({ progress }); },
      });
      if (id === run) {
        generatedTitle = draft.title;
        set({ phase: 'review', draft, error: null });
      }
    } catch (e) {
      if (id !== run) return;
      if (e instanceof CreateError && e.kind === 'offline' && e.partial) {
        set({ phase: 'waiting' });
        waitForConnection(id, e.partial);
        return;
      }
      set({ phase: 'error', error: kindOf(e) });
    }
  }

  return {
    ...IDLE,
    size: 'standard',
    justCreated: null,
    clearJustCreated: () => set({ justCreated: null }),

    start(read, size) {
      if (get().phase !== 'input' && get().phase !== 'error') return;
      const id = ++run;
      set({ ...IDLE, phase: 'building', size, progress: { step: 'reading', cardsSoFar: 0, target: COURSE_SIZES[size] } });
      void (async () => {
        let next: CourseSource;
        try {
          next = await read();
        } catch (e) {
          if (id === run) set({ phase: 'error', error: kindOf(e) });
          return;
        }
        // A read that finishes after a reset belongs to a dead build.
        if (id !== run) return;
        source = next;
        await generate(id);
      })();
    },

    removeCard: (i) => patchDraft((d) => ({ ...d, cards: d.cards.filter((_, k) => k !== i) })),
    restoreCard: (i, card) => patchDraft((d) => ({ ...d, cards: [...d.cards.slice(0, i), card, ...d.cards.slice(i)] })),
    editCard: (i, card) => patchDraft((d) => ({ ...d, cards: d.cards.map((c, k) => (k === i ? card : c)) })),
    rename: (title) => patchDraft((d) => ({ ...d, title })),

    async save(userId, onSaved) {
      const draft = get().draft;
      if (!draft || get().phase === 'saving') return;
      set({ phase: 'saving', error: null });
      try {
        const profile = await getData().getFsrsProfile(userId).catch(() => ({ profileLabel: null, weights: undefined }));
        const title = draft.title.trim() || generatedTitle || 'My course';
        const { deck } = await createCourse(getSupabase(), userId, { ...draft, title }, { profileLabel: profile.profileLabel, weightsOverride: profile.weights });
        set({ phase: 'ready', savedDeckId: deck.id, justCreated: deck.id });
        onSaved(deck.id);
      } catch {
        // createCourse already removed any half-saved deck; the reviewed cards stay here.
        set({ phase: 'review', error: 'busy' });
      }
    },

    reset() {
      run += 1;
      stopWaiting?.();
      stopWaiting = null;
      source = null;
      set({ ...IDLE });
    },
  };
});
