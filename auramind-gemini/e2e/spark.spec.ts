import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSeedSessions, SEED_SKIP_REASON } from './seedCredentials';

/**
 * Memory-spark E2E — real-browser coverage for Surface 1 (in-app pop-up) and
 * the deep-link review route (/dashboard/spark/:cardId, Surface 2's target).
 *
 * Sessions are seeded captcha-free by scripts/e2e-seed-session.mjs, which with
 * `--with-spark-deck` also creates a deck whose cards carry FSRS state with
 * retrievability ≈ 0.8 — squarely in the scheduler's eligibility band — and
 * writes the seeded ids to e2e/.auth/spark-seed.json.
 *
 * Determinism: the pop-up's sporadic coin is removed in dev builds via
 * `?sparks=force` (dev-only hook in MemorySpark). Eligibility, caps, quiet
 * hours, and the pick are all still the real code paths.
 */

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_DIR = resolve(APP_DIR, 'e2e/.auth');

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Signed-in account with a spark-eligible deck. */
const SPARK = {
  email: `e2e-spark-${STAMP}@example.com`,
  state: resolve(AUTH_DIR, 'spark.json'),
  seedInfo: resolve(AUTH_DIR, 'spark-seed.json'),
};

// Collection-time stub so `test.use({ storageState })` never ENOENTs.
try {
  mkdirSync(AUTH_DIR, { recursive: true });
  execSync(`node -e "require('fs').writeFileSync(process.argv[1], '{}')" "${SPARK.state}"`, {
    stdio: 'pipe',
  });
} catch {
  /* best effort — beforeAll will report real failures */
}

function seed(email: string, state: string) {
  execSync(
    `node scripts/e2e-seed-session.mjs --email ${email} --name "${state}" --base-url http://localhost:3001 --with-spark-deck`,
    { cwd: APP_DIR, stdio: 'inherit', timeout: 120_000 },
  );
}

function readSeedInfo(): { deckId: string; cards: Array<{ id: string; front: string }> } {
  return JSON.parse(readFileSync(SPARK.seedInfo, 'utf8'));
}

test.describe('memory sparks', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canSeedSessions, SEED_SKIP_REASON);

  test.beforeAll(async () => {
    seed(SPARK.email, SPARK.state);
  });

  test.use({ storageState: SPARK.state });

  // Pre-answer the consent banner and mark the first-run tour done, exactly
  // as a returning user's browser holds them (JSON-encoded preferences), so
  // neither overlay sits above the spark dialog or intercepts a grade click.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auramind_consentChoice', JSON.stringify('declined'));
      window.localStorage.setItem('auramind:completedTutorials', JSON.stringify(['onboarding']));
    });
  });

  /**
   * Same error contract as the onboarding spec: real bugs are uncaught page
   * exceptions and app-level console.error, not network status noise (the
   * 402 entitlement probe is expected on fresh accounts).
   */
  function trackErrors(page: import('@playwright/test').Page) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (text.startsWith('Failed to load resource:')) return; // network status noise
      consoleErrors.push(text);
    });
    return { pageErrors, consoleErrors };
  }

  test('dev force hook fires a pop-up whose front is the seeded card', async ({ page }) => {
    const { pageErrors, consoleErrors } = trackErrors(page);

    await page.goto('/dashboard?sparks=force');
    const dialog = page.getByRole('dialog', { name: /memory spark/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The picker can legally choose either seeded card ('Luke?' or '42?');
    // both are in the band, so assert the pop-up shows one of the fronts.
    const text = await dialog.locator('p').first().textContent();
    expect(text, 'pop-up front text').toMatch(/Luke\?|42\?/);

    // Dismiss (no grading): the pop-up closes.
    await dialog.getByRole('button', { name: /dismiss spark/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    expect(pageErrors, 'no uncaught page exceptions').toEqual([]);
    expect(consoleErrors, 'no app console errors').toEqual([]);
  });

  test('reveal + grade records a real review and closes the spark', async ({ page }) => {
    test.setTimeout(60_000);
    const { pageErrors, consoleErrors } = trackErrors(page);

    await page.goto('/dashboard?sparks=force');
    const dialog = page.getByRole('dialog', { name: /memory spark/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // Reveal swaps the front for the back.
    await dialog.getByRole('button', { name: /reveal/i }).click();
    await expect(dialog.locator('p').first()).toHaveText(/Your friend from the demo|The answer/);

    // Grading goes through calculateSRS → dbService.updateCard; the dialog
    // closes on grade. A Supabase hiccup here would leave the dialog open,
    // which the expectation catches.
    await dialog.getByRole('button', { name: /good/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    expect(pageErrors, 'no uncaught page exceptions through grading').toEqual([]);
    expect(consoleErrors, 'no app console errors through grading').toEqual([]);
  });

  test('deep-link route grades the seeded card and returns to dashboard', async ({ page }) => {
    test.setTimeout(60_000);
    const { pageErrors, consoleErrors } = trackErrors(page);

    const seedInfo = readSeedInfo();
    const luke = seedInfo.cards.find((c) => c.front === 'Luke?');
    expect(luke, 'seeder recorded the Luke? card id').toBeTruthy();

    // A fresh spark log per test would be nice, but cross-test suppression is
    // per-card and the two tests above touched possibly the same card. The
    // deep-link route does NOT consult the spark log to render (it grades
    // whatever card it is handed), so the deep-link is unaffected by
    // suppression — that is by design: a user who tapped a notification must
    // land on the card, whether or not a pop-up showed it earlier today.
    await page.goto(`/dashboard/spark/${luke!.id}`);
    await expect(page.getByText('Luke?')).toBeVisible({ timeout: 20_000 });

    // Reveal + grade returns to /dashboard.
    await page.getByRole('button', { name: /reveal answer/i }).click();
    await expect(page.getByText(/Your friend from the demo/)).toBeVisible();
    await page.getByRole('button', { name: /good/i }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });

    expect(pageErrors, 'no uncaught page exceptions on the deep-link route').toEqual([]);
    expect(consoleErrors, 'no app console errors on the deep-link route').toEqual([]);
  });
});
