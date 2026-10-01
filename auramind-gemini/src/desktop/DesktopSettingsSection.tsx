/**
 * Settings → Windows app: the Quick Review shortcut, Start with Windows, and
 * whether Windows is letting reminders through. Renders nothing elsewhere.
 */
import React, { useEffect, useState } from 'react';
import { Monitor } from '@/components/icons';
import { desktop } from './bridge';
import { isDesktopApp } from '../lib/platform';
import { useAppPreference } from '../lib/appPreferences';
import { acceleratorFromEvent, displayAccelerator } from './accelerator';
import { DEFAULT_QUICK_REVIEW_SHORTCUT, QUICK_REVIEW_SHORTCUT_PREF } from './useDesktopIntegration';

const SHORTCUT_ERRORS = {
  taken: 'Another app already uses that shortcut. Try a different one.',
  invalid: "That shortcut can't be used. Include Ctrl or Alt.",
} as const;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[#7A7A96]">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function DesktopSettingsSection() {
  const [shortcut, setShortcut] = useAppPreference(QUICK_REVIEW_SHORTCUT_PREF, DEFAULT_QUICK_REVIEW_SHORTCUT);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState(false);
  const [notifications, setNotifications] = useState<boolean | null>(null);
  const active = isDesktopApp();

  useEffect(() => {
    if (!active) return;
    void desktop.getAutostart().then(setAutostartState);
    void desktop.notificationsEnabled().then(setNotifications);
  }, [active]);

  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRecording(false); return; }
      const acc = acceleratorFromEvent(e);
      if (!acc) return;
      e.preventDefault();
      setRecording(false);
      const result = await desktop.setShortcut(acc);
      if (result.ok) { setShortcut(acc); setShortcutError(null); }
      else setShortcutError(SHORTCUT_ERRORS[result.reason === 'taken' ? 'taken' : 'invalid']);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, setShortcut]);

  if (!active) return null;

  const toggleAutostart = async () => setAutostartState(await desktop.setAutostart(!autostart));
  const button = 'rounded-lg border border-[#2A2A3A] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06]';

  return (
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
      <div className="mb-2 flex items-center gap-3">
        <Monitor className="h-5 w-5 text-violet-300" aria-hidden />
        <div>
          <h3 className="text-base font-semibold text-white">Windows app</h3>
          <p className="text-xs text-[#7A7A96]">Quick Review, reminders and startup on this PC.</p>
        </div>
      </div>

      <Row label="Quick Review shortcut" hint={shortcutError ?? 'Opens a few due cards from anywhere in Windows.'}>
        <kbd className="rounded-md border border-[#2A2A3A] bg-black/30 px-2 py-1 text-xs text-zinc-200">
          {recording ? 'Press keys…' : displayAccelerator(shortcut)}
        </kbd>
        <button type="button" className={button} onClick={() => { setShortcutError(null); setRecording(true); }}>Change</button>
        {shortcut !== DEFAULT_QUICK_REVIEW_SHORTCUT && (
          <button type="button" className={button} onClick={async () => { await desktop.setShortcut(DEFAULT_QUICK_REVIEW_SHORTCUT); setShortcut(DEFAULT_QUICK_REVIEW_SHORTCUT); }}>Reset</button>
        )}
      </Row>
      <div className="border-t border-[#2A2A3A]/30" />

      <Row label="Start with Windows" hint="Starts quietly in the tray so reminders arrive on time.">
        <button
          type="button"
          role="switch"
          aria-checked={autostart}
          aria-label="Start with Windows"
          onClick={() => void toggleAutostart()}
          className={`relative h-6 w-11 rounded-full transition-colors ${autostart ? 'bg-violet-500' : 'bg-[#2A2A3A]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autostart ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </Row>

      {notifications === false && (
        <>
          <div className="border-t border-[#2A2A3A]/30" />
          <Row label="Notifications are turned off in Windows" hint="Study reminders can't appear until you turn them on for AuraMind.">
            <button type="button" className={button} onClick={() => window.open('ms-settings:notifications', '_blank')}>
              Open Windows settings
            </button>
          </Row>
        </>
      )}
    </div>
  );
}
