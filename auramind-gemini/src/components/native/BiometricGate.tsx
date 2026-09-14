import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint } from "@/components/icons";
import { Capacitor } from "../../lib/nativeShim";
import { useAppPreference } from "../../lib/appPreferences";
import { useAppLifecycle, useBiometricAuth } from "../../hooks/useNative";
import { hapticSuccess, hapticWarning } from "./androidHaptics";

export const APP_LOCK_PREF_KEY = "auramind_app_lock";

/**
 * Biometric app-lock gate for the installed Android app.
 *
 * When the user enables "App lock" in Android settings, this overlay covers
 * the app on cold start and every time it returns from the background until
 * the system biometric sheet succeeds. Nothing behind it is interactive —
 * the overlay is a plain fullscreen view, not a route, so there is no URL
 * that skips it.
 *
 * Failure is deliberately boring: a cancel just re-locks, a lockout names
 * the wait, and a device with biometrics removed auto-disables the lock
 * instead of bricking the app behind a sheet that can never succeed.
 */
export function BiometricGate() {
  const [lockEnabled, setLockEnabled] = useAppPreference(APP_LOCK_PREF_KEY, false);
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useAppLifecycle();
  const { getAvailability, authenticate } = useBiometricAuth();
  const autoTried = useRef(false);

  const isNative = Capacitor.isNativePlatform();

  const unlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const availability = await getAvailability();
      if (!availability.isAvailable) {
        // Biometrics went away (fingerprints removed, hardware fault).
        // Disable the lock rather than sealing the app shut.
        setLockEnabled(false);
        setLocked(false);
        return;
      }
      const ok = await authenticate("Unlock AuraMind");
      if (ok) {
        hapticSuccess();
        setLocked(false);
      } else {
        hapticWarning();
        setError("Couldn't confirm it's you. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, getAvailability, authenticate, setLockEnabled]);

  // Relock whenever the app comes back from the background.
  useEffect(() => {
    if (lifecycle === "background" && lockEnabled) {
      autoTried.current = false;
      setLocked(true);
      setError(null);
    }
  }, [lifecycle, lockEnabled]);

  // One automatic attempt per lock: most unlocks should need zero taps.
  useEffect(() => {
    if (isNative && lockEnabled && locked && !autoTried.current) {
      autoTried.current = true;
      void unlock();
    }
  }, [isNative, lockEnabled, locked, unlock]);

  if (!isNative || !lockEnabled || !locked) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-6 bg-[#0A0A0F] p-8 text-center"
      role="alertdialog"
      aria-modal="true"
      aria-label="Unlock AuraMind"
    >
      <span className="grid h-20 w-20 place-items-center rounded-[24px] bg-[#6750A4]/20">
        <Fingerprint className="h-9 w-9 text-[#C4B5FD]" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">AuraMind is locked</h2>
        <p className="text-sm text-white/60">
          {busy ? "Waiting for your fingerprint…" : "Confirm it's you to continue studying."}
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void unlock()}
        disabled={busy}
        className="rounded-full bg-[#6750A4] px-8 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </div>
  );
}

export default BiometricGate;
