import { Rating, type Card } from '@bonamind/core';
import { createStudySession } from '../session';

const T = Date.UTC(2026, 9, 8, 18);
const card = (id: string): Card => ({ id, deckId: 'bio', front: id, back: id, nextReview: T - 1000 });

function setup(n: number) {
  const enqueueReview = jest.fn(async (_u: string, _r: any, _p: any) => {});
  const enqueueSession = jest.fn(async (_u: string, _s: any) => {});
  let ids = 0;
  const s = createStudySession({
    userId: 'u1', deckId: 'bio', cards: [...Array(n)].map((_, i) => card(`c${i}`)), startedAt: T,
    deps: { enqueueReview, enqueueSession, newId: () => `s${++ids}` },
  });
  return { s, enqueueReview, enqueueSession };
}

it('enqueues one review per rating, with the rating given', async () => {
  const { s, enqueueReview } = setup(3);
  await s.rate(Rating.GOOD, T + 1000);
  await s.rate(Rating.GOOD, T + 2000);
  expect(enqueueReview).toHaveBeenCalledTimes(2);
  expect(enqueueReview.mock.calls.map((c: any[]) => [c[0], c[1].cardId, c[1].rating])).toEqual([['u1', 'c0', Rating.GOOD], ['u1', 'c1', Rating.GOOD]]);
  expect(s.left()).toBe(1);
});

it('sends Again to the back of the queue', async () => {
  const { s } = setup(2);
  await s.rate(Rating.AGAIN, T + 1000);
  expect(s.current()?.id).toBe('c1');
  await s.rate(Rating.GOOD, T + 2000);
  expect(s.current()?.id).toBe('c0');
});

it('records exactly one session when the deck is finished', async () => {
  const { s, enqueueSession } = setup(2);
  await s.rate(Rating.GOOD, T + 1000);
  await s.rate(Rating.EASY, T + 2000);
  expect(s.isComplete()).toBe(true);
  expect(enqueueSession).toHaveBeenCalledTimes(1);
  expect(enqueueSession.mock.calls[0][1]).toMatchObject({
    id: 's1', deckId: 'bio', startTime: T, endTime: T + 2000, cardsStudied: 2, correctAnswers: 2, totalAnswers: 2, accuracy: 100, duration: 2000,
  });
});

it('saves a partial session when the app is backgrounded mid-deck, then a second one on finishing', async () => {
  const { s, enqueueSession } = setup(10);
  for (let i = 0; i < 3; i++) await s.rate(Rating.GOOD, T + (i + 1) * 1000);
  await s.background(T + 5000);
  expect(enqueueSession).toHaveBeenCalledTimes(1);
  expect(enqueueSession.mock.calls[0][1]).toMatchObject({ id: 's1', cardsStudied: 3 });
  s.resume(T + 60_000);
  for (let i = 0; i < 7; i++) await s.rate(Rating.GOOD, T + 61_000 + i * 1000);
  expect(enqueueSession).toHaveBeenCalledTimes(2);
  expect(enqueueSession.mock.calls[1][1]).toMatchObject({ id: 's2', cardsStudied: 7, startTime: T + 60_000 });
});

it('does not record an empty segment', async () => {
  const { s, enqueueSession } = setup(3);
  await s.background(T + 1000);
  await s.close(T + 2000);
  expect(enqueueSession).not.toHaveBeenCalled();
});

it('is complete at once with nothing due, and records no session', () => {
  const { s, enqueueSession } = setup(0);
  expect(s.isComplete()).toBe(true);
  expect(s.current()).toBeNull();
  expect(enqueueSession).not.toHaveBeenCalled();
});

it('tracks how well the session is going', async () => {
  const { s } = setup(4);
  await s.rate(Rating.GOOD, T + 1);
  await s.rate(Rating.AGAIN, T + 2);
  expect(s.goodRatio()).toBe(0.5);
});
