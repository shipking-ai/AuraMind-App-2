/**
 * Full Stripe test-mode flow: checkout session + signed webhook delivery.
 *
 * The repo has NO test-mode secret keys (api/.env holds live ones), so this
 * script cannot run until you paste test keys in. When you have them:
 *
 *   cd api
 *   STRIPE_TEST_SECRET_KEY=sk_test_xxx \
 *   STRIPE_TEST_WEBHOOK_SECRET=whsec_xxx \
 *   STRIPE_TEST_PRICE_ID=price_xxx \
 *   npx tsx scripts/stripe-test-flow.mjs --user-id <your-supabase-user-uuid>
 *
 * What it does:
 *   1. Backs up api/.env, swaps the STRIPE_* vars to your test keys
 *   2. Starts the express server on :3901 with the test env
 *   3. Creates a checkout session via POST /api/stripe/checkout
 *   4. Sends a locally-signed checkout.session.completed event to
 *      POST /api/stripe-webhook (real HMAC signature math, no Stripe CLI needed)
 *   5. Verifies every response, then ALWAYS restores api/.env and kills the server
 *
 * NOTE: the webhook writes subscription metadata for --user-id in the real
 * Supabase project. Use your own account — payments are fake, the DB write is
 * real. Verify your user_metadata afterwards, then reset it if you like.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = 3901;
const ENV_PATH = join(process.cwd(), '.env');

const args = process.argv.slice(2);
const userIdArg = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];

const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
const priceId = process.env.STRIPE_TEST_PRICE_ID;

if (!secretKey || !webhookSecret || !priceId) {
  console.error('Missing test keys. Set STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET and STRIPE_TEST_PRICE_ID.');
  console.error('Get them from https://dashboard.stripe.com/test/apikeys and https://dashboard.stripe.com/test/webhooks');
  process.exit(1);
}
if (!(secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_'))) {
  console.error(`STRIPE_TEST_SECRET_KEY does not look like a test key: ${secretKey.slice(0, 8)}... (expected sk_test_...)`);
  process.exit(1);
}
if (!userIdArg) {
  console.error('Pass --user-id=<your-supabase-user-uuid> so the webhook can provision your account.');
  process.exit(1);
}

const userId = userIdArg;

let failures = 0;
const check = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  →  ${actual}${pass ? '' : ` (expected ${expected})`}`);
};

// --- 1. Swap env -----------------------------------------------------------
const backupPath = `${ENV_PATH}.bak-${Date.now()}`;
let server = null;
try {
  copyFileSync(ENV_PATH, backupPath);
  const original = readFileSync(ENV_PATH, 'utf8');
  const swapped = original
    .replace(/^STRIPE_SECRET_KEY=.*$/m, `STRIPE_SECRET_KEY=${secretKey}`)
    .replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${webhookSecret}`)
    .replace(/^STRIPE_PUBLISHABLE_KEY=.*$/m, 'STRIPE_PUBLISHABLE_KEY=pk_test_dummy');
  if (swapped === original) {
    throw new Error('api/.env has no STRIPE_SECRET_KEY line to swap — aborting without changes.');
  }
  writeFileSync(ENV_PATH, swapped);
  console.log(`Swapped api/.env with test keys (backup: ${backupPath})`);

  // --- 2. Start server -----------------------------------------------------
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  server.stderr.on('data', (d) => { err += d.toString(); });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let up = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { up = true; break; }
    } catch { /* not up yet */ }
    await wait(1000);
  }
  if (!up) throw new Error(`server did not start: ${err.slice(-500)}`);

  // --- 3. Checkout ---------------------------------------------------------
  console.log('\n— Checkout —');
  const email = process.env.STRIPE_TEST_EMAIL || `test+${Date.now()}@bonamind.app`;
  const checkoutRes = await fetch(`http://localhost:${PORT}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ priceId, userId, email }),
  });
  const checkoutBody = await checkoutRes.json();
  check('checkout session created', checkoutRes.status, 200);
  if (checkoutRes.ok && checkoutBody.url) {
    console.log(`  → checkout URL: ${checkoutBody.url}`);
    console.log('  (open it in a browser to pay with a test card: 4242 4242 4242 4242)');
  } else {
    console.log('  → body:', JSON.stringify(checkoutBody));
  }

  // --- 4. Webhook ----------------------------------------------------------
  console.log('\n— Webhook —');
  const now = Math.floor(Date.now() / 1000);
  // subscription: null so the handler verifies the signature + routes the event
  // without calling Stripe's API (a fake sub id would 500 on retrieve).
  const event = {
    id: `evt_test_${randomUUID()}`,
    object: 'event',
    api_version: '2024-06-20',
    created: now,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_flow',
        object: 'checkout.session',
        metadata: { supabase_user_id: userId },
        customer: 'cus_test_flow',
        subscription: null,
        customer_details: { email, name: 'Test User' },
        amount_total: 799,
        currency: 'usd',
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = `t=${now},v1=${createHmac('sha256', webhookSecret).update(`${now}.${payload}`).digest('hex')}`;

  const webhookRes = await fetch(`http://localhost:${PORT}/api/stripe-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  check('webhook accepted valid signature', webhookRes.status, 200);

  const badRes = await fetch(`http://localhost:${PORT}/api/stripe-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    body: payload,
  });
  check('webhook rejects bad signature', badRes.status, 400);

  console.log('\nTo test the real provisioning path:');
  console.log(`  1. Open the checkout URL above and pay with test card 4242 4242 4242 4242`);
  console.log(`  2. The REAL webhook will fire with a real subscription id and write`);
  console.log(`     subscription_status/pro to auth.users.user_metadata for ${userId}`);
  console.log(`  3. Verify in Supabase, or: stripe listen --forward-to localhost:3001/api/stripe-webhook`);
  console.log(`     + stripe trigger checkout.session.completed (no supabase_user_id in metadata → no DB write)`);
} finally {
  // --- 5. Always restore ----------------------------------------------------
  if (server) {
    server.kill();
    await Promise.race([
      new Promise((r) => server.once('exit', r)),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    server = null;
  }
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, ENV_PATH);
    console.log(`\nRestored api/.env from ${backupPath}`);
  }
}

console.log(failures === 0 ? '\nAll Stripe test-flow checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
