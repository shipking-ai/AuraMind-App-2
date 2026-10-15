#!/usr/bin/env node
/**
 * Captures the Play Store phone screenshots from the real Android app on an
 * emulator, rather than from web pages or static mockups.
 *
 * The signed-in screens come from the Android visual harness
 * (/__e2e/android?screen=…), which renders the real shell with sample decks.
 * The harness exists only in a development build, so:
 *
 *   1. Start an emulator (any phone AVD).
 *   2. NODE_ENV=development npx vite build --mode mobile && npx cap copy android
 *   3. cd android && ./gradlew assembleDebug, then install
 *      app/build/outputs/apk/debug/app-debug.apk and open the app once.
 *   4. node scripts/capture-android-screenshots.mjs
 *
 * The device is set to 1080x1920 (Play allows at most 2:1) and to demo mode
 * (9:41, full battery, notifications snoozed for ten minutes) while
 * capturing, then restored.
 * Never ship the development build; rebuild with `npm run build:android`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '..', 'store', 'graphics', 'android', 'screenshots');
const ADB = process.env.ADB || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const PKG = process.env.APP_PACKAGE || 'com.auramind.app.debug';
const PORT = 9333;

const SHOTS = [
  // The logged-out welcome screen is a two-second splash that moves on by
  // itself, so it isn't captured.
  { name: '01-home.png', path: '/__e2e/android?screen=home' },
  { name: '02-study.png', path: '/__e2e/android?screen=study' },
  { name: '03-create.png', path: '/__e2e/android?screen=generator' },
  { name: '04-library.png', path: '/__e2e/android?screen=library' },
  { name: '05-settings.png', path: '/__e2e/android?screen=settings' },
];

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' }).trim();
const adbBytes = (...args) => execFileSync(ADB, args, { maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function demoMode(on) {
  if (!on) {
    adb('shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'exit');
    return;
  }
  adb('shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1');
  const send = (...extra) => adb('shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', ...extra);
  send('-e', 'command', 'enter');
  send('-e', 'command', 'clock', '-e', 'hhmm', '0941');
  send('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false');
  send('-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4');
  send('-e', 'command', 'notifications', '-e', 'visible', 'false');
  // Demo mode doesn't hide every icon (Play services keeps some), so snooze
  // whatever is showing for the length of the capture.
  for (const key of adb('shell', 'cmd', 'notification', 'list').split(/\r?\n/).filter(Boolean)) {
    adb('shell', 'cmd', 'notification', 'snooze', '--for', '600000', `'${key}'`);
  }
}

async function pageSocket() {
  const pid = adb('shell', 'pidof', PKG);
  if (!pid) throw new Error(`${PKG} is not running: open the app on the emulator first.`);
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No WebView page found. Is this a debug build?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    ws.onopen = resolveOpen;
    ws.onerror = reject;
  });
  let id = 0;
  return {
    evaluate: (expression) =>
      new Promise((resolveEval) => {
        const msgId = ++id;
        const onMessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id !== msgId) return;
          ws.removeEventListener('message', onMessage);
          resolveEval(msg.result);
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression } }));
      }),
    close: () => ws.close(),
  };
}

mkdirSync(OUT, { recursive: true });
const originalSize = adb('shell', 'wm', 'size').match(/Override size: (\S+)/)?.[1];
adb('shell', 'wm', 'size', '1080x1920');
demoMode(true);
try {
  for (const shot of SHOTS) {
    // Each navigation reloads the WebView, so reconnect for every shot.
    const page = await pageSocket();
    await page.evaluate(`location.assign(${JSON.stringify(shot.path)})`);
    page.close();
    await sleep(5000);
    writeFileSync(join(OUT, shot.name), adbBytes('exec-out', 'screencap', '-p'));
    console.log(`✓ ${shot.name}`);
  }
} finally {
  demoMode(false);
  adb('shell', 'wm', 'size', originalSize ?? 'reset');
  adb('forward', '--remove', `tcp:${PORT}`);
}
