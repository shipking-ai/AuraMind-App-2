#!/usr/bin/env node
// Screenshots the Windows app's screens in light and dark, from the dev-only
// /__e2e/windows harness (sample data, no sign-in). A stubbed Tauri runtime
// makes the page behave as the Windows app (isDesktopApp() is true, bridge
// calls resolve to nothing).
//
//   npm run dev                                   (in auramind-gemini/)
//   node scripts/capture-windows-screens.mjs [baseUrl] [outDir]
//
// Defaults: http://localhost:3000, ../.superpowers/windows-screens (git-ignored).

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.argv[3] || resolve(here, '../../.superpowers/windows-screens'));
mkdirSync(out, { recursive: true });

const SCREENS = ['today', 'library', 'session', 'answer', 'complete', 'settings', 'chat', 'create'];
const SIZES = [{ name: 'wide', width: 1280, height: 820 }, { name: 'narrow', width: 860, height: 820 }];

const browser = await chromium.launch();
try {
  for (const scheme of ['dark', 'light']) {
    for (const size of SIZES) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });
      await context.addInitScript(() => {
        window.__TAURI_INTERNALS__ = {
          invoke: () => Promise.resolve(null),
          transformCallback: () => 0,
          metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        };
        try { localStorage.setItem('bonamind.aurachat.tourComplete.v1', '1'); } catch { /* ignore */ }
      });
      const page = await context.newPage();
      const screens = size.name === 'wide' ? SCREENS : ['today', 'answer'];
      for (const screen of screens) {
        await page.goto(`${base}/__e2e/windows?screen=${screen}`, { waitUntil: 'load' });
        await page.waitForSelector('.win-shell', { timeout: 15_000 });
        await page.waitForTimeout(600);
        const file = resolve(out, `${screen}-${scheme}-${size.name}.png`);
        await page.screenshot({ path: file });
        console.log('wrote', file);
      }
      if (size.name === 'wide') {
        await page.goto(`${base}/__e2e/windows?screen=library`, { waitUntil: 'load' });
        await page.waitForSelector('.win-row');
        await page.locator('.win-row').first().click({ button: 'right' });
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(out, `library-menu-${scheme}-wide.png`) });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
