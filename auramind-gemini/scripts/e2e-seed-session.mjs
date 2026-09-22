/**
 * Seeds a captcha-free authenticated session for E2E tests.
 *
 * Turnstile gates the password grant, and fighting the widget in tests is a
 * losing game (see HANDOFF.md). The reliable path is GoTrue's admin API:
 *
 *   1. `generate_link` (service role) — creates/returns a magic-link URL with
 *      a token the server will happily verify.
 *   2. GET the verification URL — exactly what clicking a magic link does, so
 *      GoTrue establishes a real session and the client exchanges it for a
 *      full session (the code path real users exercise through CallbackPage).
 *
 * The Playwright storage state is written to
 * `e2e/.auth/<name>.json` for `{ storageState: ... }` reuse.
 *
 * Usage:
 *   node scripts/e2e-seed-session.mjs --email e2e-onboarding@example.com --name onboarding
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (repo-root .env).
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const repoRoot = resolve(appDir, '..');

// ── Minimal argv ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const email = arg('--email', `e2e-${Date.now()}@example.com`);
const password = arg('--password', `E2e-pass-${Math.random().toString(36).slice(2)}!a`);
const name = arg('--name', 'onboarding');
const baseUrl = arg('--base-url', 'http://localhost:3001');
const onboarded = !argv.includes('--fresh');
const withSparkDeck = argv.includes('--with-spark-deck');

// ── Load service-role key from the repo-root .env (same source migrate uses) ─
function loadRootEnv() {
  try {
    const raw = readFileSync(resolve(repoRoot, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no root .env — rely on the exported environment */
  }
}
loadRootEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (root .env or shell env).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Provision (or reuse) the user. generate_link with CREATE turns a
  //    signup into a single shot; reuse tolerates repeat runs.
  let userId;
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find((u) => u.email === email);
  if (existing) {
    userId = existing.id;
    console.log(`reusing user ${email} (${userId})`);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = created.user.id;
    console.log(`created user ${email} (${userId})`);
  }

  // 2. Reset metadata per scenario.
  const metadata = onboarded
    ? { role: 'student', onboarding_topic: 'Cell biology', onboarding_completed: true }
    : {};
  // Entitlement lives in app_metadata (service-role only). Spark E2E needs
  // the dashboard, which the paywall guards, so only those accounts get an
  // active subscription; onboarding E2E must still land on /subscribe. The
  // existing app_metadata is spread first so a reused account keeps its role.
  const { data: current } = await admin.auth.admin.getUserById(userId);
  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
    ...(withSparkDeck
      ? { app_metadata: { ...(current?.user?.app_metadata ?? {}), subscription_status: 'active' } }
      : {}),
  });
  if (updateErr) throw updateErr;

  // 2b. Optional: seed a deck + cards with FSRS state in the memory-spark
  //     retrievability band (0.65–0.90). Service-role inserts bypass RLS, and
  //     rows are keyed to this user so normal sign-out hygiene covers them.
  //     The card 'Luke?' front/back pair matches the spark E2E assertions.
  if (withSparkDeck) {
    const nowIso = new Date().toISOString();
    const { data: deck, error: deckErr } = await admin
      .from('decks')
      .insert({ user_id: userId, name: 'E2E Spark Deck', description: 'memory spark e2e', created_at: nowIso })
      .select()
      .single();
    if (deckErr) throw deckErr;

    const DAY = 24 * 60 * 60 * 1000;
    // R = (1 + elapsed/S)^-1 with S = 10 days: elapsed ≈ 2.5 days → R ≈ 0.8.
    // last_reviewed 2.5 days ago also clears the 3 h re-review floor.
    const lastReviewed = new Date(Date.now() - 2.5 * DAY).toISOString();
    const fsrs = {
      stability: 10, difficulty: 5, elapsedDays: 2.5, scheduledDays: 14,
      repetitions: 3, lapses: 0, lastReview: Date.now() - 2.5 * DAY,
    };
    const { data: insertedCards, error: cardsErr } = await admin.from('cards').insert([
      {
        user_id: userId, deck_id: deck.id, front: 'Luke?', back: 'Your friend from the demo',
        interval: 14, ease_factor: 2.5, repetition: 3,
        last_reviewed: lastReviewed, fsrs_state: JSON.stringify(fsrs),
      },
      {
        user_id: userId, deck_id: deck.id, front: '42?', back: 'The answer',
        interval: 14, ease_factor: 2.5, repetition: 3,
        last_reviewed: lastReviewed, fsrs_state: JSON.stringify(fsrs),
      },
    ])
      .select('id, front');
    if (cardsErr) throw cardsErr;

    // Persist the seeded ids so the spec can deep-link to
    // /dashboard/spark/:cardId without scraping the UI.
    const seedInfoPath = resolve(appDir, 'e2e/.auth/spark-seed.json');
    mkdirSync(dirname(seedInfoPath), { recursive: true });
    writeFileSync(seedInfoPath, JSON.stringify({
      deckId: deck.id,
      cards: (insertedCards ?? []).map((c) => ({ id: c.id, front: c.front })),
    }, null, 2));
    console.log(`spark deck seeded (${deck.id})`);
  }

  // 3. Magic link → real browser session (never fights Turnstile).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw linkErr;

  // The verify URL 302s to the project's configured SITE_URL (auramind.app);
  // `redirect_to` cannot override it because localhost is not on the
  // project's redirect allowlist, and routing the browser's verify hop hits
  // the same TLS interception as direct navigation. So the verify hop runs
  // in NODE (redirect: manual), and only the token fragment is handed to the
  // browser: we navigate the LOCAL app's callback route with it. The SPA's
  // supabase client (detectSessionInURL) exchanges the fragment there and
  // stores the session on the localhost origin — exactly what a user clicking
  // a magic link on their machine gets.
  const verifyUrl = new URL(link.properties.action_link);
  const verifyResp = await fetch(verifyUrl, { redirect: 'manual' });
  const location = verifyResp.headers.get('location');
  if (!location) {
    throw new Error(`verify did not redirect (status ${verifyResp.status})`);
  }
  const tokenFragment = new URL(location).hash; // #access_token=...&refresh_token=...
  if (!tokenFragment || tokenFragment === '#') {
    throw new Error(`verify redirect carried no token fragment: ${location}`);
  }

  // Sandboxed/intercepted networks and clock drift can trip Chromium's TLS
  // checks; only localhost is visited from here on, but keep the relaxed
  // check for the initial about:blank probes some Playwright builds do.
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/auth/callback${tokenFragment}`, { waitUntil: 'domcontentloaded' });

  // Wait until the client exchanged the token and a session exists.
  await page.waitForFunction(
    () => {
      const keys = Object.keys(localStorage);
      return keys.some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    },
    { timeout: 20_000 },
  );

  // `--name` may be a bare label ("onboarding") or a full path; resolve both.
  const statePath = name.endsWith('.json') || name.includes('/') || name.includes('\\')
    ? resolve(name)
    : resolve(appDir, 'e2e/.auth', `${name}.json`);
  mkdirSync(dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  await browser.close();

  console.log(`storage state written: ${statePath}`);
  console.log(`email: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
