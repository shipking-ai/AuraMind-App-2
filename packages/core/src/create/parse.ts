/**
 * Reading cards out of a model's reply. Free-tier models wrap JSON in prose
 * or code fences, use either key naming, and repeat themselves; none of that
 * should cost the user a course.
 */
export interface DraftCard {
  front: string;
  back: string;
}

export const MAX_SIDE_CHARS = 600;

/** Every plausible JSON value in the reply, best candidates first. */
function jsonCandidates(reply: string): unknown[] {
  const texts: string[] = [];
  const fence = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) texts.push(fence[1]);
  texts.push(reply);
  const arr = reply.slice(reply.indexOf('['), reply.lastIndexOf(']') + 1);
  if (arr.length > 1) texts.push(arr);
  const obj = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  if (obj.length > 1) texts.push(obj);
  const out: unknown[] = [];
  for (const t of texts) {
    try { out.push(JSON.parse(t.trim())); } catch { /* not this one */ }
  }
  return out;
}

function toCard(raw: unknown): DraftCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const front = r.question ?? r.front;
  const back = r.answer ?? r.back;
  if (typeof front !== 'string' || typeof back !== 'string') return null;
  const f = front.trim();
  const b = back.trim();
  if (!f || !b || f.length > MAX_SIDE_CHARS || b.length > MAX_SIDE_CHARS) return null;
  return { front: f, back: b };
}

const dedupeKey = (front: string) => front.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');

/** Keeps the first card for each question, ignoring case, punctuation and spacing. */
export function dedupeCards(cards: DraftCard[]): DraftCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const k = dedupeKey(c.front);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function cardsFrom(value: unknown): DraftCard[] | null {
  const list = Array.isArray(value) ? value : (value as { cards?: unknown })?.cards;
  if (!Array.isArray(list)) return null;
  return dedupeCards(list.map(toCard).filter((c): c is DraftCard => c !== null));
}

/** Cards from a reply; [] when nothing usable is in it. Never throws. */
export function parseCards(reply: string): DraftCard[] {
  for (const value of jsonCandidates(reply)) {
    const cards = cardsFrom(value);
    if (cards) return cards;
  }
  return [];
}

/** A topic reply's title, description and cards; null when it has no deck object. */
export function parseTopicDeck(reply: string): { title: string; description: string; cards: DraftCard[] } | null {
  for (const value of jsonCandidates(reply)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as { title?: unknown; description?: unknown };
    const cards = cardsFrom(value);
    if (!cards) continue;
    return {
      title: typeof v.title === 'string' ? v.title.trim() : '',
      description: typeof v.description === 'string' ? v.description.trim() : '',
      cards,
    };
  }
  return null;
}
