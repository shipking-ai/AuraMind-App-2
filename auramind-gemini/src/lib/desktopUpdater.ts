/**
 * Auto-updates for the Windows app.
 *
 * The updater plugin reads `latest.json` from the newest GitHub release
 * (endpoint and public key in src-tauri/tauri.conf.json) and only accepts an
 * installer signed with the matching private key. The Tauri packages are
 * imported lazily so none of this reaches the website's bundle.
 */
import type { Update } from '@tauri-apps/plugin-updater';
import { isDesktopApp } from './platform';

export type { Update as DesktopUpdate };

/** The newer release, or null when up to date or not in the Windows app. */
export async function checkForDesktopUpdate(): Promise<Update | null> {
  if (!isDesktopApp()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  return check();
}

/**
 * Download, verify and install, then restart into the new version. On
 * Windows the installer runs in passive mode and closes the app itself; the
 * relaunch covers the case where it doesn't.
 */
export async function installDesktopUpdate(
  update: Update,
  onProgress?: (fraction: number | null) => void,
): Promise<void> {
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      onProgress?.(total ? 0 : null);
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength;
      onProgress?.(total ? Math.min(received / total, 1) : null);
    } else if (event.event === 'Finished') {
      onProgress?.(1);
    }
  });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/** The installed app's version, or null outside the Windows app. */
export async function desktopAppVersion(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}
