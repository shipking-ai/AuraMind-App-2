import React, { useEffect, useState } from 'react';
import { isDesktopApp } from '../../lib/platform';
import {
  checkForDesktopUpdate,
  installDesktopUpdate,
  type DesktopUpdate,
} from '../../lib/desktopUpdater';

/** First check waits for startup to settle; later ones run in the background. */
export const FIRST_CHECK_DELAY_MS = 15_000;
export const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Windows app only: tells the user when a new version is ready and installs
 * it on their say-so. Never interrupts: the check is silent, a failed check
 * shows nothing, and "Later" hides the prompt until the next launch.
 */
export function DesktopUpdateBanner() {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let cancelled = false;
    const run = async () => {
      try {
        const found = await checkForDesktopUpdate();
        if (!cancelled && found) setUpdate(found);
      } catch (err) {
        // Offline, or no release published yet: try again next interval.
        console.warn('[updater] check failed', err);
      }
    };
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    const every = setInterval(run, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  if (!update || dismissed) return null;

  const install = async () => {
    setFailed(false);
    setInstalling(true);
    try {
      await installDesktopUpdate(update, setProgress);
    } catch (err) {
      console.warn('[updater] install failed', err);
      setInstalling(false);
      setFailed(true);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-violet-400/30 bg-[#161B2E] p-4 shadow-2xl"
    >
      <p className="text-sm font-semibold text-white">BonaMind {update.version} is ready</p>
      <p className="mt-1 text-xs text-zinc-400">
        {installing
          ? progress === null
            ? 'Downloading…'
            : `Downloading… ${Math.round(progress * 100)}%`
          : failed
            ? "The update didn't install. Check your connection and try again."
            : 'Restart BonaMind to finish updating. It takes a few seconds.'}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="flex-1 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
        >
          {installing ? 'Updating…' : failed ? 'Try again' : 'Restart and update'}
        </button>
        {!installing && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
