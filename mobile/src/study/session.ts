import { planReview, Rating, type Card, type CardScheduleUpdate, type NewStudySession, type ReviewRecord, type ScheduleOptions } from '@bonamind/core';

/**
 * One study session over a deck's due cards, independent of the UI.
 *
 * Every rating is scheduled on the device and queued for upload at once, so
 * nothing is lost if the app is killed. Study time is recorded in segments:
 * going to the background (or closing early) saves the segment so far as its
 * own study_sessions row, and returning starts a new one. Each segment has
 * its own id, so a retried upload is idempotent.
 */
export interface StudyDeps {
  enqueueReview(userId: string, record: ReviewRecord, update: CardScheduleUpdate): Promise<void>;
  enqueueSession(userId: string, session: NewStudySession): Promise<void>;
  newId(): string;
}

export function createStudySession(opts: {
  userId: string;
  deckId: string;
  cards: Card[];
  startedAt: number;
  deps: StudyDeps;
  /** The user's fitted weights, retention target and profile: as the website schedules. */
  schedule?: ScheduleOptions;
}) {
  const { userId, deckId, deps } = opts;
  const byId = new Map(opts.cards.map((c) => [c.id, c]));
  let queue = opts.cards.map((c) => c.id);
  let segment = { start: opts.startedAt, rated: 0, correct: 0 };
  let totals = { rated: 0, good: 0 };
  let saving = Promise.resolve();

  async function saveSegment(at: number): Promise<void> {
    if (segment.rated === 0) return;
    const s = segment;
    segment = { start: at, rated: 0, correct: 0 };
    await deps.enqueueSession(userId, {
      id: deps.newId(),
      deckId,
      startTime: s.start,
      endTime: at,
      cardsStudied: s.rated,
      correctAnswers: s.correct,
      totalAnswers: s.rated,
      accuracy: Math.round((s.correct / s.rated) * 100),
      duration: at - s.start,
    });
  }

  return {
    startedAt: opts.startedAt,
    current: (): Card | null => (queue.length ? byId.get(queue[0]) ?? null : null),
    left: () => queue.length,
    isComplete: () => queue.length === 0,
    rated: () => totals.rated,
    goodRatio: () => (totals.rated ? totals.good / totals.rated : 0),

    async rate(rating: Rating, at: number): Promise<{ update: CardScheduleUpdate } | null> {
      const card = queue.length ? byId.get(queue[0]) : undefined;
      if (!card) return null;
      const { update, record } = planReview(card, rating, at, opts.schedule);
      byId.set(card.id, { ...card, ...update });
      const correct = rating !== Rating.AGAIN;
      segment.rated += 1;
      totals.rated += 1;
      if (correct) { segment.correct += 1; totals.good += 1; }
      queue = correct ? queue.slice(1) : [...queue.slice(1), card.id];
      await deps.enqueueReview(userId, record, update);
      if (queue.length === 0) await (saving = saving.then(() => saveSegment(at)));
      return { update };
    },

    /** App went to the background: keep what was studied so far. */
    background(at: number): Promise<void> {
      return (saving = saving.then(() => saveSegment(at)));
    },

    resume(at: number): void {
      if (segment.rated === 0) segment = { ...segment, start: at };
    },

    /** Leaving before the end. */
    close(at: number): Promise<void> {
      return (saving = saving.then(() => saveSegment(at)));
    },
  };
}

export type StudySession = ReturnType<typeof createStudySession>;
