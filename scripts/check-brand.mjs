#!/usr/bin/env node
// Brand guard: fails when a tracked file still says the product's old name.
//
// The product was renamed to BonaMind and its tutor to Prof. Linnea
// (docs/superpowers/specs/2026-10-13-bonamind-rename-design.md). Some old
// names are permanent (app IDs, the folder name, data that would be lost if
// renamed); the allow-list below names each one with its reason. Adding an
// entry is the owner's decision, never a way to make CI pass.
//
// A line can also opt out with the marker `legacy-name: ok` in a comment,
// for code that exists to read or accept the old name.
//
// Usage: node scripts/check-brand.mjs   (exits 1 and prints file:line: text)

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD_NAME = /AuraMind|auramind|Prof\.? ?Aura|ProfAura/; // legacy-name: ok
const MARKER = 'legacy-name: ok';

// Permanent names, removed from a line before it is searched, so the rest of
// the line is still checked.
const PERMANENT_TOKENS = [
  { token: 'com.auramind.app', reason: 'Permanent app ID (Android, Windows)' }, // legacy-name: ok
  { token: 'com/auramind/app', reason: 'Java package path tied to the app ID' }, // legacy-name: ok
  { token: 'auramind-gemini', reason: 'Folder name, owner decision' }, // legacy-name: ok
  { token: 'auramind_biometric_creds', reason: 'Keystore-encrypted credentials file' }, // legacy-name: ok
  { token: 'auramind_study_session', reason: 'Notification channel ID keeps users’ channel settings' }, // legacy-name: ok
  { token: 'auramind-upload', reason: 'Signing key alias stored inside the upload keystore' }, // legacy-name: ok
  { token: '/auramind/sync', reason: 'Wear data-layer path; phone and watch update separately' }, // legacy-name: ok
  { token: '/auramind/grade', reason: 'Wear data-layer path; phone and watch update separately' }, // legacy-name: ok
  { token: 'pathPrefix="/auramind"', reason: 'Wear data-layer path filter' }, // legacy-name: ok
];

const STAND_IN_CLASSES = ['AuraMindWidgetProvider', 'AuraMindTileService']; // legacy-name: ok
const STAND_IN_FILES = new Set(['AuraMindWidgetProvider.java', 'AuraMindTileService.kt']); // legacy-name: ok
const RENAME_DATE = '2026-10-13';

// Names kept only in particular places. Like PERMANENT_TOKENS they are
// removed from the line and the rest is still searched, so a visible label
// on the same line is still reported.
function scopedTokens(file, line, ctx) {
  const name = basename(file);
  const tokens = [];
  if (name === 'AndroidManifest.xml' || STAND_IN_FILES.has(name)) {
    // Stand-ins keep placed widgets and tiles working.
    tokens.push(...STAND_IN_CLASSES);
  }
  // Apps keep accepting links in the pre-rename scheme: only the scheme
  // registrations themselves.
  if (name === 'AndroidManifest.xml') tokens.push('android:scheme="auramind"'); // legacy-name: ok
  if (name === 'tauri.conf.json' && ctx.lines[line - 1].includes('"schemes"')) tokens.push('"auramind"'); // legacy-name: ok
  if (name === 'Info.plist' && ctx.urlSchemeLines.has(line)) tokens.push('<string>auramind</string>'); // legacy-name: ok
  return tokens;
}

// Line numbers inside the plist's CFBundleURLSchemes array.
function urlSchemeLines(lines) {
  const out = new Set();
  let inside = false;
  lines.forEach((l, i) => {
    if (/<key>CFBundleURLSchemes<\/key>/.test(l)) inside = 'key';
    else if (inside === 'key' && /<array>/.test(l)) inside = 'array';
    else if (inside === 'array' && /<\/array>/.test(l)) inside = false;
    else if (inside === 'array') out.add(i + 1);
  });
  return out;
}

// Whole files that may keep an old name.
const ALLOW_FILES = [
  {
    test: (file) => /^supabase\/migrations(-extra)?\//.test(file),
    reason: 'Applied SQL is append-only history',
  },
  {
    test: (file) => basename(file) === 'package-lock.json',
    reason: 'Generated; follows package.json names',
  },
  {
    test: (file) => {
      const date = /^\d{4}-\d{2}-\d{2}/.exec(basename(file));
      return file.startsWith('docs/superpowers/') && Boolean(date) && date[0] <= RENAME_DATE;
    },
    reason: 'Specs and plans dated up to the rename (its own included) are historical records',
  },
  {
    test: (file) => file === 'auramind-gemini/src/lib/legacyNames.ts', // legacy-name: ok
    reason: 'The one web module that names the old values',
  },
];

// Single lines that may keep an old name.
const ALLOW_LINES = [
  {
    test: (file, text, line, ctx) => file === 'CHANGELOG.md' && line > ctx.changelogHistoryStart,
    reason: 'CHANGELOG entries older than the rename are history',
  },
];

function changelogHistoryStart(lines) {
  // History starts at the first release heading after the rename entry
  // (a `### BonaMind rename` section inside the release that shipped it).
  const rename = lines.findIndex((l) => /^#{2,3} .*BonaMind rename/.test(l));
  if (rename === -1) return Infinity;
  const next = lines.findIndex((l, i) => i > rename && /^## /.test(l));
  return next === -1 ? Infinity : next + 1;
}

function strip(text, tokens) {
  let out = text;
  for (const token of tokens) out = out.split(token).join('');
  return out;
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

export function scanBrand({ root, files }) {
  const hits = [];
  for (const file of files) {
    const path = file.replace(/\\/g, '/');
    if (ALLOW_FILES.some((a) => a.test(path))) continue;
    let buf;
    try {
      buf = readFileSync(join(root, file));
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    if (isBinary(buf)) continue;
    const lines = buf.toString('utf8').split(/\r?\n/);
    const ctx = {
      lines,
      changelogHistoryStart: path === 'CHANGELOG.md' ? changelogHistoryStart(lines) : Infinity,
      urlSchemeLines: basename(path) === 'Info.plist' ? urlSchemeLines(lines) : new Set(),
    };
    lines.forEach((text, i) => {
      const line = i + 1;
      if (!OLD_NAME.test(text) || text.includes(MARKER)) return;
      const kept = [...PERMANENT_TOKENS.map((p) => p.token), ...scopedTokens(path, line, ctx)];
      if (!OLD_NAME.test(strip(text, kept))) return;
      if (ALLOW_LINES.some((a) => a.test(path, text, line, ctx))) return;
      hits.push({ file: path, line, text: text.trim() });
    });
  }
  return hits;
}

// realpath on both sides: through a symlinked checkout Node resolves the
// module but not argv[1], and a mismatch here would skip the scan and exit 0.
const isMain = Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const hits = scanBrand({ root, files });
  for (const h of hits) console.log(`${h.file}:${h.line}: ${h.text}`);
  if (hits.length) {
    console.error(
      `\n${hits.length} line(s) still use the old name. Rename them to BonaMind / Prof. Linnea.` +
        '\nIf a name must stay, see the allow-list in scripts/check-brand.mjs (the owner decides).',
    );
    process.exit(1);
  }
  console.log('Brand guard: no old names outside the allow-list.');
}
