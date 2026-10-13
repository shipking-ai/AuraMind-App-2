import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

import { dbService } from '../services/database/dbService';
import { requireSupabase } from '../services/database/supabase';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// These are integration tests against a real project. Without admin
// credentials they cannot run, so skip rather than fail: CI has no
// service-role key and createClient('', '') throws at import.
const hasAdminCreds = Boolean(url && serviceKey);

// Built lazily inside the suite: createClient('', '') throws at call time,
// so constructing it at module scope would fail the file before skipIf runs.
let admin: any;

let userId: string;
let deckAId: string;
let deckBId: string;
let cardId: string;

describe.skipIf(!hasAdminCreds)('dbService', () => {
beforeAll(async () => {
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = `test-${Date.now()}@bonamind-test.local`;
  const { data: { user }, error: signupErr } = await admin.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
  });
  if (signupErr) throw signupErr;
  userId = user!.id;

  // CAPTCHA protection is enforced on the live project: signInWithPassword
  // without a real Turnstile token is rejected headlessly. Mint the session
  // through the admin API's magiclink OTP path instead — verification is not
  // captcha-gated, and it produces the same RLS-scoped user session.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { error: verifyErr } = await requireSupabase().auth.verifyOtp({
    token_hash: link!.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw verifyErr;

  const { data: d1 } = await admin.from('decks').insert({ user_id: userId, name: 'Alpha', description: 'First deck' }).select().single();
  deckAId = d1!.id;
  const { data: d2 } = await admin.from('decks').insert({ user_id: userId, name: 'Beta', description: 'Second deck' }).select().single();
  deckBId = d2!.id;

  const { data: c } = await admin.from('cards').insert({
    user_id: userId, deck_id: deckAId, front: 'Q1', back: 'A1',
  }).select().single();
  cardId = c!.id;
});

afterAll(async () => {
  await admin.from('cards').delete().eq('id', cardId);
  await admin.from('decks').delete().in('id', [deckAId, deckBId]);
  await requireSupabase().auth.signOut();
  await admin.auth.admin.deleteUser(userId);
});

  it('clearCache should not throw', () => {
    expect(() => dbService.clearCache()).not.toThrow();
  });

  describe('fetchDecks', () => {
    it('should fetch decks for the test user', async () => {
      dbService.clearCache();
      const decks = await dbService.fetchDecks(userId);
      expect(decks.length).toBeGreaterThanOrEqual(2);
      expect(decks.some(d => d.id === deckAId)).toBe(true);
      expect(decks.some(d => d.id === deckBId)).toBe(true);
    });

    it('should include title and description in results', async () => {
      dbService.clearCache();
      const decks = await dbService.fetchDecks(userId);
      const alpha = decks.find(d => d.id === deckAId);
      expect(alpha).toBeDefined();
      expect(alpha!.title).toBe('Alpha');
      expect(alpha!.description).toBe('First deck');
    });
  });

  describe('createDeck', () => {
    it('should create a new deck and return it', async () => {
      dbService.clearCache();
      const deck = await dbService.createDeck(userId, 'Temp Deck', 'Temp desc');
      expect(deck.title).toBe('Temp Deck');
      expect(deck.description).toBe('Temp desc');
      expect(deck.cardCount).toBe(0);
      await admin.from('decks').delete().eq('id', deck.id);
    });
  });

  describe('updateDeck', () => {
    it('should update deck properties', async () => {
      const updated = await dbService.updateDeck(deckAId, { title: 'Alpha Updated' });
      expect(updated.title).toBe('Alpha Updated');
      const { data: check } = await admin.from('decks').select('name').eq('id', deckAId).single();
      expect(check!.name).toBe('Alpha Updated');
      await admin.from('decks').update({ name: 'Alpha' }).eq('id', deckAId);
    });
  });

  describe('deleteDeck', () => {
    it('should delete a deck', async () => {
      const { data: d } = await admin.from('decks').insert({ user_id: userId, name: 'ToDelete' }).select().single();
      await dbService.deleteDeck(d!.id);
      const { data: check } = await admin.from('decks').select('id').eq('id', d!.id);
      expect(check).toHaveLength(0);
    });
  });

  describe('fetchCards', () => {
    it('should fetch cards for the test user', async () => {
      dbService.clearCache();
      const cards = await dbService.fetchCards(userId);
      expect(cards.length).toBeGreaterThanOrEqual(1);
      expect(cards.some(c => c.id === cardId)).toBe(true);
      expect(cards.find(c => c.id === cardId)!.front).toBe('Q1');
    });
  });

  describe('saveCards', () => {
    it('should save cards via REST API and return them', async () => {
      const cards = await dbService.saveCards(userId, [
        { deckId: deckAId, front: 'New Q', back: 'New A' },
      ]);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('New Q');
      await admin.from('cards').delete().eq('id', cards[0].id);
    });
  });

  describe('updateCard', () => {
    it('should update card front', async () => {
      const updated = await dbService.updateCard(cardId, { front: 'Updated Q' } as any);
      expect(updated.front).toBe('Updated Q');
      await admin.from('cards').update({ front: 'Q1' }).eq('id', cardId);
    });
  });

  describe('deleteCard', () => {
    it('should delete a card', async () => {
      const { data: c } = await admin.from('cards').insert({ user_id: userId, deck_id: deckAId, front: 'del', back: 'del' }).select().single();
      await dbService.deleteCard(c!.id);
      const { data: check } = await admin.from('cards').select('id').eq('id', c!.id);
      expect(check).toHaveLength(0);
    });
  });
});
