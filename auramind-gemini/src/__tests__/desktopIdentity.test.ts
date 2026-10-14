/**
 * The Windows app's names after the rename. The Tauri identifier stays
 * com.auramind.app: Windows keys the install, its uninstaller and its saved
 * data to it, so a new identifier would orphan every install.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TAURI = resolve(__dirname, '../../src-tauri');
const read = (rel: string) => readFileSync(resolve(TAURI, rel), 'utf8');

describe('Windows app identity', () => {
  const conf = JSON.parse(read('tauri.conf.json'));

  it('keeps the permanent identifier', () => {
    expect(conf.identifier).toBe('com.auramind.app');
  });

  it('checks for updates at the renamed repo (updater endpoint)', () => {
    expect(conf.plugins.updater.endpoints).toEqual([
      'https://github.com/shipking-ai/BonaMind/releases/latest/download/latest.json',
    ]);
  });

  it('names the crate, library and installer verb after BonaMind', () => {
    const cargo = read('Cargo.toml');
    expect(cargo).toMatch(/^name = "bonamind-desktop"$/m);
    expect(cargo).toMatch(/^name = "bonamind_desktop_lib"$/m);
    expect(cargo).toMatch(/^description = "BonaMind for Windows"$/m);
    expect(read('src/main.rs')).toContain('bonamind_desktop_lib::run()');
    const hooks = read('windows/installer-hooks.nsh');
    expect(hooks).toMatch(/!macro BonaMindVerb EXT/);
    expect(hooks).not.toMatch(/AuraMind/);
  });
});
