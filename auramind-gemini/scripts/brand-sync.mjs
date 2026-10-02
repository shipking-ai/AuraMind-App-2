#!/usr/bin/env node
/**
 * Syncs and verifies the product name in the native shells.
 *
 * Why this script exists
 * ----------------------
 * app-identity.ts is the single source of truth, but three of the surfaces
 * that show the product name cannot import a TypeScript module:
 *
 *   android/app/src/main/res/values/strings.xml   (app_name, title_activity_main)
 *   ios/App/App/Info.plist                        (CFBundleDisplayName)
 *   ios/App/AuraMindWidgets/Info.plist            (CFBundleDisplayName)
 *
 * The widget plist is the one that gets forgotten: rename the app and the
 * widget on the home screen keeps the old name, which reads as a bug in the
 * store screenshots rather than a missed config line.
 *
 * XML and plist have no way to reach a .ts constant, so this script is the
 * bridge. Run it with --write after a rename to rewrite the files, and without
 * to verify. CI runs the verify form, so a rename that forgets the native side
 * fails the build instead of shipping.
 *
 * What it deliberately does NOT touch
 * -----------------------------------
 * The package id (com.auramind.app) in strings.xml, applicationId, and
 * custom_url_scheme. Google Play and the App Store key listings to that
 * identifier permanently; changing it orphans the listing and the closed-test
 * clock. Only the display name is safe to rename.
 *
 * Usage:
 *   node scripts/brand-sync.mjs           # verify (exit 1 on drift)
 *   node scripts/brand-sync.mjs --write    # rewrite the native files
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

/**
 * Read the name constants straight out of app-identity.ts.
 *
 * A regex rather than an import because this is a plain Node script and
 * app-identity.ts is TypeScript. The patterns are anchored to the export
 * statements and tolerate a trailing semicolon, so an ordinary edit to the
 * file does not silently make this script read undefined — it throws instead.
 */
function readIdentity() {
  const src = readFileSync(path.join(ROOT, 'app-identity.ts'), 'utf8');

  function constant(name) {
    const m = src.match(new RegExp(`export const ${name}\\s*(?::[^=]+)?=\\s*'([^']+)'`));
    if (!m) throw new Error(`brand-sync: could not read ${name} from app-identity.ts`);
    return m[1];
  }

  const name = constant('APP_NAME');
  const tagline = constant('APP_TAGLINE');
  return {
    name,
    tagline,
    socialTitle: `${name} - ${tagline}`,
  };
}

/** Each target: a path, and how to find/replace the display name in it. */
function targets(identity) {
  return [
    {
      label: 'android/app/src/main/res/values/strings.xml',
      path: path.join(ROOT, 'android/app/src/main/res/values/strings.xml'),
      // Only these two string resources. package_name and custom_url_scheme in
      // the same file are the permanent bundle id and must not be touched.
      apply(src) {
        return src
          .replace(/(<string name="app_name">)([^<]*)(<\/string>)/, `$1${identity.name}$3`)
          .replace(
            /(<string name="title_activity_main">)([^<]*)(<\/string>)/,
            `$1${identity.name}$3`,
          );
      },
      read(src) {
        return [src.match(/<string name="app_name">([^<]*)</)?.[1], src.match(/<string name="title_activity_main">([^<]*)</)?.[1]];
      },
      expect: [identity.name, identity.name],
    },
    {
      label: 'ios/App/App/Info.plist',
      path: path.join(ROOT, 'ios/App/App/Info.plist'),
      apply(src) {
        // CFBundleName is $(PRODUCT_NAME) and stays as-is; only the display
        // name is user-facing and renameable.
        return src.replace(
          /(<key>CFBundleDisplayName<\/key>\s*<string>)([^<]*)(<\/string>)/,
          `$1${identity.name}$3`,
        );
      },
      read(src) {
        return [src.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)</)?.[1]];
      },
      expect: [identity.name],
    },
    {
      label: 'ios/App/AuraMindWidgets/Info.plist',
      path: path.join(ROOT, 'ios/App/AuraMindWidgets/Info.plist'),
      apply(src) {
        return src.replace(
          /(<key>CFBundleDisplayName<\/key>\s*<string>)([^<]*)(<\/string>)/,
          `$1${identity.name}$3`,
        );
      },
      read(src) {
        return [src.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)</)?.[1]];
      },
      expect: [identity.name],
    },
  ];
}

const identity = readIdentity();
const results = [];
let drifted = 0;

for (const t of targets(identity)) {
  let src;
  try {
    src = readFileSync(t.path, 'utf8');
  } catch {
    results.push({ label: t.label, state: 'MISSING' });
    drifted++;
    continue;
  }

  const actual = t.read(src);
  const matches = actual.every((v, i) => v === t.expect[i]);

  if (matches) {
    results.push({ label: t.label, state: 'ok', value: actual.join(', ') });
    continue;
  }

  if (WRITE) {
    writeFileSync(t.path, t.apply(src), 'utf8');
    results.push({ label: t.label, state: 'WROTE', value: identity.name });
  } else {
    results.push({ label: t.label, state: 'DRIFT', value: actual.join(', ') || '(not found)' });
    drifted++;
  }
}

const pad = Math.max(...results.map((r) => r.label.length));
console.log(`app-identity.ts APP_NAME = "${identity.name}"\n`);
for (const r of results) {
  const mark = r.state === 'ok' ? 'ok  ' : r.state === 'WROTE' ? 'wrote' : 'DRIFT';
  console.log(`  ${mark}  ${r.label.padEnd(pad)}  ${r.value}`);
}

console.log('');
if (drifted && !WRITE) {
  console.log(`${drifted} native file(s) disagree with app-identity.ts.`);
  console.log('Run: node scripts/brand-sync.mjs --write');
  process.exit(1);
}
if (drifted && WRITE) {
  console.log(`Rewrote ${drifted} native file(s). Re-run to verify.`);
  process.exit(1);
}
console.log('Native shells match app-identity.ts.');