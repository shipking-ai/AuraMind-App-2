import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scanBrand } from './check-brand.mjs';

// Planted files live in a temp directory, not in the repo, so the repo-wide
// scan never meets them.
function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-brand-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    return scanBrand({ root, files: Object.keys(files) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('reports a planted old brand at its file and line', () => {
  const hits = scan({ 'src/a.ts': "export {};\nconst x = 'AuraMind';\n" }); // legacy-name: ok
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['src/a.ts:2']);
});

test('reports the old tutor name in prose and in code', () => {
  const hits = scan({
    'a.md': 'Ask Prof. Aura anything.\n', // legacy-name: ok
    'b.tsx': 'import { ProfAuraAvatar } from "./x";\n', // legacy-name: ok
  });
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['a.md:1', 'b.tsx:1']);
});

test('passes the permanent names', () => {
  const hits = scan({
    'a.gradle': 'applicationId "com.auramind.app"\n', // legacy-name: ok
    'b.java': 'package com.auramind.app.widget;\n', // legacy-name: ok
    'c.yml': 'working-directory: auramind-gemini/x\n', // legacy-name: ok
    'd.gradle': 'keyAlias "auramind-upload"\n', // legacy-name: ok
    'e.java': 'getSharedPreferences("auramind_biometric_creds", 0);\n', // legacy-name: ok
    'f.java': 'new NotificationChannel("auramind_study_session", n, i);\n', // legacy-name: ok
    'g.kt': 'const val SYNC = "/auramind/sync"; const val GRADE = "/auramind/grade"\n', // legacy-name: ok
    'AndroidManifest.xml': '<data android:pathPrefix="/auramind" />\n', // legacy-name: ok
  });
  assert.deepEqual(hits, []);
});

test('passes applied migrations, lockfiles and pre-rename plans', () => {
  const hits = scan({
    'supabase/migrations/2026_x.sql': '-- AuraMind\n', // legacy-name: ok
    'supabase/migrations-extra/y.sql': '-- AuraMind\n', // legacy-name: ok
    'package-lock.json': '{ "name": "auramind" }\n', // legacy-name: ok
    'docs/superpowers/specs/2026-10-01-old.md': 'AuraMind\n', // legacy-name: ok
    'docs/superpowers/plans/2026-10-13-bonamind-rename.md': 'AuraMind\n', // legacy-name: ok
  });
  assert.deepEqual(hits, []);
});

test('reports plans and specs dated from the rename on', () => {
  const hits = scan({ 'docs/superpowers/specs/2026-10-14-new.md': 'AuraMind\n' }); // legacy-name: ok
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['docs/superpowers/specs/2026-10-14-new.md:1']);
});

test('passes the legacy-names module and marked lines', () => {
  const hits = scan({
    'auramind-gemini/src/lib/legacyNames.ts': "export const LEGACY_BRAND = 'AuraMind';\n", // legacy-name: ok
    'src/b.ts': "accept('auramind'); // legacy-name: ok\n", // legacy-name: ok
  });
  assert.deepEqual(hits, []);
});

test('passes the widget and tile stand-ins only in their own files and manifests', () => {
  const hits = scan({
    'android/app/src/main/java/com/x/AuraMindWidgetProvider.java': 'public class AuraMindWidgetProvider {}\n', // legacy-name: ok
    'android/wear/src/main/java/com/x/AuraMindTileService.kt': 'class AuraMindTileService\n', // legacy-name: ok
    'android/app/src/main/AndroidManifest.xml': '<receiver android:name=".AuraMindWidgetProvider" />\n', // legacy-name: ok
    'src/other.ts': 'AuraMindWidgetProvider\n', // legacy-name: ok
  });
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['src/other.ts:1']);
});

test('passes the old scheme only where an app registers it', () => {
  const hits = scan({
    'android/app/src/main/AndroidManifest.xml': '<data android:scheme="auramind" />\n', // legacy-name: ok
    'ios/App/App/Info.plist': '<string>auramind</string>\n', // legacy-name: ok
    'src-tauri/tauri.conf.json': '"schemes": ["bonamind", "auramind"]\n', // legacy-name: ok
    'src/link.ts': "const scheme = 'auramind';\n", // legacy-name: ok
  });
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['src/link.ts:1']);
});

test('passes CHANGELOG history but not the release that carries the rename', () => {
  const changelog = [
    '# Changelog',
    '## [Unreleased]',
    'AuraMind slipped in here', // legacy-name: ok
    '### BonaMind rename',
    'Renamed from AuraMind.', // legacy-name: ok
    '### Added',
    'AuraMind in the same release', // legacy-name: ok
    '## [2.0.0] - 2026-09-09',
    'AuraMind 2.0 shipped.', // legacy-name: ok
  ].join('\n');
  const hits = scan({ 'CHANGELOG.md': changelog });
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), ['CHANGELOG.md:3', 'CHANGELOG.md:5', 'CHANGELOG.md:7']);
});

test('skips binary files', () => {
  const hits = scan({ 'img.png': Buffer.concat([Buffer.from([0x89, 0x50, 0x00]), Buffer.from('AuraMind')]) }); // legacy-name: ok
  assert.deepEqual(hits, []);
});
