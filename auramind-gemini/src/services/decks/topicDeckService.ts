import type { Card, Deck } from '../../types';
import { dbService } from '../database/dbService';
import { getInitialCardState } from '../study/srs';
import { generateDeckFromTopic } from '../api/groqService';
import {
  STARTER_CARDS,
  STARTER_DECK_DESCRIPTION,
  STARTER_DECK_TITLE,
} from '../../data/starterDeck';

/**
 * Creates a deck from a user's onboarding topic.
 *
 * Tries the AI deck generator first (Groq with the offline template as a
 * fallback), so a new user gets cards on the thing they actually typed at
 * onboarding. Degrades to the offline starter deck when AI is entirely
 * unavailable, keeping the "pre-made cards wait for you" promise true even
 * offline.
 *
 * Cards go through `getInitialCardState` exactly like every other deck, so
 * the first review enters FSRS in the same due-now state as any generated
 * deck.
 */
export async function createTopicDeck(
  userId: string,
  topic: string,
): Promise<{ deck: Deck; cards: Card[] }> {
  const trimmed = topic.trim();
  const clean = trimmed && trimmed.replace(/\s+/g, ' ');

  let title = STARTER_DECK_TITLE;
  let description = STARTER_DECK_DESCRIPTION;
  let seeds = STARTER_CARDS;

  if (clean) {
    try {
      const generated = await generateDeckFromTopic(clean);
      if (generated?.cards?.length) {
        title = generated.title || clean;
        description = generated.description || `AuraMind starter deck on "${clean}".`;
        seeds = generated.cards.map((c) => ({
          front: c.question,
          back: c.answer,
        }));
      }
    } catch {
      title = `Getting started: ${clean}`;
      description = `A starter deck on "${clean}", built for your first session.`;
    }
  }

  const deck = await dbService.createDeck(userId, title, description);
  const seeded: Partial<Card>[] = seeds.map((seed) => ({
    ...getInitialCardState(deck.id, seed.front, seed.back),
    deckId: deck.id,
  }));
  const cards = await dbService.saveCards(userId, seeded);
  return { deck, cards };
}