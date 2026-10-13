// @vitest-environment jsdom
import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

import { useStudyStats } from '../hooks/useStudyStats';
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
let deckId: string;
const createdSessionIds: string[] = [];

async function createSession(overrides: Record<string, any> = {}) {
  const { data, error } = await admin.from('study_sessions').insert({
    user_id: userId,
    deck_id: deckId,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    cards_reviewed: 5,
    cards_correct: 4,
    cards_studied: 5,
    duration_ms: 300000,
    ...overrides,
  }).select().single();
  if (error) throw error;
  createdSessionIds.push(data!.id);
  return data!;
}

// These hooks stay at file scope so the fixture user outlives BOTH suites
// below; scoping them to the first suite would delete the user before the
// second one runs. They no-op without credentials, when both suites skip.
beforeAll(async () => {
  if (!hasAdminCreds) return;
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = `stats-${Date.now()}@bonamind-test.local`;
  const { data: { user }, error: signupErr } = await admin.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
  });
  if (signupErr) throw signupErr;
  userId = user!.id;

  const { data: d } = await admin.from('decks').insert({ user_id: userId, name: 'StatsTest' }).select().single();
  deckId = d!.id;

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
});

afterAll(async () => {
  if (!hasAdminCreds) return;
  if (createdSessionIds.length) {
    await admin.from('study_sessions').delete().in('id', createdSessionIds);
  }
  await admin.from('decks').delete().eq('id', deckId);
  await requireSupabase().auth.signOut();
  await admin.auth.admin.deleteUser(userId);
});

afterEach(async () => {
  if (!hasAdminCreds) return;
  if (createdSessionIds.length) {
    await admin.from('study_sessions').delete().in('id', createdSessionIds);
    createdSessionIds.length = 0;
  }
});

describe.skipIf(!hasAdminCreds)('useStudyStats', () => {
  it('handles a missing userId gracefully', async () => {
    const { result } = renderHook(() => useStudyStats(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cardsReviewedToday).toBe(0);
    expect(result.current.totalReviews).toBe(0);
    expect(result.current.streak).toBe(0);
  });

  it('surfaces fetch errors without throwing', async () => {
    const { result } = renderHook(() => useStudyStats('non-existent-user'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.cardsReviewedToday).toBe(0);
    expect(result.current.totalReviews).toBe(0);
  });

  it('fetches data for a real user (service will error due to schema mismatch)', async () => {
    const { result } = renderHook(() => useStudyStats(userId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sessions).toBeDefined();
    expect(result.current.cardsReviewedToday).toBe(0);
  });

  it('exposes a refresh function', async () => {
    const { result } = renderHook(() => useStudyStats(userId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refresh).toBe('function');
  });
});

// Sibling of the suite above, not nested in it (the indentation is
// misleading), so it needs its own credential guard.
describe.skipIf(!hasAdminCreds)('study_sessions direct DB access', () => {
    // Each test asserts on its OWN sessions — wipe prior rows so the
    // per-test expectations (exact sums/counts) are order-independent.
    beforeEach(async () => {
      await admin.from('study_sessions').delete().eq('user_id', userId);
    });

    it('creates a session with correct columns', async () => {
    const s = await createSession({ cards_reviewed: 3, cards_correct: 2 });
    expect(s.id).toBeTruthy();
    expect(s.user_id).toBe(userId);
    expect(s.cards_reviewed).toBe(3);
    expect(s.cards_correct).toBe(2);
  });

  it('fetches sessions with started_at in ISO format', async () => {
    await createSession({ cards_reviewed: 5 });
    const { data } = await admin.from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(typeof data![0].started_at).toBe('string');
    expect(typeof data![0].ended_at).toBe('string');
  });

  it('computes real cards_reviewed sum from sessions', async () => {
    await createSession({ cards_reviewed: 5 });
    await createSession({ cards_reviewed: 7 });
    const { data } = await admin.from('study_sessions')
      .select('cards_reviewed, id')
      .eq('user_id', userId);
    const sum = data!.reduce((a: number, r: any) => a + r.cards_reviewed, 0);
    expect(sum).toBe(12);
  });
});
