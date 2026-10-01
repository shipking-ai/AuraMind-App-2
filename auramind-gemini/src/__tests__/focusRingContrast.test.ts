import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The focus indicator was `outline: 1.5px solid #7C3AED`, which is 1.15:1 on
 * the cobalt landing page and 1.54:1 once composited as violet-400/50 — the
 * value 23 components were using. WCAG 1.4.11 wants 3:1, so the indicator was
 * effectively invisible on the app's own surfaces.
 *
 * A single colour cannot fix this: the app renders #0A0A0A and #18181B
 * surfaces, a #3247E8 cobalt landing page, #7C3AED violet CTAs, and a light
 * theme. White scores 1.04:1 on the light theme and near-black scores 1.12:1
 * on zinc-900. The fix is two bands where the OUTER one carries the guarantee
 * and flips per theme.
 *
 * These tests hold the invariant numerically so a future palette tweak cannot
 * quietly push the ring back under 3:1, and they assert the rule stays
 * unlayered — moving it into @layer would let the 72 low-alpha Tailwind ring
 * utilities outrank it again and undo the whole fix.
 */

const SRC = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

const tokens = read('styles', 'design-tokens.css');
const globalCss = read('index.css');

/** WCAG 2.x relative luminance for a 6-digit hex. */
function luminance(hex: string): number {
  const h = hex.trim().replace('#', '');
  expect(h, `not a 6-digit hex: ${hex}`).toMatch(/^[0-9a-f]{6}$/i);
  const channels = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pull a --focus-ring-* value out of whichever block for `selector` declares
 * it. `:root` is declared twice in design-tokens.css (platform tokens, then
 * the focus tokens), so this has to scan every match rather than take the
 * first.
 */
function tokenValue(selector: string, prop: string): string {
  const escaped = selector.replace(/[.[\]]/g, '\\$&');
  const blocks = tokens.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g')) || [];
  for (const block of blocks) {
    const value = new RegExp(`${prop}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
    if (value) return value[1];
  }
  throw new Error(`${selector} is missing ${prop}`);
}

/** Surfaces the ring has to survive, and the theme each belongs to. */
const DARK_SURFACES = ['#0a0a0a', '#18181b', '#3247e8', '#7c3aed'];
const LIGHT_SURFACES = ['#fafafa', '#ffffff', '#f8f8fc'];
const MIN_RATIO = 3;

describe('focus indicator contrast', () => {
  it('dark theme: the outer band clears 3:1 on every dark surface', () => {
    const outer = tokenValue(':root', '--focus-ring-outer');
    for (const bg of DARK_SURFACES) {
      const ratio = contrast(outer, bg);
      expect(ratio, `${outer} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  });

  it('light theme: the outer band clears 3:1 on every light surface', () => {
    const outer = tokenValue('.light', '--focus-ring-outer');
    for (const bg of LIGHT_SURFACES) {
      const ratio = contrast(outer, bg);
      expect(ratio, `${outer} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  });

  it('the light theme outer band is genuinely different from the dark one', () => {
    expect(tokenValue('.light', '--focus-ring-outer')).not.toBe(
      tokenValue(':root', '--focus-ring-outer'),
    );
  });

  it('both themes define the inner brand band', () => {
    expect(tokenValue(':root', '--focus-ring-inner')).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(tokenValue('.light', '--focus-ring-inner')).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it('high contrast maximises separation in both themes', () => {
    const darkHc = tokenValue('html[data-high-contrast="true"]', '--focus-ring-outer');
    const lightHc = tokenValue('html[data-high-contrast="true"].light', '--focus-ring-outer');
    expect(darkHc.toLowerCase()).toBe('#ffffff');
    expect(lightHc.toLowerCase()).toBe('#000000');
  });
});

describe('global focus rule', () => {
  it('drives both bands from the tokens rather than a hardcoded colour', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(globalCss);
    expect(rule, 'no :focus-visible rule in index.css').toBeTruthy();
    expect(rule![1]).toMatch(/outline:\s*2px solid var\(--focus-ring-outer\)/);
    expect(rule![1]).toMatch(/box-shadow:[^;]*var\(--focus-ring-inner\)/);
  });

  it('does not force a border-radius, which used to square off pills on focus', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(globalCss)!;
    expect(rule[1]).not.toMatch(/border-radius/);
  });

  it('stays unlayered so it outranks the Tailwind ring utilities', () => {
    // index.css imports Tailwind, which emits utilities into @layer utilities.
    // Unlayered declarations win the cascade, so the global ring beats every
    // `focus-visible:ring-violet-400/40|50` without touching the components.
    const ruleIndex = globalCss.search(/:focus-visible\s*\{/);
    expect(ruleIndex).toBeGreaterThan(-1);
    const beforeRule = globalCss.slice(0, ruleIndex);
    // No @layer block may still be open at the point the rule appears.
    const opens = (beforeRule.match(/@layer[^{]*\{/g) || []).length;
    const closes = (beforeRule.match(/\}/g) || []).length;
    expect(opens, 'focus rule appears to sit inside an @layer block').toBeLessThanOrEqual(closes);
  });
});
