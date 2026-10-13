import { describe, expect, it, vi } from 'vitest';
import { buildCourse, CreateError, MAX_PIECE_CHARS, type BuildProgress, type CourseSource } from '../src';

type Reply = string | CreateError;
/** An ask() that plays back replies (or throws errors) in order. */
function scripted(...replies: Reply[]) {
  return vi.fn(async (_prompt: string) => {
    const next = replies.shift();
    if (next === undefined) throw new Error('ask called more times than scripted');
    if (next instanceof CreateError) throw next;
    return next;
  });
}
const cards = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ question: `${tag}-${i + 1}?`, answer: `ans ${tag} ${i + 1}` }));
const cardsArrayJson = (n: number, tag: string) => JSON.stringify(cards(n, tag));
const deckJson = (n: number, tag: string, title = 'Cells') => JSON.stringify({ title, description: 'About cells', cards: cards(n, tag) });
const rate = () => new CreateError('rate_limited');
const sub = () => new CreateError('subscription');
const offline = () => new CreateError('offline');
const noSleep = () => vi.fn(async (_ms: number) => {});

/** Two pieces' worth of text (two paragraphs that cannot share one piece). */
function twoPieceText(): CourseSource {
  const para = 'Cells divide. '.repeat(Math.ceil((MAX_PIECE_CHARS * 0.7) / 14));
  return { kind: 'text', text: `${para}\n\n${para.replace(/Cells/g, 'Atoms')}`, title: 'Biology notes', label: 'your PDF' };
}

describe('buildCourse', () => {
  it('builds a topic course from one call', async () => {
    const ask = scripted(deckJson(20, 'a'));
    const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'standard', ask, sleep: noSleep() });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d).toMatchObject({ title: 'Cells', description: 'About cells', truncated: false, skippedPieces: 0 });
    expect(d.cards).toHaveLength(20);
  });

  it('falls back to the topic as the title when the model omits one', async () => {
    const ask = scripted(JSON.stringify({ cards: cards(10, 'a') }));
    const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'quick', ask, sleep: noSleep() });
    expect(d.title).toBe('Cells');
  });

  it('makes a second, non-repeating call for a deep topic', async () => {
    const ask = scripted(deckJson(20, 'a'), cardsArrayJson(15, 'b'));
    const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'deep', ask, sleep: noSleep() });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toMatch(/a-1\?/);
    expect(d.cards).toHaveLength(35);
  });

  it('reports progress in order and per card', async () => {
    const seen: BuildProgress[] = [];
    await buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(cardsArrayJson(10, 'a'), cardsArrayJson(10, 'b')), onProgress: (p) => seen.push(p), sleep: noSleep() });
    expect(seen.map((p) => p.step).filter((s, i, a) => s !== a[i - 1])).toEqual(['reading', 'ideas', 'writing', 'done']);
    const counts = seen.filter((p) => p.step === 'writing').map((p) => p.cardsSoFar);
    expect(counts).toEqual([...counts].sort((x, y) => x - y));
    expect(seen.at(-1)).toMatchObject({ step: 'done', cardsSoFar: 20, target: 20 });
    expect(seen.find((p) => p.latest)?.latest).toEqual({ front: 'a-1?', back: 'ans a 1' });
  });

  it('titles a text course after its source and describes where it came from', async () => {
    const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(cardsArrayJson(10, 'a'), cardsArrayJson(10, 'b')), sleep: noSleep() });
    expect(d).toMatchObject({ title: 'Biology notes', description: 'From your PDF' });
  });

  it('retries a bad piece once, then skips it', async () => {
    const ask = scripted('not json', 'still not json', cardsArrayJson(10, 'b'));
    const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask, sleep: noSleep() });
    expect(ask).toHaveBeenCalledTimes(3);
    expect(d.skippedPieces).toBe(1);
    expect(d.cards).toHaveLength(10);
  });

  it('retries a busy piece once', async () => {
    const ask = scripted(new CreateError('busy'), cardsArrayJson(10, 'a'), cardsArrayJson(10, 'b'));
    const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask, sleep: noSleep() });
    expect(d.skippedPieces).toBe(0);
    expect(d.cards).toHaveLength(20);
  });

  it('waits 3s then 8s on rate limits before skipping', async () => {
    const sleep = noSleep();
    const ask = scripted(rate(), rate(), rate(), cardsArrayJson(10, 'b'));
    const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask, sleep });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 8000]);
    expect(d.skippedPieces).toBe(1);
  });

  it('aborts the whole build on 402', async () => {
    await expect(buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(sub()), sleep: noSleep() })).rejects.toMatchObject({ kind: 'subscription' });
  });

  it('fails with empty when no piece yields cards', async () => {
    await expect(buildCourse({ source: twoPieceText(), size: 'quick', ask: scripted('x', 'x', 'x', 'x'), sleep: noSleep() })).rejects.toMatchObject({ kind: 'empty' });
  });

  it('fails as unreadable for a text source with nothing in it', async () => {
    const ask = scripted();
    await expect(buildCourse({ source: { kind: 'text', text: '   ', title: 't', label: 'l' }, size: 'quick', ask, sleep: noSleep() })).rejects.toMatchObject({ kind: 'unreadable' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('dedupes across pieces and caps at the target', async () => {
    const d = await buildCourse({ source: twoPieceText(), size: 'quick', ask: scripted(cardsArrayJson(8, 'a'), cardsArrayJson(8, 'a')), sleep: noSleep() });
    expect(d.cards).toHaveLength(8);
    const d2 = await buildCourse({ source: twoPieceText(), size: 'quick', ask: scripted(cardsArrayJson(8, 'a'), cardsArrayJson(8, 'b')), sleep: noSleep() });
    expect(d2.cards).toHaveLength(10);
  });

  it('carries truncation from splitSource', async () => {
    const huge = Array.from({ length: 10 }, (_, i) => `Para ${i}. ${'word '.repeat(1300)}`).join('\n\n');
    const ask = vi.fn(async () => cardsArrayJson(3, String(ask.mock.calls.length)));
    const d = await buildCourse({ source: { kind: 'text', text: huge, title: 't', label: 'l' }, size: 'deep', ask, sleep: noSleep() });
    expect(d.truncated).toBe(true);
    expect(ask).toHaveBeenCalledTimes(8);
  });

  it('stops on offline with the cards so far, and resumes after the last finished piece', async () => {
    const err = await buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(cardsArrayJson(10, 'a'), offline()), sleep: noSleep() }).catch((e) => e);
    expect(err).toBeInstanceOf(CreateError);
    expect(err).toMatchObject({ kind: 'offline', partial: { donePieces: 1 } });
    expect(err.partial.cards).toHaveLength(10);
    const ask = scripted(cardsArrayJson(10, 'b'));
    const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask, resume: err.partial, sleep: noSleep() });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.cards).toHaveLength(20);
  });
});

