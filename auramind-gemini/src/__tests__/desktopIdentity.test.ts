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
    // The only pre-rename name left is the old key being removed.
    const legacy = hooks.split('\n').filter((l) => l.includes('AuraMind'));
    expect(legacy.length).toBeGreaterThan(0);
    for (const line of legacy) expect(line.trim()).toMatch(/^DeleteRegKey HKCU ".*\\shell\\AuraMind"$/);
  });

  // An install made before the rename wrote shell\AuraMind. Updating over it
  // (or uninstalling) must not leave that entry pointing at a deleted exe or
  // showing a second "Make a course" item.
  it('removes the pre-rename Explorer entry on install and on uninstall', () => {
    const hooks = read('windows/installer-hooks.nsh');
    for (const macro of ['BonaMindVerb', 'BonaMindUnverb']) {
      const body = hooks.split(`!macro ${macro} EXT`)[1].split('!macroend')[0];
      expect(body, macro).toMatch(/DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\\.\$\{EXT\}\\shell\\AuraMind"/);
    }
  });
});
