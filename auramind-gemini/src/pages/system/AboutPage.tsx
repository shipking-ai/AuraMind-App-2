import React, { useCallback, useState } from 'react';
import {
  PRODUCT_NAME,
  LEGAL_COPYRIGHT_LINE,
  CONTACT_EMAIL,
  VENDOR_URL,
} from '../../lib/branding';
import { isDesktopApp } from '../../lib/platform';
import {
  checkForDesktopUpdate,
  desktopAppVersion,
  installDesktopUpdate,
  type DesktopUpdate,
} from '../../lib/desktopUpdater';

/**
 * AboutPage — the canonical "About BonaMind" panel.
 *
 * Lives at /about. Visible from:
 *   - the sidebar Settings row's "About BonaMind" entry;
 *   - mobile Settings → scroll-to-bottom → "About" link.
 *
 * Shows: product line, version/channel, update check, copyright + contact.
 * build version, build channel, copyright, contact mailto, vendor URL,
 * and a "Check for updates" button: a real update check in the Windows app,
 * and a note that the website is always current everywhere else.
 *
 * The page is intentionally read-only. It never opens external links
 * without a confirm.
 */

interface AboutPageProps {
  /** Override app version when running in tests (e.g. "2.0.0-test"). */
  versionOverride?: string;
}

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'uptodate'; currentVersion: string; latestVersion: string; releaseNotes?: string }
  | { status: 'available'; currentVersion: string; latestVersion: string; releaseNotes?: string }
  | { status: 'error'; message: string }
  | { status: 'web' };

const AboutPage: React.FC<AboutPageProps> = ({ versionOverride }) => {
  const version = versionOverride ?? '2.0.0';
  const channel = 'production';
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' });

  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [installing, setInstalling] = useState(false);

  const runCheck = useCallback(async () => {
    // The website is always the latest release; only the Windows app has
    // anything to update.
    if (!isDesktopApp()) {
      setCheckState({ status: 'web' });
      return;
    }
    setCheckState({ status: 'checking' });
    try {
      const [found, current] = await Promise.all([checkForDesktopUpdate(), desktopAppVersion()]);
      const currentVersion = current ?? version;
      setUpdate(found);
      setCheckState(found
        ? { status: 'available', currentVersion, latestVersion: found.version, releaseNotes: found.body }
        : { status: 'uptodate', currentVersion, latestVersion: currentVersion });
    } catch {
      setCheckState({ status: 'error', message: "Couldn't reach the update server. Check your connection and try again." });
    }
  }, [version]);

  const runInstall = useCallback(async () => {
    if (!update) return;
    setInstalling(true);
    try {
      await installDesktopUpdate(update);
    } catch {
      setInstalling(false);
      setCheckState({ status: 'error', message: "The update didn't install. Try again in a moment." });
    }
  }, [update]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white antialiased px-6 py-12 sm:py-20">
      <div className="max-w-3xl mx-auto">
          {/* Top-brand mark row */}
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{PRODUCT_NAME}</h1>
              <p className="text-[12px] uppercase tracking-[0.18em] text-violet-300/80 mt-1">
                v{version} · {channel}
              </p>
            </div>
          </div>

          <hr className="border-[#2A2A3A] my-8" />

          {/*
            The parent-company block that used to sit here — the CogniVect
            legal name, its "cognitive · vector" tagline, the "first product in
            the family" roadmap line and the cogniavect.app link — is gone.
            CogniVect, Inc. is being dissolved, so "a flagship platform from
            CogniVect, Inc" is not a true statement. Product facts only.
          */}
        {/* Update check */}
        <section className="bg-[#101018] border border-[#2A2A3A] rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-white">Updates</h2>
              <p className="text-[12px] text-[#7A7A93] mt-1">
                The Windows app updates itself; the website is always the latest version.
              </p>

              {checkState.status === 'checking' && (
                <p className="text-[13px] text-violet-300 mt-3 animate-pulse">
                  Checking for updates…
                </p>
              )}
              {checkState.status === 'web' && (
                <p className="text-[13px] text-emerald-300 mt-3">
                  You&apos;re using the web app, which is always up to date.
                </p>
              )}
              {checkState.status === 'uptodate' && (
                <p className="text-[13px] text-emerald-300 mt-3">
                  You are on the latest release ({checkState.currentVersion}).
                </p>
              )}
              {checkState.status === 'available' && (
                <div className="mt-3 space-y-2">
                  <p className="text-[13px] text-amber-300">
                    Update available: v{checkState.latestVersion} (you have v{checkState.currentVersion}).
                  </p>
                  {checkState.releaseNotes && (
                    <pre className="text-[11px] text-[#9090A8] whitespace-pre-wrap font-mono bg-[#09090b] border border-[#2A2A3A] rounded-md p-3 max-h-48 overflow-auto">
                      {checkState.releaseNotes}
                    </pre>
                  )}
                  <button
                    type="button"
                    onClick={runInstall}
                    disabled={installing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white hover:bg-violet-400 transition disabled:opacity-60 disabled:cursor-wait text-[13px] font-medium"
                  >
                    {installing ? 'Updating…' : 'Restart and update'}
                  </button>
                </div>
              )}
              {checkState.status === 'error' && (
                <p className="text-[13px] text-rose-300 mt-3">{checkState.message}</p>
              )}
              {checkState.status === 'idle' && (
                <p className="text-[12px] text-[#7A7A96] mt-3">
                  Use the button on the right to check.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={runCheck}
              disabled={checkState.status === 'checking'}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-400/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:border-violet-300/80 transition disabled:opacity-50 disabled:cursor-wait text-[13px] font-medium"
            >
              {checkState.status === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
        </section>

        <hr className="border-[#2A2A3A] my-8" />

        {/* Footer copy */}
        <section className="text-[12px] text-[#7A7A93] space-y-2">
          <div className="flex items-center gap-2">
            <span>{LEGAL_COPYRIGHT_LINE}</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-violet-300 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            <span className="text-[#3A3A4F]">·</span>
            <a
              href={VENDOR_URL}
              className="hover:text-violet-300 underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {VENDOR_URL}
            </a>
          </div>
          {/*
            TRADEMARK_STATEMENT was removed here rather than reworded. It read
            "BonaMind is a trademark of CogniVect, Inc" — asserting a
            registered mark against a company being dissolved. Whether BonaMind
            has a mark, and who owns it, is a legal fact; see the FROZEN block
            in lib/branding.ts.
          */}
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
