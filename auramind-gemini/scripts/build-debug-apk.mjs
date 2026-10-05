import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const androidDir = resolve(scriptDir, '..', 'android');
const wrapper = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

const result = spawnSync(wrapper, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[BonaMind] Could not start ${wrapper}:`, result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
