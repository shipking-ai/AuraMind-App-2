import { useEffect } from "react";

import { isDesktopApp } from "../lib/platform";

/**
 * Re-run something when the Windows app's window regains focus.
 *
 * src-tauri/src/lib.rs sends checkout to the OS browser on purpose, which
 * leaves the app a *different window* from the one the purchase completes in.
 * The website gets a reload for free when its tab comes back; a Tauri window
 * does not, so without this a user who subscribes in the browser comes back to
 * a still-locked app until they restart it.
 *
 * The phone apps already have this via Capacitor's appStateChange, so this
 * only listens in the desktop shell.
 *
 * `wasBlurred` is what makes it a genuine return. A window fires `focus` when
 * it first loads, and reacting to that would put a redundant request on every
 * boot. The native path makes the same trade deliberately: see the comment
 * above the appStateChange effect in App.tsx.
 */
export function useWindowFocusRefresh(onFocus: () => void): void {
  useEffect(() => {
    if (!isDesktopApp()) return;
    let wasBlurred = false;
    const handleBlur = () => {
      wasBlurred = true;
    };
    const handleFocus = () => {
      if (!wasBlurred) return;
      wasBlurred = false;
      onFocus();
    };
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [onFocus]);
}
