import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The settings page has 22 switches built from one local `Toggle` component,
 * and every instance was broken in the same four ways:
 *
 *   1. No accessible name. The button contained only a decorative knob, so all
 *      22 announced as a bare "button" with no indication of what they did.
 *   2. No exposed state. On/off existed only as background colour and knob
 *      position, so it was invisible to assistive tech - a screen reader
 *      reported 22 identically unlabelled buttons and nothing about their
 *      state.
 *   3. No `type`, so all 22 defaulted to `type="submit"`.
 *   4. `h-5` is 20px, under the 24px WCAG 2.2 target-size minimum.
 *
 * A source-level test is used deliberately: `Toggle` is module-local and
 * `SettingsPage` needs a signed-in user plus a dozen providers, so rendering
 * it is not worth it here. The advantage of scanning the source is that all 22
 * call sites are checked at once - a render test can only ever see the ones it
 * happened to mount.
 */

const SRC = path.resolve(__dirname, '..');
const FILE = path.join(SRC, 'pages', 'settings', 'SettingsPage.tsx');
const source = fs.readFileSync(FILE, 'utf8');
const lines = source.split('\n');

/** The component definition, not a call site. */
const definition = (() => {
  const start = source.indexOf('const Toggle = (');
  expect(start, 'Toggle component not found').toBeGreaterThan(-1);
  const end = source.indexOf(');', start);
  return source.slice(start, end);
})();

interface CallSite {
  line: number;
  label: string | null;
  rowLabel: string | null;
}

const callSites: CallSite[] = [];
lines.forEach((line, index) => {
  if (!/<Toggle\s/.test(line)) return;
  const label = /<Toggle\s+label="([^"]+)"/.exec(line);
  let rowLabel: string | null = null;
  for (let j = index - 1; j >= 0 && index - j <= 12; j--) {
    const row = /SettingRow\s+label="([^"]+)"/.exec(lines[j]);
    if (row) { rowLabel = row[1]; break; }
  }
  callSites.push({ line: index + 1, label: label ? label[1] : null, rowLabel });
});

describe('settings Toggle semantics', () => {
  it('exposes a switch role and its state', () => {
    expect(definition).toMatch(/role="switch"/);
    expect(definition).toMatch(/aria-checked=\{on\}/);
  });

  it('is not a submit button', () => {
    // A bare <button> inside a <form> submits it, which would make toggling a
    // setting navigate away from the page.
    expect(definition).toMatch(/type="button"/);
  });

  it('takes its accessible name from the caller', () => {
    expect(definition).toMatch(/aria-label=\{label\}/);
    expect(definition).toMatch(/label: string/);
  });

  it('grows the hit area past 24px without changing the visual size', () => {
    // The track stays h-5 (20px); an ::after extends the clickable box
    // vertically so the target clears the WCAG 2.2 minimum.
    expect(definition).toMatch(/h-5/);
    expect(definition).toMatch(/after:-top-1/);
    expect(definition).toMatch(/after:-bottom-1/);
  });

  it('renders a decorative knob that is not part of the name', () => {
    // The knob is an empty div, so it contributes nothing to the name - which
    // is exactly why the explicit aria-label is required.
    expect(definition).toMatch(/w-4 h-4 rounded-full bg-white/);
  });
});

describe('every Toggle call site is labelled', () => {
  it('finds all of them', () => {
    expect(callSites.length).toBe(22);
  });

  it('gives every one an explicit label', () => {
    const missing = callSites.filter((c) => c.label === null).map((c) => c.line);
    expect(missing, `unlabelled Toggle lines: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('uses the same wording as the visible row label', () => {
    const mismatched = callSites
      .filter((c) => c.label !== c.rowLabel)
      .map((c) => `line ${c.line}: "${c.label}" vs row "${c.rowLabel}"`);
    expect(mismatched, mismatched.join('; ')).toHaveLength(0);
  });

  it('gives every one a unique name', () => {
    // Two switches with the same name would be indistinguishable when
    // navigating by landmark or listing controls.
    const counts = new Map<string, number>();
    for (const c of callSites) counts.set(c.label!, (counts.get(c.label!) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([l, n]) => `${l} x${n}`);
    expect(dupes, `duplicate switch names: ${dupes.join(', ')}`).toHaveLength(0);
  });
});
