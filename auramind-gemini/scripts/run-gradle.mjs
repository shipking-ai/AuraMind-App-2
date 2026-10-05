import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * run-gradle.mjs — cross-platform Gradle wrapper invoker for the Android
 * npm scripts.
 *
 * Windows uses `.\gradlew.bat` via cmd.exe (shell: true); macOS/Linux use
 * `./gradlew` directly. Mirrors the wrapper selection previously inline in
 * build-debug-apk.mjs, so `npm run build:aab:release` works from Git Bash,
 * PowerShell, and the Linux CI runners alike.
 *
 * Usage:
 *   node scripts/run-gradle.mjs assembleDebug
 *   node scripts/run-gradle.mjs bundleRelease
 */

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const androidDir = resolve(scriptDir, '..', 'android');

const task = process.argv[2];
if (!task) {
  console.error('[BonaMind] usage: node scripts/run-gradle.mjs <task>');
  process.exit(2);
}

const wrapper = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

const result = spawnSync(wrapper, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[BonaMind] Could not start ${wrapper}:`, result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
