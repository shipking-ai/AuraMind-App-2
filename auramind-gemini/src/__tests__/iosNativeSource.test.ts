/**
 * iOS native source invariants.
 *
 * These assert things about the Swift sources rather than by running them. The
 * motivation is a real bug that shipped: SceneDelegate created its own window
 * and set rootViewController to a bare CAPBridgeViewController, discarding the
 * storyboard's MainViewController — which is the only place BonaListenPlugin
 * and BonaLiveActivityPlugin are registered. Both features silently did
 * nothing, and CI read the result as "the OS refused".
 *
 * A native XCTest would be the stronger assertion, but none of this can be
 * compiled or run from the web app's test process, so it would only check on a
 * machine that has Xcode. These checks run everywhere the web suite does.
 *
 * The limitation is real and worth stating: they match source text, not
 * behaviour. They are tuned to fail on the specific regression above, not to
 * prove the app works.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const IOS = path.resolve(__dirname, '../../ios');
const APP = path.join(IOS, 'App');

function read(...parts: string[]): string {
  const p = path.join(APP, ...parts);
  expect(existsSync(p), `expected file at ${p}`).toBe(true);
  return readFileSync(p, 'utf8');
}

describe('SceneDelegate must not replace the storyboard root view controller', () => {
  const src = read('App', 'SceneDelegate.swift');

  it('does not construct a CAPBridgeViewController', () => {
    // This single line was the bug. MainViewController subclasses it and
    // registers the plugins in capacitorDidLoad; instantiating the base class
    // here throws that away, and the app runs with a working bridge and no
    // native plugins.
    expect(src).not.toMatch(/CAPBridgeViewController\s*\(/);
  });

  it('does not assign rootViewController', () => {
    expect(src).not.toMatch(/rootViewController\s*=/);
  });

  it('does not build its own UIWindow', () => {
    // UIKit assigns the storyboard's window before willConnectTo runs, so
    // creating another one orphans the scene's real window.
    expect(src).not.toMatch(/UIWindow\s*\(/);
  });

  it('still forwards the scene lifecycle to the Capacitor proxy', () => {
    // The proxy is what delivers a cold-launch deep link to the web layer.
    // Removing the window code must not take this with it.
    expect(src).toMatch(/SceneDelegateProxy\.shared\.scene\(\s*scene,\s*willConnectTo:/);
    expect(src).toMatch(/SceneDelegateProxy\.shared\.scene\(\s*scene,\s*openURLContexts:/);
    expect(src).toMatch(/SceneDelegateProxy\.shared\.scene\(\s*scene,\s*continue:/);
  });

  it('keeps the window property UIKit writes the storyboard window into', () => {
    expect(src).toMatch(/var window:\s*UIWindow\?/);
  });
});

describe('MainViewController registers every app-local plugin', () => {
  const src = read('App', 'MainViewController.swift');

  it('registers BonaListenPlugin', () => {
    expect(src).toMatch(/registerPluginInstance\(\s*BonaListenPlugin\(\)\s*\)/);
  });

  it('registers BonaLiveActivityPlugin', () => {
    expect(src).toMatch(/registerPluginInstance\(\s*BonaLiveActivityPlugin\(\)\s*\)/);
  });

  it('is the storyboard root, so it is the one that gets loaded', () => {
    const storyboard = read('App', 'Base.lproj', 'Main.storyboard');
    expect(storyboard).toMatch(/customClass="MainViewController"/);
  });

  it('is reachable — no other source assigns a different root', () => {
    // Belt and braces for the class above: if a future refactor re-adds a
    // rootViewController assignment in some other file, catch it here.
    const files = ['SceneDelegate.swift', 'AppDelegate.swift', 'MainViewController.swift'];
    for (const f of files) {
      const s = read('App', f);
      expect(s, `${f} must not assign rootViewController`).not.toMatch(
        /rootViewController\s*=\s*(?!nil)/,
      );
    }
  });
});

describe('Info.plist registers the deep-link scheme', () => {
  // Info.plist sits in App/App/, not App/ — read() is rooted at App/.
  const plist = read('App', 'Info.plist');

  it('declares CFBundleURLTypes', () => {
    // Without it, LaunchServices has no handler and the Live Activity's
    // widgetURL tap, notification taps and Siri deep links all do nothing —
    // silently, since the system simply finds no app for the scheme.
    expect(plist).toMatch(/<key>CFBundleURLTypes<\/key>/);
  });

  it('claims the auramind scheme that Android also registers', () => { // legacy-name: ok
    // Must stay in step with android/app/src/main/AndroidManifest.xml, which
    // declares scheme "auramind" host "app". A one-sided change breaks the // legacy-name: ok
    // deep link on exactly one platform.
    expect(plist).toMatch(/<string>auramind<\/string>/); // legacy-name: ok
  });

  it('also claims the bonamind scheme', () => {
    expect(plist).toMatch(/<string>bonamind<\/string>/);
  });

  it('keeps the permission strings voice study needs', () => {
    // BonaListenPlugin rejects with "not-allowed" without these, and iOS
    // terminates the app if a permission string is missing entirely rather
    // than showing the prompt.
    expect(plist).toMatch(/<key>NSMicrophoneUsageDescription<\/key>/);
    expect(plist).toMatch(/<key>NSSpeechRecognitionUsageDescription<\/key>/);
  });

  it('opts into Live Activities', () => {
    expect(plist).toMatch(/<key>NSSupportsLiveActivities<\/key>/);
  });
});

describe('Live Activity plugin holds no orphaned state', () => {
  const src = read('App', 'BonaLiveActivityPlugin.swift');

  it('adopts activities left behind by a previous process', () => {
    // `current` is in-memory, so it is empty after iOS relaunches the app.
    // Without adopting, an interrupted session leaves its activity on the
    // Lock Screen frozen at its last count until the user swipes it away.
    expect(src).toMatch(/Activity<StudySessionAttributes>\.activities/);
  });

  it('resolves update() on the main actor', () => {
    // activity.update is async, so a bare Task resumes off-main and delivers
    // the reply to the web view from the wrong queue.
    expect(src).toMatch(/Task\s*\{\s*@MainActor/);
  });
});

describe('CI can tell "plugin missing" from "the OS refused"', () => {
  it('records plugin registration under its own key', () => {
    const driver = read('..', '..', 'src', 'components', 'ios', 'IOSVisualPreview.tsx');
    // It used to be written to `device`, which is overwritten with the
    // hardware string two lines later — so the one signal that distinguishes a
    // build with no plugins from a declined ActivityKit was destroyed before CI
    // read it.
    expect(driver).toMatch(/plugins:\s*"bonamind_ci_live_plugins"/);
  });

  it('does not overwrite the plugin signal with device info', () => {
    const driver = read('..', '..', 'src', 'components', 'ios', 'IOSVisualPreview.tsx');
    const writes = driver.match(/recordLiveMilestone\(\s*CI_LIVE_KEYS\.(\w+)/g) ?? [];
    expect(writes.filter((w) => w.includes('plugins'))).toHaveLength(1);
    // `device` may be written, but never to the plugs string.
    expect(driver).not.toMatch(
      /recordLiveMilestone\(\s*CI_LIVE_KEYS\.device\s*,\s*(known|`plugs=)/,
    );
  });

  it('asserts LiveActivity:true in the workflow', () => {
    const workflow = read(
      '..',
      '..',
      '..',
      '.github',
      'workflows',
      'mobile-ios.yml',
    );
    expect(workflow).toMatch(/LiveActivity:true\*\)/);
    expect(workflow).toMatch(/bonamind_ci_live_plugins/);
  });

  it('exposes a registration check that is distinct from availability', () => {
    const lib = read('..', '..', 'src', 'lib', 'liveActivity.ts');
    expect(lib).toMatch(/export async function isLiveActivityPluginRegistered/);
    // It must not be an alias of the availability check, or it proves nothing.
    expect(lib).not.toMatch(
      /isLiveActivityPluginRegistered[\s\S]{0,200}?return isLiveActivityAvailable/,
    );
  });
});

describe('the deep-link scheme agrees with Android', () => {
  it('Android manifest declares the same scheme and host', () => {
    const manifest = readFileSync(
      path.resolve(__dirname, '../../android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toMatch(/android:scheme="auramind"/); // legacy-name: ok
    expect(manifest).toMatch(/android:scheme="bonamind"/);
    expect(manifest).toMatch(/android:host="app"/);
  });

  it('the Windows app registers both schemes', () => {
    const conf = JSON.parse(readFileSync(path.resolve(__dirname, '../../src-tauri/tauri.conf.json'), 'utf8'));
    expect(conf.plugins['deep-link'].desktop.schemes).toEqual(['bonamind', 'auramind']); // legacy-name: ok
  });
});
// The Xcode project file is maintained by hand (no Mac here), so a rename
// that misses a reference only shows up as a failed CI build. Catch it here.
describe('project.pbxproj', () => {
  const pbx = read('App.xcodeproj', 'project.pbxproj');

  it('points every source and plist reference at a file that exists', () => {
    const groups = [...pbx.matchAll(/\/\* (\w+) \*\/ = \{\s*isa = PBXGroup;[\s\S]*?path = (\w+);/g)];
    const groupPath = new Map(groups.map((m) => [m[1], m[2]]));
    const refs = [...pbx.matchAll(/\/\* ([\w.]+\.(?:swift|plist)) \*\/ = \{isa = PBXFileReference;[^}]*path = "?([^";]+)"?;/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, name, file] of refs) {
      const candidates = [path.join(APP, 'App', file), ...[...groupPath.values()].map((dir) => path.join(APP, dir, file))];
      expect(candidates.some((c) => existsSync(c)), `${name} → ${file}`).toBe(true);
    }
    // \s before the key so GENERATE_INFOPLIST_FILE = NO isn't read as a path.
    for (const m of pbx.matchAll(/\sINFOPLIST_FILE = ([^;]+);/g)) {
      expect(existsSync(path.join(APP, m[1].trim().replace(/"/g, ''))), m[1]).toBe(true);
    }
  });

  it('carries no pre-rename names', () => {
    expect(pbx).not.toMatch(/Aura/);
  });
});
