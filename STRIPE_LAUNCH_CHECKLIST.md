# Stripe Launch Checklist

Everything needed to take AuraMind's Stripe integration from "plumbing verified"
to "money moving in production" — with the current status of each item.

**Status snapshot (2026-08-10):** signature handling, HTTP wiring, and full flow
logic are verified and tested (see "What's already verified"). The remaining
gates need **your Stripe dashboard** (test keys) and **your Vercel env** (live
key reconciliation). None of the steps below should be skipped — item 2 is the
known configuration mismatch.

---

## 1. What's already verified ✅

| Layer | Status |
|---|---|
| Webhook signature verification | Verified side-effect-free: 5 handler-level + 3 HTTP-path tests (valid sig accepted & `ping` ignored; invalid/missing sig → 400; GET → 405) |
| Webhook mounted in express server | `api/server.js` → `POST /api/stripe-webhook` with raw-body parser (self-hosted deployments) |
| Vercel-safe body handling | Handler prefers `req.rawBody` → Buffer → string → re-serialized JSON |
| Checkout endpoint | `POST /api/stripe/checkout` creates a hosted Stripe Checkout session (server-side; no publishable key in the bundle) |
| Full flow logic (mocked) | `api/tests/stripe-flow.test.ts` (in CI): checkout marks user trialing; `checkout.session.completed` provisions Pro + emails buyer; `subscription.deleted` downgrades to Starter; irrelevant events ignored |
| Signature plumbing in CI | `.github/workflows/scheduled-checks.yml` runs both smoke scripts weekly with placeholder keys (no real secrets, no side effects) |

**Handled webhook events:** `checkout.session.completed`,
`customer.subscription.created` / `.updated` / `.deleted` /
`.trial_will_end` (sends a trial-ending reminder email, no plan changes),
`invoice.payment_succeeded` / `.payment_failed`.

---

## 2. Stripe mode alignment ✅ verified, one mismatch remains

Checked against Stripe's live API on 2026-08-11 (`api/scripts/verify-launch.mjs`):

| Where | Verified state | OK? |
|---|---|---|
| `api/.env` → `STRIPE_SECRET_KEY` | `sk_live_…` | ✅ Live |
| `api/.env` → `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | ✅ Live |
| `auramind-gemini/.env` → `VITE_STRIPE_PRICE_ID_MONTHLY` / `_ANNUAL` | both **live** prices, retrievable with the live key, `livemode` matches | ✅ Verified via `prices.retrieve` |
| `auramind-gemini/.env` → `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | ✅ Fixed 2026-08-11 — was `pk_test_…` |
| `api/.env` → `STRIPE_WEBHOOK_SECRET` | `whsec_…` | ⚠️ Format matches; confirm the **endpoint is registered in live mode** on the dashboard with the event list in §5 |

**Fixed 2026-08-11:** `VITE_STRIPE_PUBLISHABLE_KEY` was `pk_test_…` while
everything else was live — the one real misconfiguration this checklist
originally misdiagnosed. It's now `pk_live_…`, and `verify-launch.mjs`
checks the secret/publishable mode alignment structurally (`--offline`, no
network) so the mismatch can't silently return. The current checkout path
uses hosted Stripe Checkout (server-side, no Elements), so the old test key
was inert — but it shipped in the production bundle and would have broken
the moment Elements was wired.

**Why alignment matters:** Stripe rejects live-mode API calls that reference
test-mode prices, and live webhook events signed with a test secret fail
verification (400). Secret key, publishable key, webhook secret, and price
IDs must **all be live** (or all be test) at the same time. The checkout
handler now enforces this: it retrieves the price and refuses a mode mismatch
with an actionable 400 instead of a confusing 500.

**Where the real env lives:** production runs on Vercel — the values in
`api/.env` / `auramind-gemini/.env` only matter for local dev. Set the
corrected values in **Vercel's project env** (Project Settings → Environment
Variables) and redeploy. Verify with `npx vercel env ls` (CLI must be
authenticated) and `node api/scripts/verify-launch.mjs` (or `--offline` for
the structural checks without Stripe access — also run weekly in CI via
`.github/workflows/scheduled-checks.yml`).

---

## 3. Test-mode full flow (pre-launch gate) 🔑

Runs the real checkout + signed webhook against Stripe's test mode. The repo
has **no test secret keys** — get them from
`dashboard.stripe.com/test/apikeys` (secret key + a test webhook signing secret
from a test-mode webhook endpoint, or `stripe listen`).

