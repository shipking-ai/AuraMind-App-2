#!/usr/bin/env node
/**
 * scripts/check-mobile-env.js
 *
 * Pre-flight check that runs before any mobile:* script (and is invoked at
 * the top of mobile:release:*). Verifies that all signing / API secrets are
 * actually set so the Gradle commands downstream don't fail
 * mid-build with opaque errors.
 *
 * IMPORTANT: this script NEVER prints secret values. It just verifies
 * presence + plausible shape (length, prefix, file-exists).
 *
 * Exit codes:
 *   0 = all required vars present, all required binaries on PATH
 *   1 = required env vars are missing or malformed (callers can fix + retry)
 *   2 = required binary dependency is missing (callers need to install tooling)
 */

'use strict';

// This package is ESM ("type": "module"), so use import syntax. __dirname is
// not defined in ESM — derive it from import.meta.url.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ROOT = path.resolve(__dirname, '..');

const checks = [];

// ── Android signing ────────────────────────────────────────────
checks.push({
  key: 'ANDROID_KEYSTORE_PATH',
  label: 'Android release keystore path',
  validate: (v) => {
    if (!v) return 'env var ANDROID_KEYSTORE_PATH is not set';
    const resolved = path.isAbsolute(v) ? v : path.resolve(REPO_ROOT, v);
    if (!fs.existsSync(resolved)) {
      return `keystore file not found at: ${resolved}`;
    }
    const stat = fs.statSync(resolved);
    if (stat.size < 1024) return `keystore suspiciously small: ${stat.size} bytes`;
    if (stat.size > 16 * 1024 * 1024) return `keystore suspiciously large: ${stat.size} bytes`;
    return null;
  },
});
checks.push({
  key: 'ANDROID_KEYSTORE_PASSWORD',
  label: 'Android keystore password',
  validate: (v) => (!v ? 'env var ANDROID_KEYSTORE_PASSWORD is not set' : null),
});
checks.push({
  key: 'ANDROID_KEY_ALIAS',
  label: 'Android key alias',
  validate: (v) => (!v ? 'env var ANDROID_KEY_ALIAS is not set' : null),
});
checks.push({
  key: 'ANDROID_KEY_PASSWORD',
  label: 'Android key password',
  validate: (v) => (!v ? 'env var ANDROID_KEY_PASSWORD is not set' : null),
});

// ── Google Play Console ────────────────────────────────────────
if (process.argv.includes('--with-play')) {
  checks.push({
    key: 'PLAY_STORE_SERVICE_ACCOUNT_JSON_PATH',
    label: 'Google Play service-account JSON',
    validate: (v) => {
      if (!v) return 'env var PLAY_STORE_SERVICE_ACCOUNT_JSON_PATH is not set';
      const resolved = path.isAbsolute(v) ? v : path.resolve(REPO_ROOT, v);
      if (!fs.existsSync(resolved)) return 'service-account JSON not found at: ' + resolved;
      const text = fs.readFileSync(resolved, 'utf8');
      if (!text.includes('"type": "service_account"')) {
        return 'service-account JSON does not look like a Google service account';
      }
      return null;
    },
  });
}

// ── System binaries ────────────────────────────────────────────
function ensureBinary(name) {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${name}`, { stdio: 'pipe' });
    return null;
  } catch {
    return `${name} not on PATH. ${process.platform === 'win32' ? `Install it and ensure it's reachable (e.g. 'where ${name}')` : 'Install the toolchain it belongs to'}.`;
  }
}

const binChecks = [];
if (process.argv.includes('--gradle')) {
  binChecks.push({ name: 'gradle', fix: 'Use the wrapper (android/gradlew) or install Android Studio' });
}

// ── Run ─────────────────────────────────────────────────────────
let failed = 0;
let missingBinaries = 0;

console.log('\nAuraMind mobile release pre-flight check\n');

for (const c of checks) {
  const v = process.env[c.key];
  const err = c.validate ? c.validate(v) : null;
  if (err) {
    console.error(`  ✗ ${c.label} (${c.key})`);
    console.error(`      ${err}`);
    failed++;
  } else {
    console.log(`  ✓ ${c.label}`);
  }
}

for (const bc of binChecks) {
  const err = ensureBinary(bc.name);
  if (err) {
    console.error(`  ✗ ${bc.name}`);
    console.error(`      ${err}`);
    console.error(`      → ${bc.fix}`);
    missingBinaries++;
  } else {
    console.log(`  ✓ ${bc.name}`);
  }
}

if (missingBinaries > 0) {
  console.error(`\n${missingBinaries} binary dep${missingBinaries === 1 ? '' : 's'} missing. Install them and re-run.\n`);
  process.exit(2);
} else if (failed > 0) {
  console.error(`\n${failed} required item${failed === 1 ? '' : 's'} missing. Set them in your environment or in CI/CD secrets and try again.\n`);
  console.error('See auramind-gemini/android/keystore/README.md and docs/M6-store-submission-playbook.md for what each var means.\n');
  process.exit(1);
} else {
  console.log('\nAll required items present.\n');
  process.exit(0);
}
