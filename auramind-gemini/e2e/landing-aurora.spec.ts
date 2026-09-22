import { test, expect } from '@playwright/test';

/**
 * Landing hero aurora E2E — same contract as aurora.spec.ts (measure, don't
 * eyeball): scroll the page, read computed transform/filter of the hero blob
 * parallax layers, assert they move. Public page — no session seeding. Skips
 * under reduced motion (the browser emulates it here), where the design is
 * deliberately static.
 */

test.describe('landing hero motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('hero blobs respond to scroll with depth parallax + hue drift', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('section.relative.pt-32');

    const readLayers = () =>
      page.evaluate(() => {
        // The mesh-gradient container is tagged data-hero-mesh in the source.
        const wrap = document.querySelector('[data-hero-mesh]');
        const layers = wrap ? Array.from(wrap.querySelectorAll(':scope > div')) : [];
        return layers.map((el) => {
          const cs = getComputedStyle(el as HTMLElement);
          return { transform: cs.transform, filter: cs.filter };
        });
      });

    const before = await readLayers();
    expect(before.length).toBe(4);

    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(1200); // springs settle

    const after = await readLayers();
    let moved = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i].transform !== after[i].transform) moved++;
    }
    expect(moved).toBeGreaterThanOrEqual(3); // all but the zero-depth edge case

    // The hue accent layer's filter must change too.
    expect(before.some((b, i) => b.filter !== after[i].filter)).toBe(true);
  });
});

test.describe('landing hero motion (reduced)', () => {
  // Playwright's reducedMotion emulation does not reach window.matchMedia on
  // this setup (probed: reduce=false under 'reduce'), so make the app itself
  // see prefers-reduced-motion: reduce by stubbing matchMedia pre-load.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = ((q: string) => {
        const m = orig(q);
        if (q.includes('prefers-reduced-motion')) {
          return { ...m, matches: true, addEventListener() {}, removeEventListener() {} } as MediaQueryList;
        }
        return m;
      }) as typeof window.matchMedia;
    });
  });

  test('reduced motion renders the hero fully static', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('section.relative.pt-32');
    const readLayers = () =>
      page.evaluate(() => {
        const wrap = document.querySelector('[data-hero-mesh]');
        const layers = wrap ? Array.from(wrap.querySelectorAll(':scope > div')) : [];
        return layers.map((el) => getComputedStyle(el as HTMLElement).transform);
      });
    const before = await readLayers();
    expect(before.length).toBe(4);
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const after = await readLayers();
    expect(after).toEqual(before);
    // Reduced builds drop the parallax wrappers entirely: layers are the
    // bare blobs, untransformed.
    expect(before.every((t) => t === 'none')).toBe(true);
  });
});
