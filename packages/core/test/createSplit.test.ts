import { expect, it } from 'vitest';
import { COURSE_SIZES, MAX_PIECE_CHARS, MAX_PIECES, splitSource } from '../src';

it('names the three course sizes', () => {
  expect(COURSE_SIZES).toEqual({ quick: 10, standard: 20, deep: 35 });
});

it('keeps short text as one piece with the whole target', () => {
  expect(splitSource('Mitochondria make ATP.', 20)).toEqual({ pieces: [{ text: 'Mitochondria make ATP.', cards: 20 }], truncated: false });
});

it('splits at paragraph breaks under the piece limit', () => {
  const para = 'A'.repeat(4000);
  const { pieces } = splitSource(`${para}\n\n${para}\n\n${para}`, 20);
  expect(pieces.length).toBe(3);
  expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS)).toBe(true);
  expect(pieces.reduce((n, p) => n + p.cards, 0)).toBe(20);
});

it('splits text with no paragraph breaks', () => {
  const text = 'This is one sentence. '.repeat(1000); // 22,000 chars, no blank lines
  const { pieces } = splitSource(text, 35);
  expect(pieces.length).toBeGreaterThan(1);
  expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS && p.text.length > 0)).toBe(true);
  expect(pieces.every((p) => /\.$/.test(p.text))).toBe(true); // cut at sentence ends
});

// A fetched web page is one huge paragraph. Decimals, abbreviations and
// domains used to make the sentence matcher skip (and drop) the text before
// their dot: a course built from fragments.
it('loses no text when splitting a long paragraph with decimals and abbreviations', () => {
  const sentence = 'The value of pi is 3.14 roughly. Version 2.0 shipped in the U.S. in 2024! See e.g. example.com for more? ';
  const text = sentence.repeat(200).trim(); // ~21,000 chars, no blank lines
  const { pieces, truncated } = splitSource(text, 35);
  expect(truncated).toBe(false);
  expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS)).toBe(true);
  expect(pieces.map((p) => p.text).join(' ')).toBe(text);
});

it('hard-cuts a single sentence longer than the limit', () => {
  const { pieces } = splitSource('x'.repeat(MAX_PIECE_CHARS * 2 + 10), 10);
  expect(pieces.map((p) => p.text.length)).toEqual([MAX_PIECE_CHARS, MAX_PIECE_CHARS, 10]);
});

it('caps at 8 pieces and reports truncation', () => {
  const r = splitSource('word '.repeat(20000), 35);
  expect(r.pieces.length).toBe(MAX_PIECES);
  expect(r.truncated).toBe(true);
});

it('gives every piece at least 2 cards', () => {
  const { pieces } = splitSource(`${'A'.repeat(5900)}\n\n${'B'.repeat(50)}`, 10);
  expect(Math.min(...pieces.map((p) => p.cards))).toBeGreaterThanOrEqual(2);
});

it('collapses runs of whitespace and keeps multibyte text intact', () => {
  expect(splitSource('Ça   va\t\tbien 🙂', 10).pieces[0].text).toBe('Ça va bien 🙂');
});

it('returns no pieces for blank text', () => {
  expect(splitSource('  \n\n \t ', 10)).toEqual({ pieces: [], truncated: false });
});
