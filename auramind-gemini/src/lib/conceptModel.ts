/**
 * conceptModel — the concept-level knowledge model behind Prof. Linnea.
 *
 * Cards don't carry tags, so concepts are derived from card *fronts*: we
 * extract meaningful terms, group weak cards by the term that best covers
 * them, and aggregate lapses/difficulty per concept. The result is what lets
 * Linnea say "you struggle with photosynthesis — specifically the Calvin
 * cycle" instead of "you forgot 4 cards."
 *
 * Pure functions only — no Supabase, no AI calls, unit-testable.
 */
import type { Card, Deck } from '../types';

export interface ConceptWeakness {
  /** The concept label (derived term, e.g. "photosynthesis"). */
  concept: string;
  /** Number of weak cards grouped under this concept. */
  weakCardCount: number;
  /** Total lapses across those cards. */
  totalLapses: number;
  /** Average FSRS difficulty (1-10) when any card has it. */
  avgDifficulty?: number;
  /** Up to 3 representative weak cards for the prompt. */
  topCards: Array<{ term: string; lapses: number }>;
}

/** Times a card has been forgotten — top-level column, FSRS fallback. */
export function cardLapses(c: Card): number {
  return c.lapses ?? c.fsrsState?.lapses ?? 0;
}

/** A card is "consistently forgotten" once it has lapsed at least twice. */
export const WEAK_LAPSE_THRESHOLD = 2;

/** Words that carry little concept signal on their own. */
const GENERIC_TERMS = new Set([
  'cycle', 'process', 'reaction', 'system', 'function', 'structure',
  'concept', 'method', 'theory', 'principle', 'example', 'difference',
  'relationship', 'role', 'thing', 'type', 'kind', 'part', 'step',
  'stage', 'level', 'form', 'model', 'idea', 'effect', 'cause', 'result',
  'definition', 'meaning', 'important', 'describe', 'explain', 'define',
  'between', 'during', 'because', 'called', 'known', 'used', 'use', 'using',
  'happens', 'happen', 'occurs', 'occur', 'makes', 'make', 'causes', 'allows',
  'powers', 'explains', 'describes', 'contains', 'consists', 'involves',
  'includes', 'including', 'refers', 'means', 'requires', 'located', 'occurs',
]);

const STOPWORDS = new Set([
  'with', 'from', 'that', 'this', 'what', 'which', 'when', 'where', 'why',
  'how', 'the', 'and', 'for', 'are', 'was', 'were', 'your', 'you', 'our',
  'not', 'have', 'has', 'its', 'into', 'about', 'than', 'then', 'they',
  'them', 'their', 'will', 'would', 'could', 'should', 'can', 'does',
  'doing', 'made', 'after', 'before', 'through', 'these', 'those', 'there',
  'being', 'been', 'both', 'each', 'such', 'only', 'other', 'over', 'under',
  'again', 'once', 'also', 'just', 'some', 'any', 'all', 'but', 'out', 'own',
  'same', 'very', 'may', 'might', 'who', 'whom', 'whose', 'without', 'within',
  'above', 'below', 'than', 'too', 'off', 'into', 'onto', 'upon', 'while',
]);

/** Extract candidate concept terms from a card front. */
export function extractConceptTerms(front: string): string[] {
  const words = front
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w),
    );
  // Multi-word compounds first — "calvin cycle" is a strong concept even
  // though its second half is a generic word like "cycle". Compounds are
  // built BEFORE the generic-term filter so those survive.
  const compounds: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (pair.length >= 8) compounds.push(pair);
  }
  // Single words survive only when they aren't generic.
  const singles = words.filter((w) => !GENERIC_TERMS.has(w));
  return [...new Set([...compounds, ...singles])];
}

/**
 * Aggregate weak cards (lapses >= 2) into concept-level weaknesses.
 *
 * Each weak card is assigned to the single extracted term that best covers
 * it (most cards sharing the term, weighted against generic words), so the
 * resulting groups are mostly disjoint and ranked by total lapses.
 * Falls back to deck-title grouping when no terms can be extracted.
 */
export function buildConceptWeaknesses(cards: Card[], decks: Deck[]): ConceptWeakness[] {
  const weak = cards.filter((c) => cardLapses(c) >= WEAK_LAPSE_THRESHOLD);
  if (weak.length === 0) return [];

  // term -> { cardCount, totalLapses }
  const termStats = new Map<string, { cardCount: number; totalLapses: number }>();
  const cardTerms = new Map<string, string[]>();
  for (const c of weak) {
    const terms = extractConceptTerms(c.front);
    cardTerms.set(c.id, terms);
    for (const t of new Set(terms)) {
      const s = termStats.get(t) ?? { cardCount: 0, totalLapses: 0 };
      s.cardCount++;
      s.totalLapses += cardLapses(c);
      termStats.set(t, s);
    }
  }

  // Greedy assignment: each weak card goes to its best-covering term.
  const byConcept = new Map<string, Card[]>();
  for (const c of weak) {
    const terms = cardTerms.get(c.id) ?? [];
    if (terms.length === 0) continue;
    let best = terms[0];
    let bestScore = -1;
    for (const t of terms) {
      const s = termStats.get(t)!;
      const score =
        s.cardCount * 2 + Math.min(s.totalLapses, 6) + (t.includes(' ') ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    const group = byConcept.get(best) ?? [];
    group.push(c);
    byConcept.set(best, group);
  }

  const makeWeakness = (label: string, group: Card[]): ConceptWeakness => {
    const lapses = group.reduce((sum, c) => sum + cardLapses(c), 0);
    const difficulties = group
      .map((c) => c.fsrsState?.difficulty)
      .filter((d): d is number => d != null);
    return {
      concept: label,
      weakCardCount: group.length,
      totalLapses: lapses,
      avgDifficulty:
        difficulties.length > 0
          ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
          : undefined,
      topCards: group
        .slice()
        .sort((a, b) => cardLapses(b) - cardLapses(a))
        .slice(0, 3)
        .map((c) => ({ term: c.front.slice(0, 80), lapses: cardLapses(c) })),
    };
  };

  const result: ConceptWeakness[] = [];
  for (const [term, group] of byConcept) {
    result.push(makeWeakness(term, group));
  }

  // Fallback: nothing extractable — group by deck instead.
  if (result.length === 0) {
    const deckTitle = new Map<string, string>(decks.map((d) => [d.id, d.title]));
    const byDeck = new Map<string, Card[]>();
    for (const c of weak) {
      const group = byDeck.get(c.deckId) ?? [];
      group.push(c);
      byDeck.set(c.deckId, group);
    }
    for (const [deckId, group] of byDeck) {
      result.push(makeWeakness(deckTitle.get(deckId) ?? 'This deck', group));
    }
  }

  return result.sort((a, b) => b.totalLapses - a.totalLapses).slice(0, 4);
}
