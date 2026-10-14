/**
 * Everything a person reads says BonaMind and Prof. Linnea: screen copy,
 * native strings, the HTML shell, the favicon and the Windows app config.
 * Code identifiers (ProfAuraAvatar, useAuraMind…) are renamed separately
 * and aren't matched here; a name glued into a longer identifier is not
 * visible text.
 *
 * The tutor used to be called plain "Aura", so a standalone `Aura` fails
 * too, except the uses below that never meant the tutor or the product.
 * All-caps copy (eyebrows, store headings) is checked as well. A comment
 * that starts a sentence with "Aura", or an identifier named exactly `Aura`,
 * also fails; rename it rather than widening the keep-list.
 *
 * src/lib/legacyNames.ts is skipped: it holds the old names on purpose, so
 * saved text and links from before the rename can be mapped forward.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '../..');
const TEXT = /\.(ts|tsx|js|jsx|mjs|css|html|json|svg|xml|plist|md|txt|webmanifest|java|kt|swift|rs|ps1)$/;

/** Roots scanned for visible copy, relative to auramind-gemini/. */
const ROOTS = [
  'src',
  'public',
  'index.html',
  'android/app/src/main/res',
  'ios/App/App/Info.plist',
  'ios/App/AuraMindWidgets/Info.plist',
  'src-tauri/tauri.conf.json',
  'src-tauri/src',
  'src-tauri/windows/generate-assets.ps1',
  'android/app/src/main/java',
  'android/wear/src/main',
  'ios/App/App',
  'ios/App/AuraMindWidgets',
  '../store/android/listings',
  '../store/android/changelogs',
];

const SKIP_FILES = new Set(['src/lib/legacyNames.ts']);

const STANDALONE_BRAND = /(?<![A-Za-z0-9_])(AuraMind|AURAMIND)(?![A-Za-z0-9_])/;
const OLD_TUTOR = /Prof(?:\. ?| )Aura\b/;
/** The pre-rename domain no longer serves the site (com.auramind.app is the app ID, not a host). */
const DEAD_DOMAIN = /(?<![A-Za-z0-9_.])auramind\.app/;
const STANDALONE_AURA = /(?<![A-Za-z0-9_\-./])(Aura|AURA)(?![A-Za-z0-9_])/;

/** Standalone "Aura" that is not the tutor or the product, with why. */
const AURA_KEEP: { file?: RegExp; phrase?: RegExp; reason: string }[] = [
  { phrase: /"Aura (Sans|Script)"/, reason: 'font family names in the CSS, not shown as text' },
  { phrase: /title: "Aura (Drift|Flow)"/, reason: 'ambient music track titles' },
  { file: /^src\/components\/native\/auraDepth\.ts$/, phrase: /Aura (depth|layers)/, reason: 'comments about the "focus aura" glow effect' },
  { file: /^src\/types\/league\.ts$/, phrase: /name: 'Aura'|to Aura top tier/, reason: 'the top league tier is named Aura (a glow), like Diamond' },
  { file: /^android\/app\/src\/main\/res\/drawable\/splash_icon\.xml$/, reason: 'comment about the aura-mark artwork' },
  { file: /^src\/styles\/platform-styles\.css$/, phrase: /Aura motion/, reason: 'comment about the aura glow animation' },
];

function files(root: string): string[] {
  const full = join(APP_ROOT, root);
  if (!statSync(full).isDirectory()) return [full];
  const out: string[] = [];
  for (const name of readdirSync(full)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const child = join(full, name);
    if (statSync(child).isDirectory()) out.push(...files(relative(APP_ROOT, child)));
    else if (TEXT.test(name) && !/\.test\.[a-z]+$/.test(name)) out.push(child);
  }
  return out;
}

function hits(): string[] {
  const out: string[] = [];
  for (const file of ROOTS.flatMap(files)) {
    const rel = relative(APP_ROOT, file).replace(/\\/g, '/');
    if (SKIP_FILES.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const where = `${rel}:${i + 1}`;
        if (STANDALONE_BRAND.test(line) || OLD_TUTOR.test(line) || DEAD_DOMAIN.test(line)) return void out.push(where);
        if (!STANDALONE_AURA.test(line)) return;
        const kept = AURA_KEEP.some((k) => (!k.file || k.file.test(rel)) && (!k.phrase || k.phrase.test(line)));
        if (!kept) out.push(where);
      });
  }
  return out;
}

it('shows BonaMind and Prof. Linnea everywhere a person reads', () => {
  expect(hits()).toEqual([]);
});

it('splits no wordmark into "Aura" + "Mind"', () => {
  for (const file of ['src/components/dashboard/nova/NovaDashboardShell.tsx', 'src/components/ui/CinematicLoader.tsx']) {
    expect(readFileSync(join(APP_ROOT, file), 'utf8')).not.toMatch(/>\s*Aura\s*</);
  }
});
