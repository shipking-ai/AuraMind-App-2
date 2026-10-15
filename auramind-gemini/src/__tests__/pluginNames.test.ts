/**
 * A Capacitor plugin is found by name at runtime: the string in the web
 * code's registerPlugin('X') must equal @CapacitorPlugin(name = "X") on
 * Android or jsName = "X" on iOS. A mismatch fails silently on the device
 * (voice answers or the Live Activity simply do nothing), so it is checked
 * here, where it fails loudly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '../..');

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'build' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, ext, out);
    else if (ext.test(name)) out.push(full);
  }
  return out;
}

function names(dir: string, ext: RegExp, pattern: RegExp): Set<string> {
  const found = new Set<string>();
  for (const file of files(join(APP, dir), ext)) {
    for (const m of readFileSync(file, 'utf8').matchAll(pattern)) found.add(m[1]);
  }
  return found;
}

const web = names('src', /\.(ts|tsx)$/, /registerPlugin\s*(?:<[^>]*>)?\s*\(\s*['"](\w+)['"]/g);
const android = names('android/app/src/main/java', /\.java$/, /@CapacitorPlugin\(\s*name\s*=\s*"(\w+)"/g);
const ios = names('ios/App', /\.swift$/, /jsName\s*=\s*"(\w+)"/g);

/** Which platforms implement each plugin the web code registers. */
const EXPECTED: Record<string, ('android' | 'ios')[]> = {
  BonaDevice: ['android'],
  BonaSpeech: ['android'],
  BonaLiveUpdate: ['android'],
  BonaListen: ['android', 'ios'],
  BonaLiveActivity: ['ios'],
  BiometricAuth: ['android'],
  ShareTarget: ['android'],
};

describe('Capacitor plugin names', () => {
  it('registers exactly the expected plugins from the web code', () => {
    expect([...web].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s has a native plugin of the same name on each platform', (name, platforms) => {
    if (platforms.includes('android')) expect(android.has(name), `Android @CapacitorPlugin(name = "${name}")`).toBe(true);
    if (platforms.includes('ios')) expect(ios.has(name), `iOS jsName = "${name}"`).toBe(true);
  });
});