describe('buildCourse, after review', () => {
  it('says rate_limited, not empty, when rate limits ate every piece', async () => {
    const ask = scripted(rate(), rate(), rate(), rate(), rate(), rate());
    await expect(buildCourse({ source: twoPieceText(), size: 'standard', ask, sleep: noSleep() })).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('pauses a topic build that goes offline and resumes into the second round', async () => {
    const err = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'deep', ask: scripted(deckJson(20, 'a', 'Cell biology'), offline()), sleep: noSleep() }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'offline', partial: { donePieces: 1, title: 'Cell biology', description: 'About cells' } });
    expect(err.partial.cards).toHaveLength(20);
    const ask = scripted(cardsArrayJson(15, 'b'));
    const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'deep', ask, resume: err.partial, sleep: noSleep() });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d).toMatchObject({ title: 'Cell biology', description: 'About cells' });
    expect(d.cards).toHaveLength(35);
  });

  it('keeps every prompt inside the proxy limit, however long the topic or avoid list', async () => {
    const longFronts = Array.from({ length: 20 }, (_, i) => ({ question: `${'q'.repeat(590)}${i}`, answer: 'a' }));
    const ask = scripted(JSON.stringify({ title: 't', description: 'd', cards: longFronts }), cardsArrayJson(15, 'b'));
    await buildCourse({ source: { kind: 'topic', topic: 'x'.repeat(5000) }, size: 'deep', ask, sleep: noSleep() });
    for (const [prompt] of ask.mock.calls) expect(prompt.length).toBeLessThanOrEqual(7500);
  });

  it('never reports cards beyond the target', async () => {
    const seen: BuildProgress[] = [];
    await buildCourse({ source: twoPieceText(), size: 'quick', ask: scripted(cardsArrayJson(8, 'a'), cardsArrayJson(8, 'b')), onProgress: (p) => seen.push(p), sleep: noSleep() });
    expect(Math.max(...seen.map((p) => p.cardsSoFar))).toBe(10);
  });
});
