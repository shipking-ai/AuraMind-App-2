#!/usr/bin/env node
/**
 * verify-launch — pre-launch gate check for BonaMind.
 *
 * Runs the checks from STRIPE_LAUNCH_CHECKLIST.md as a single command so a
 * misconfigured launch can't slip through silently:
 *
 *   1. Required API env present (Stripe key, webhook secret, Supabase).
 *   2. Required client env present (price IDs, Supabase anon key).
 *   3. Stripe mode alignment — every client price ID must be retrievable with
 *      the configured STRIPE_SECRET_KEY AND match its mode (live/test).
 *
 * Usage (from api/):
 *   node scripts/verify-launch.mjs            # full check (calls Stripe API)
 *   node scripts/verify-launch.mjs --offline  # structural checks only, no network
 *
 * The --offline mode is CI-safe: it verifies env presence and cross-file mode
 * consistency (publishable key must match the secret key mode, price IDs must
 * be well-formed) without touching Stripe. Use it anywhere keys are missing.
 *
 * Exit code 0 = all green, 1 = at least one gate failed (details printed).
 * Read-only: the only network call is Stripe prices.retrieve (GET), which
 * never mutates anything.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ENV_PATH = path.resolve(__dirname, '..', '..', 'auramind-gemini', '.env');

const failures = [];
const passes = [];

function check(ok, label, detail = '') {
  if (ok) passes.push(label);
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const api = process.env; // api/.env loaded by dotenv/config
// Client env comes from auramind-gemini/.env, with any VITE_* env vars set in
// the shell (e.g. CI) taking precedence — the .env file doesn't exist in CI.
const client = {
  ...readEnvFile(CLIENT_ENV_PATH),
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('VITE_')),
  ),
};

const OFFLINE = process.argv.includes('--offline');
console.log(`BonaMind pre-launch verification${OFFLINE ? ' (offline — no Stripe API calls)' : ''}\n`);

// ── 1. API env ─────────────────────────────────────────────────────────────
const secretKey = api.STRIPE_SECRET_KEY || '';
const webhookSecret = api.STRIPE_WEBHOOK_SECRET || '';
check(Boolean(secretKey), '[api] STRIPE_SECRET_KEY present');
check(Boolean(webhookSecret), '[api] STRIPE_WEBHOOK_SECRET present');
check(
  Boolean(api.SUPABASE_URL || api.VITE_SUPABASE_URL),
  '[api] SUPABASE_URL present',
);
check(Boolean(api.SUPABASE_SERVICE_ROLE_KEY), '[api] SUPABASE_SERVICE_ROLE_KEY present');

// Restricted keys (rk_live_/rk_test_) carry the same mode encoding as
// secret keys — accept both so a restricted key doesn't read as UNKNOWN.
const isLiveKey = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_');
const isTestKey = secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_');
const keyMode = isLiveKey ? 'LIVE' : isTestKey ? 'TEST' : 'UNKNOWN';
check(isLiveKey || isTestKey,
  '[api] STRIPE_SECRET_KEY mode recognizable',
  `current mode: ${keyMode}${isLiveKey ? ' — ⚠️ live key active, be careful' : ''}`);

// ── 2. Client env ──────────────────────────────────────────────────────────
const priceIds = {
  monthly: client.VITE_STRIPE_PRICE_ID_MONTHLY || '',
  annual: client.VITE_STRIPE_PRICE_ID_ANNUAL || '',
};
const clientFilePath = path.relative(process.cwd(), CLIENT_ENV_PATH);
check(Boolean(client.VITE_SUPABASE_URL), '[client] VITE_SUPABASE_URL present');
check(Boolean(client.VITE_SUPABASE_ANON_KEY), '[client] VITE_SUPABASE_ANON_KEY present');
check(Boolean(priceIds.monthly), '[client] VITE_STRIPE_PRICE_ID_MONTHLY present', clientFilePath);
check(Boolean(priceIds.annual), '[client] VITE_STRIPE_PRICE_ID_ANNUAL present', clientFilePath);

// ── 3. Cross-file mode consistency (offline-safe) ──────────────────────────
const publishableKey = client.VITE_STRIPE_PUBLISHABLE_KEY || '';
const pkMode = publishableKey.startsWith('pk_live_') ? 'LIVE'
  : publishableKey.startsWith('pk_test_') ? 'TEST' : 'UNKNOWN';

check(Boolean(publishableKey), '[client] VITE_STRIPE_PUBLISHABLE_KEY present');
check(
  pkMode !== 'UNKNOWN' || !publishableKey,
  '[client] publishable key mode recognizable',
  `current mode: ${pkMode}`,
);
// The failure mode that actually shipped once: pk_test_ in the bundle while
// everything else was live. Pure string check, works with no network.
if (keyMode !== 'UNKNOWN' && pkMode !== 'UNKNOWN' && publishableKey) {
  check(
    pkMode === keyMode,
    '[stripe] publishable key mode matches secret key mode',
    `${pkMode} vs ${keyMode}`,
  );
}
check(
  !priceIds.monthly || /^price_[A-Za-z0-9]+$/.test(priceIds.monthly),
  '[client] monthly price ID well-formed',
  priceIds.monthly || 'missing',
);
check(
  !priceIds.annual || /^price_[A-Za-z0-9]+$/.test(priceIds.annual),
  '[client] annual price ID well-formed',
  priceIds.annual || 'missing',
);

// ── 4. Stripe mode alignment (network, read-only) ──────────────────────────
if (OFFLINE) {
  console.log('(offline) SKIP  [stripe] price retrievability with live API — run without --offline to verify');
} else if ((secretKey.startsWith('sk_') || secretKey.startsWith('rk_')) && (priceIds.monthly || priceIds.annual)) {
  const stripe = new Stripe(secretKey);
  for (const [label, priceId] of Object.entries(priceIds)) {
    if (!priceId) continue;
    try {
      const price = await stripe.prices.retrieve(priceId);
      const priceMode = price.livemode ? 'LIVE' : 'TEST';
      check(
        price.livemode === isLiveKey,
        `[stripe] ${label} price (${priceId.slice(0, 12)}…) mode matches key (${priceMode} vs ${keyMode})`,
        `retrieved OK — price is ${priceMode}`,
      );
    } catch (e) {
      check(
        false,
        `[stripe] ${label} price (${priceId.slice(0, 12)}…) retrievable with key`,
        `Stripe error: ${e?.message || e}`,
      );
    }
  }
} else {
  check(
    false,
    '[stripe] mode alignment check ran',
    'skipped — need a real key AND client price IDs (placeholders/empty values)',
  );
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`PASS (${passes.length}):`);
passes.forEach((p) => console.log(`  ✅ ${p}`));
if (failures.length > 0) {
  console.log(`\nFAIL (${failures.length}):`);
  failures.forEach((f) => console.log(`  ❌ ${f}`));
  console.log('\nFix the failures above, then re-run. Full runbook: STRIPE_LAUNCH_CHECKLIST.md');
  process.exit(1);
} else {
  console.log(`\nAll gates green. Ready to launch checkout${OFFLINE ? ' (structural checks only — rerun without --offline before launch)' : ''}.`);
  process.exit(0);
}
