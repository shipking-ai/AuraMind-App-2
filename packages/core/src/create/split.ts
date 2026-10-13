/**
 * Splitting a long source (a PDF, a web page, photographed notes) into pieces
 * the AI proxy accepts. `/api/ai/chat` caps each message at 8,000 characters;
 * a piece leaves room for the prompt around it.
 */
export type CourseSize = 'quick' | 'standard' | 'deep';

/** Target card counts for the size picker. */
export const COURSE_SIZES: Record<CourseSize, number> = { quick: 10, standard: 20, deep: 35 };

export const MAX_PIECE_CHARS = 6000;
export const MAX_PIECES = 8;
const MIN_CARDS_PER_PIECE = 2;

export interface SourcePiece {
  text: string;
  cards: number;
}

/** Cuts text longer than the limit, at the last space when there is a reasonable one. */
function hardCut(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_PIECE_CHARS) {
    const space = rest.lastIndexOf(' ', MAX_PIECE_CHARS);
    const at = space > MAX_PIECE_CHARS / 2 ? space : MAX_PIECE_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** A paragraph over the limit becomes its sentences (and those, if still too long, hard cuts). */
function units(paragraph: string): { text: string; sep: string }[] {
  if (paragraph.length <= MAX_PIECE_CHARS) return [{ text: paragraph, sep: '\n\n' }];
  // Split after sentence punctuation that is followed by whitespace, keeping
  // every character: a matcher that consumed text dropped whatever preceded
  // a decimal or an abbreviation ("3.14", "e.g.", "U.S.").
  const sentences = paragraph.replace(/([.!?])\s+/g, '$1\u0000').split('\u0000');
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => hardCut(s))
    .map((text, i) => ({ text, sep: i === 0 ? '\n\n' : ' ' }));
}

/** Spreads the target over pieces by length (largest remainder), at least 2 each. */
function distribute(lengths: number[], target: number): number[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  const raw = lengths.map((l) => (target * l) / total);
  const alloc = raw.map((r) => Math.max(MIN_CARDS_PER_PIECE, Math.floor(r)));
  let diff = target - alloc.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; diff > 0; k = (k + 1) % alloc.length, diff--) alloc[byRemainder[k].i] += 1;
  const byLargest = alloc.map((n, i) => ({ i, n })).sort((a, b) => b.n - a.n);
  for (let k = 0; diff < 0 && byLargest.some(({ i }) => alloc[i] > MIN_CARDS_PER_PIECE); k = (k + 1) % alloc.length) {
    const { i } = byLargest[k];
    if (alloc[i] > MIN_CARDS_PER_PIECE) { alloc[i] -= 1; diff++; }
  }
  return alloc;
}

/**
 * Normalises whitespace, packs paragraphs (then sentences, then hard cuts)
 * into pieces of at most MAX_PIECE_CHARS, keeps the first MAX_PIECES, and
 * spreads the card target across them.
 */
export function splitSource(text: string, target: number): { pieces: SourcePiece[]; truncated: boolean } {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const texts: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    for (const u of units(p)) {
      if (!current) current = u.text;
      else if (current.length + u.sep.length + u.text.length <= MAX_PIECE_CHARS) current += u.sep + u.text;
      else { texts.push(current); current = u.text; }
    }
  }
  if (current) texts.push(current);

  const truncated = texts.length > MAX_PIECES;
  const kept = texts.slice(0, MAX_PIECES);
  if (!kept.length) return { pieces: [], truncated: false };
  const cards = distribute(kept.map((t) => t.length), target);
  return { pieces: kept.map((t, i) => ({ text: t, cards: cards[i] })), truncated };
}
