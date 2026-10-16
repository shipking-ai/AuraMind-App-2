#!/usr/bin/env node
// Renders the README banner (docs/assets/banner.svg -> banner.png, 1280x640).
// GitHub shows the PNG, so re-run this after editing the SVG:
//   node scripts/render-banner.mjs   (from auramind-gemini/)
// Run it on Windows: the SVG asks for Segoe UI, and the PNG should use it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const assets = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../docs/assets');
const svg = readFileSync(resolve(assets, 'banner.svg'), 'utf8');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#080d1b">${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`,
  );
  await page.locator('svg').evaluate((el) => {
    el.setAttribute('width', '1280');
    el.setAttribute('height', '640');
    el.style.display = 'block';
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(assets, 'banner.png'), clip: { x: 0, y: 0, width: 1280, height: 640 } });
  console.log('Wrote docs/assets/banner.png');
} finally {
  await browser.close();
}