```bash
cd api
STRIPE_TEST_SECRET_KEY=sk_test_xxx \
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxx \
STRIPE_TEST_PRICE_ID=price_xxx \
npx tsx scripts/stripe-test-flow.mjs --user-id <your-supabase-user-uuid>
```

The script backs up `api/.env`, swaps in the test keys, starts the server on
:3901, creates a checkout session, delivers a **locally-signed**
`checkout.session.completed` event (real HMAC math — no Stripe CLI needed),
verifies every response, and **always restores `api/.env`** — even on failure.

**Pass criteria:**
1. Script prints the checkout URL → open it and pay with card
   `4242 4242 4242 4242` (any future expiry, any CVC).
2. Redirect back succeeds; the account row shows `Pro` + `trial_end`
   (`app_metadata.subscription_status`), and the buyer email arrives (check the Resend dashboard).
3. `subscription.deleted` path: cancel the subscription in the dashboard →
   the handler downgrades the user to Starter and sends the cancellation email.

> ⚠️ The webhook writes subscription metadata for `--user-id` in the **real**
> Supabase project. Use your own account — payments are fake, the DB write is
> real. Verify (and if you like, reset) your `app_metadata` afterwards.

---

## 4. Live launch steps (ordered)

1. **Products & prices:** ✅ done — live prices `price_1Tqj…`/`price_1SNl…`
   verified retrievable with the live key (2026-08-11).
2. **Webhook endpoint:** ✅ done 2026-08-11 — endpoint recreated via API at
   **`https://auramind.app/api/stripe-webhook`** (apex, NOT www — www
   307-redirects and Stripe doesn't follow redirects), enabled, subscribed to
   the seven events, fresh signing secret saved to `api/.env` and Vercel.
   The old disabled endpoint (and 3 stale Supabase-function endpoints) were
   left/removed as noted in the audit.
3. **Vercel env:** ✅ deployed 2026-08-11 — `STRIPE_WEBHOOK_SECRET` (Production
   + Preview) and `VITE_STRIPE_PUBLISHABLE_KEY` re-set to `pk_live_…` via CLI.
   `STRIPE_SECRET_KEY`, `SUPABASE_*`, `RESEND_*` were already present. ✅
   `VITE_POSTHOG_KEY` set to a real `phc_…` key (2026-08-12, Production) and
   redeployed — deployed bundle verified: `phc_placeholder` 0 refs, real key
   present. (Preview env still lacks the `VITE_*` set — preview builds have
   been failing for that reason; production is unaffected.)
4. **Client env:** ✅ done 2026-08-11 — deployed bundle verified to contain
   `pk_live_…` (3 refs), zero `pk_test_` refs, live prices `price_1Tqj…`/
   `price_1SNl…`.
5. **Webhook verification:** ✅ done 2026-08-11 against the live endpoint —
   unsigned POST → **400** (signature verification active), signed `ping` →
   **200** `{"received":true,"ignored":true}`. Equivalent to the dashboard
   "Send test webhook".
6. **Live smoke:** make one small real payment through the checkout flow;
   verify the subscription row, `app_metadata.subscription_status`, and buyer email. Checkout starts a 7-day trial, so the first real charge lands when the trial ends.

---

## 5. Post-launch monitoring

- **Weekly automated checks** — `.github/workflows/scheduled-checks.yml`
  (Mondays 09:00 UTC, also manually runnable):
  - Stripe webhook signature smoke tests (side-effect-free, placeholder keys)
  - Dependency audit gated at **critical** severity (known moderate/high
    residuals in `SECURITY.md` are expected to stay green)
- **Stripe dashboard:** monitor payments, payouts, disputes, and failed
  invoices. `invoice.payment_failed` is handled — check the webhook logs for
  those deliveries.
- **Vercel function logs:** watch `/api/stripe-webhook` and `/api/stripe/checkout`
  for 400/500 spikes.

---

## 6. Rollback / incident notes

- **Local env corruption:** the test-flow script restores `api/.env` from its
  backup automatically. If you ever hand-edit keys, keep a `.env.backup`.
- **Bad webhook secret deployed:** webhooks fail with 400 (signature
  verification) — no DB writes occur, so it's a safe failure mode. Fix the
  secret and resend from the dashboard.
- **Downgrade path:** deleting a customer's subscription (or letting it lapse)
  triggers `customer.subscription.deleted` → account returns to the free
  Starter plan automatically.

---

*See also: `SECURITY.md` (audit residuals) and `DEPLOYMENT.md` (deployment notes).*
