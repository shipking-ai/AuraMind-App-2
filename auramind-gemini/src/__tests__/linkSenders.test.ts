/**
 * Every surface that sends an app link sends bonamind:// — shortcuts, the
 * widget and tile, Live Activity and Siri, push reminders and the Windows
 * OAuth return. auramind:// may appear only where links are still ACCEPTED
 * (installed builds, pinned shortcuts and old notifications send it).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const ROOTS = [
  'auramind-gemini/src',
  'auramind-gemini/android/app/src/main',
  'auramind-gemini/ios/App',
  'auramind-gemini/src-tauri/src',
  'api',
];
const TEXT = /\.(ts|tsx|js|java|kt|swift|rs|xml|plist)$/;

/** Files whose job is to accept both schemes, with why. */
const ACCEPTS_BOTH = new Set([
  'auramind-gemini/src-tauri/src/links.rs', // Windows launch-argument parser and its tests
  'auramind-gemini/android/app/src/main/AndroidManifest.xml', // registers both schemes
  'auramind-gemini/ios/App/App/Info.plist', // registers both schemes
  'auramind-gemini/src/lib/deepLinks.ts', // parses both schemes
  'auramind-gemini/src/desktop/deepLinkRouter.ts', // routes both schemes on Windows
  'auramind-gemini/src/services/notifications/pushService.ts', // follows both on a notification tap
]);
/** Single lines that accept the old scheme. */
const ACCEPT_LINE = /startsWith\('auramind:\/\/'\)/; // POST /api/push/send link check

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    // assets/ under android/app/src/main is the generated, git-ignored web build.
    if (['node_modules', '__tests__', 'tests', 'build', 'assets'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

it('sends bonamind:// links from every surface', () => {
  const hits: string[] = [];
  for (const file of ROOTS.flatMap((r) => walk(join(REPO, r)))) {
    const rel = relative(REPO, file).replace(/\\/g, '/');
    if (ACCEPTS_BOTH.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('auramind://') && !ACCEPT_LINE.test(line)) hits.push(`${rel}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});
