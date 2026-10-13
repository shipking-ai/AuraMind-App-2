/**
 * After the rename, web code reads and writes only `bonamind`-prefixed
 * storage keys, event names and cache names. Pre-rename names may appear in
 * exactly one source file, src/lib/legacyNames.ts, plus lines marked
 * `// legacy-name: ok`. A missed reader would silently show defaults after
 * the migration moved its data, so this fails CI instead.
 *
 * Exempt everywhere: the app ID `com.auramind.app`, the `auramind-gemini`
 * folder name and `auramind://` links (accepted alongside `bonamind://`).
 * Capitalised "AuraMind" is visible copy and is checked separately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '../..');
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|json|svg|md|txt|webmanifest|xml)$/;
const EXEMPT_FILES = new Set(['src/lib/legacyNames.ts']);
const LEGACY = /auramind(?=_|\.|:(?!\/\/)|-)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (TEXT.test(name) && !/\.test\.[a-z]+$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function legacyHits(): string[] {
  const hits: string[] = [];
  for (const file of [...walk(join(APP_ROOT, 'src')), ...walk(join(APP_ROOT, 'public'))]) {
    const rel = relative(APP_ROOT, file).replace(/\\/g, '/');
    if (EXEMPT_FILES.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('// legacy-name: ok')) return;
        const cleaned = line.replace(/com\.auramind\.app/g, '').replace(/auramind-gemini/g, '');
        if (LEGACY.test(cleaned)) hits.push(`${rel}:${i + 1}`);
      });
  }
  return hits;
}

it('uses no pre-rename storage, event or cache names outside legacyNames.ts', () => {
  expect(legacyHits()).toEqual([]);
});

it('deletes the pre-rename widget cache when the service worker activates', () => {
  const sw = readFileSync(join(APP_ROOT, 'public/widget-sw.js'), 'utf8');
  expect(sw).toMatch(/addEventListener\('activate'/);
  expect(sw).toContain('caches.delete(');
  const legacyLines = sw.split('\n').filter((l) => l.includes('auramind-widget-state'));
  expect(legacyLines).toHaveLength(1);
  expect(legacyLines[0]).toContain('// legacy-name: ok');
});
