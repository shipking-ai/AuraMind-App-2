import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSeedSessions, SEED_SKIP_REASON } from './seedCredentials';

/**
 * Aurora-motion E2E — verifies the scroll-reactive background actually moves.
 *
 * Per the HANDOFF rule ("screenshots alone hide plenty — measure"), this does
 * not eyeball pixels: it reads the computed transform/filter of the aurora
 * and orb layers before and after scrolling the shell's inner scroller
 * (main#nova-main-content) and asserts they diverge. Static chrome (the shell
 * itself) must NOT move — that's the regression this guards.
 */

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_DIR = resolve(APP_DIR, 'e2e/.auth');
const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const STATE = resolve(AUTH_DIR, `aurora-${STAMP}.json`);

try {
  mkdirSync(AUTH_DIR, { recursive: true });
  execSync(`node -e "require('fs').writeFileSync(process.argv[1], '{}')" "${STATE}"`, { stdio: 'pipe' });
} catch {
  /* best effort — beforeAll reports real failures */
}

test.describe('aurora motion', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canSeedSessions, SEED_SKIP_REASON);

  test.beforeAll(async () => {
    // --with-spark-deck also grants subscription_status:'active' — a fresh
    // account without entitlement is bounced to /subscribe and never sees the
    // dashboard shell this spec measures. The seeder writes the storage state
    // to the path given by --name, so that must be the state path itself.
    execSync(
      `node scripts/e2e-seed-session.mjs --email e2e-aurora-${STAMP}@example.com --name "${STATE}" --base-url http://localhost:3001 --with-spark-deck`,
      { cwd: APP_DIR, stdio: 'inherit', timeout: 120_000 },
    );
  });

  test.afterAll(async () => {
    try {
      execSync(
        `node -e "const{createClient}=require('@supabase/supabase-js');const fs=require('fs');const env=fs.readFileSync('../../.env','utf8');const u=env.match(/SUPABASE_URL=(\\S+)/)[1];const k=env.match(/SUPABASE_SERVICE_ROLE_KEY=(\\S+)/)[1];const sb=createClient(u,k,{auth:{persistSession:false}});sb.auth.admin.listUsers().then(async r=>{for(const usr of r.data.users){if(usr.email&&usr.email.startsWith('e2e-aurora-'))await sb.auth.admin.deleteUser(usr.id)}process.exit(0)})"`,
        { cwd: APP_DIR, stdio: 'pipe', timeout: 60_000 },
      );
    } catch {
      /* cleanup best effort */
    }
  });

  test.use({ storageState: STATE });

  // Pre-answer the consent banner and mark the first-run tour done (JSON-encoded
  // preferences), so no overlay sits above the shell when the probe runs.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auramind_consentChoice', JSON.stringify('declined'));
      window.localStorage.setItem('auramind:completedTutorials', JSON.stringify(['onboarding']));
    });
  });

  test('background layers respond to scroll; shell chrome stays fixed', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('main#nova-main-content');

    const scroller = page.locator('main#nova-main-content');

    const readStyles = () =>
      page.evaluate(() => {
        // The aurora layer is the only fixed -z-20 element with a filter var.
        const layers = Array.from(document.querySelectorAll<HTMLElement>('.fixed.-z-20 > div, .fixed.-z-10 > div'));
        const snapshot: Record<string, { transform: string; filter: string }> = {};
        layers.forEach((el, i) => {
          const cs = getComputedStyle(el);
          snapshot[`layer-${i}`] = { transform: cs.transform, filter: cs.filter };
        });
        return snapshot;
      });

    const before = await readStyles();

    // Scroll the inner scroller deep enough that the clamped MotionValue moves.
    await scroller.evaluate((el) => el.scrollTo({ top: 700, behavior: 'instant' }));
    // Springs settle well within a second at stiffness 60.
    await page.waitForTimeout(1200);

    const after = await readStyles();
    const moved = Object.entries(after).filter(([key, v]) => {
      const b = before[key];
      return b && (b.transform !== v.transform || b.filter !== v.filter);
    });
    expect(moved.length).toBeGreaterThanOrEqual(2); // aurora + at least one orb layer

    // Shell chrome must not participate in the parallax.
    const shellTransform = await page.evaluate(() => getComputedStyle(document.querySelector('.nova-shell')!).transform);
    expect(shellTransform === 'none' || shellTransform === '').toBe(true);
  });
});
