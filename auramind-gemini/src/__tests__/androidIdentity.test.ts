/**
 * Android names that must survive the rename, read straight from the native
 * sources:
 *   - The home-screen widget and the Wear tile stay registered under their
 *     pre-rename class names. Android finds placed widgets and added tiles by
 *     that name; a new name silently removes them from users' screens.
 *   - The code lives in BonaMind* classes; the old names are empty stand-ins.
 *   - Lookups of "my placed widgets / my tile" use the registered class.
 *   - The Wear data-layer paths are shared by phone and watch builds that
 *     update separately, so they never change.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ANDROID = resolve(__dirname, '../../android');
const read = (rel: string) => readFileSync(resolve(ANDROID, rel), 'utf8');
const APP_JAVA = 'app/src/main/java/com/auramind/app';
const WEAR_KT = 'wear/src/main/java/com/auramind/app/wear';

describe('registered widget and tile names', () => {
  it('keeps the phone widget registered as .AuraMindWidgetProvider only', () => { // legacy-name: ok
    const manifest = read('app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:name="\.AuraMindWidgetProvider"/); // legacy-name: ok
    expect(manifest).not.toMatch(/\.BonaMindWidgetProvider/);
    expect(manifest).toMatch(/@xml\/bonamind_widget_info/);
  });

  it('keeps the Wear tile registered as .AuraMindTileService only', () => { // legacy-name: ok
    const manifest = read('wear/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:name="\.AuraMindTileService"/); // legacy-name: ok
    expect(manifest).not.toMatch(/\.BonaMindTileService/);
  });

  it('makes the old names empty stand-ins for the BonaMind classes', () => {
    expect(read(`${APP_JAVA}/AuraMindWidgetProvider.java`)).toMatch( // legacy-name: ok
      /class AuraMindWidgetProvider extends BonaMindWidgetProvider\s*\{\s*\}/, // legacy-name: ok
    );
    expect(read(`${WEAR_KT}/AuraMindTileService.kt`)).toMatch(/class AuraMindTileService\s*:\s*BonaMindTileService\(\)/); // legacy-name: ok
    expect(read(`${WEAR_KT}/BonaMindTileService.kt`)).toMatch(/open class BonaMindTileService/);
  });

  it('looks up placed widgets and the tile by their registered class', () => {
    expect(read(`${APP_JAVA}/BonaMindWidgetProvider.java`)).toMatch(/new ComponentName\(context, AuraMindWidgetProvider\.class\)/); // legacy-name: ok
    expect(read(`${WEAR_KT}/BonaMindTileService.kt`)).toMatch(/requestUpdate\(AuraMindTileService::class\.java\)/); // legacy-name: ok
  });
});

describe('Wear data-layer paths', () => {
  it('stay /auramind/sync and /auramind/grade on both sides', () => {
    for (const file of [`${APP_JAVA}/WearSyncPlugin.java`, `${WEAR_KT}/WearData.kt`]) {
      const src = read(file);
      expect(src).toContain('"/auramind/sync"');
      expect(src).toContain('"/auramind/grade"');
    }
    for (const manifest of ['app/src/main/AndroidManifest.xml', 'wear/src/main/AndroidManifest.xml']) {
      expect(read(manifest)).toContain('android:pathPrefix="/auramind"');
    }
  });
});

describe('plugin classes', () => {
  it('registers the Bona* plugins under their Bona* names', () => {
    const main = read(`${APP_JAVA}/MainActivity.java`);
    for (const name of ['BonaDevice', 'BonaSpeech', 'BonaListen', 'BonaLiveUpdate']) {
      expect(main).toContain(`registerPlugin(${name}Plugin.class)`);
      expect(read(`${APP_JAVA}/${name}Plugin.java`)).toMatch(new RegExp(`@CapacitorPlugin\\(\\s*name = "${name}"`));
    }
  });
});
