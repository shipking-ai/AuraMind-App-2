/**
 * scripts/capture-store-screenshots.mjs
 *
 * Renders the real BonaMind app (public pages) and the purpose-built mobile
 * mockups (dashboard/study screens) into Play Store phone screenshots.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOT_DIR = resolve(ROOT, '..', 'store', 'graphics', 'android', 'screenshots');
const MOCK_DIR = resolve(ROOT, '..', '..', 'Mobile UI Examples');

mkdirSync(SHOT_DIR, { recursive: true });

const WIDTH = 1080;
const HEIGHT = 1920;
const APP_URL = 'http://localhost:4173';

const shots = [
  { name: '01-home.png', url: `${APP_URL}/` },
  { name: '06-onboarding.png', url: `${APP_URL}/auth` },
];

async function capture(browser, target, name) {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  });
  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(SHOT_DIR, name), fullPage: false });
    console.log(`✓ real app: ${name}`);
  } catch (err) {
    console.warn(`✗ real app: ${name}: ${err.message}`);
  } finally {
    await page.close();
  }
}

const mockupFiles = [
  { name: '02-dashboard.png', file: 'dashboard_&_home/code.html' },
  { name: '03-study.png', file: 'flashcard_study_interface/code.html' },
  { name: '04-ai-create.png', file: 'deck_library_&_search/code.html' },
  { name: '05-progress.png', file: 'progress_tracking_&_analytics/code.html' },
  { name: '07-profile.png', file: 'user_profile/code.html' },
];

async function captureMockup(browser, relFile, name) {
  const abs = resolve(MOCK_DIR, relFile);
  if (!existsSync(abs)) {
    console.warn(`✗ mockup missing: ${relFile}`);
    return;
  }
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  });
  try {
    await page.goto(`file://${abs.replace(/\\/g, '/')}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await page.screenshot({ path: resolve(SHOT_DIR, name), fullPage: false });
    console.log(`✓ mockup: ${name}`);
  } catch (err) {
    console.warn(`✗ mockup: ${name}: ${err.message}`);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();

for (const s of shots) {
  await capture(browser, s.url, s.name);
}
for (const m of mockupFiles) {
  await captureMockup(browser, m.file, m.name);
}

await browser.close();
console.log('Done. Screenshots in', SHOT_DIR);
