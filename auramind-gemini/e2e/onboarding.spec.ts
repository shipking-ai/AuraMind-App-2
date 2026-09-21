import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSeedSessions, SEED_SKIP_REASON } from './seedCredentials';

/**
 * Onboarding E2E — real-browser coverage for /onboarding and the auth-entry
 * routing gates.
 *
 * Sessions are seeded captcha-free by scripts/e2e-seed-session.mjs (GoTrue
 * admin generate_link → verify against the LOCAL callback; never fight
 * Turnstile — see HANDOFF.md).
 *
 * Playwright captures `test.use({ storageState })` at collection time, i.e.
 * BEFORE any beforeAll can seed the files. So the files are pre-created as
 * empty JSON in a module-level try — storageState with an empty object keeps
 * the context signed-out; the beforeAll seeds then overwrite them and the
 * serial-ordered tests run against real sessions.
 */

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_DIR = resolve(APP_DIR, 'e2e/.auth');

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Signed-in account that has NOT finished onboarding. */
const FRESH = {
  email: `e2e-fresh-${STAMP}@example.com`,
  state: resolve(AUTH_DIR, 'onboarding-fresh.json'),
};

/** Signed-in account with onboarding_completed: true in user_metadata. */
const DONE = {
  email: `e2e-done-${STAMP}@example.com`,
  state: resolve(AUTH_DIR, 'onboarding-done.json'),
};

// Collection-time stub so `test.use({ storageState })` never ENOENTs.
try {
  mkdirSync(AUTH_DIR, { recursive: true });
  for (const f of [FRESH.state, DONE.state]) {
    try {
      execSync(`node -e "require('fs').writeFileSync(process.argv[1], '{}')" "${f}"`, {
        stdio: 'pipe',
      });
    } catch {
      /* exists */
    }
  }
} catch {
  /* best effort — beforeAll will report real failures */
}

function seed(email: string, state: string, fresh: boolean) {
  execSync(
    `node scripts/e2e-seed-session.mjs --email ${email} --name "${state}" --base-url http://localhost:3001${fresh ? ' --fresh' : ''}`,
    { cwd: APP_DIR, stdio: 'inherit', timeout: 120_000 },
  );
}

test.describe('fresh account — onboarding flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canSeedSessions, SEED_SKIP_REASON);

  test.beforeAll(async () => {
    seed(FRESH.email, FRESH.state, true);
  });

  test.use({ storageState: FRESH.state });

  /**
   * Real bugs = uncaught page exceptions and app-level console.error. The
   * browser's automatic "Failed to load resource: 402" line for the
   * entitlement probe is expected here: a fresh account has no subscription,
   * the server answers 402 Payment Required, and App.tsx catches it to show
   * the paywall. Asserting zero raw console errors would fail on every run.
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

  test('visiting /onboarding shows the role step', async ({ page }) => {
    const { pageErrors, consoleErrors } = trackErrors(page);

    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: /what brings you here/i })).toBeVisible({
      timeout: 20_000,
    });

    // Persona grid renders all six choices from onboardingRoles.
    for (const label of ['Learner', 'Student', 'Teacher', 'Doctor', 'Professional', 'Researcher']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible();
    }
    // Continue stays disabled until a persona is picked.
    await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled();

    expect(pageErrors, 'no uncaught page exceptions on the role step').toEqual([]);
    expect(consoleErrors, 'no app console errors on the role step').toEqual([]);
  });

  test('completing role + topic reaches /subscribe with the personalization', async ({ page }) => {
    test.setTimeout(120_000);
    const { pageErrors, consoleErrors } = trackErrors(page);

    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: /what brings you here/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /^student/i }).first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Topic step: type a topic rather than tapping a chip.
    const input = page.locator('input[placeholder*="e.g."]').first();
    await expect(input).toBeVisible();
    await input.fill('E2E test topic');
    await page.getByRole('button', { name: /prepare my cards/i }).click();

    // The building step persists onboarding_completed and pre-creates the
    // topic deck, then routes to /subscribe preserving the personalization.
    await page.waitForURL(/\/subscribe\?role=student&topic=/, { timeout: 90_000 });
    await expect(page.getByText(/deck is ready/i).first()).toBeVisible();

    expect(pageErrors, 'no uncaught page exceptions across the flow').toEqual([]);
    expect(consoleErrors, 'no app console errors across the flow').toEqual([]);
  });
});

test.describe('onboarded account — gate skips the flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canSeedSessions, SEED_SKIP_REASON);

  test.beforeAll(async () => {
    seed(DONE.email, DONE.state, false);
  });

  test.use({ storageState: DONE.state });

  test('/onboarding bounces a finished account to /dashboard', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/aura/i, { timeout: 20_000 });
  });
});
