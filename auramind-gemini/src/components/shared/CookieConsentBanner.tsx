import { useState } from "react";
import {
  ANALYTICS_PREF_KEY,
  CONSENT_CHOICE_KEY,
  getConsentChoice,
  hasConsentChoice,
  recordConsentChoice,
} from "../../lib/consent";
import { getAppPreference } from "../../lib/appPreferences";
import { analyticsService } from "../../services/analytics/analyticsService";

export { CONSENT_CHOICE_KEY, ANALYTICS_PREF_KEY, hasConsentChoice, getConsentChoice };

/**
 * Non-blocking cookie-consent banner. Tracking must not start before consent
 * (analyticsService.init skips while no choice is stored), so this renders
 * exactly once per visitor — until they accept or decline. Either answer
 * persists through the same preference keys the Settings screens toggle, so
 * the choice stays changeable afterwards.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => {
    if (hasConsentChoice()) return false;
    // Explicit opt-out via Settings predates the banner: honor it silently
    // instead of asking again. (Writes the same value twice under
    // StrictMode's double-invoked initializer; the write is idempotent.)
    if (getAppPreference<boolean>(ANALYTICS_PREF_KEY, true) === false) {
      recordConsentChoice(false);
      return false;
    }
    return true;
  });
  if (!visible) return null;

  const choose = (accepted: boolean) => {
    recordConsentChoice(accepted);
    setVisible(false);
    // Boot-time init() early-returned while unasked; now that consent exists
    // it is safe to start analytics (idempotent via its `initialized` flag).
    if (accepted) void analyticsService.init();
  };

  return (
    <section
      role="region"
      aria-label="Cookie consent"
      className="cookie-consent-banner z-overlay fixed inset-x-3 bottom-3 sm:left-6 sm:right-auto sm:max-w-md rounded-2xl border p-4 shadow-2xl"
      style={{ background: "#111118", borderColor: "#2A2A3A", color: "#F0EFFE" }}
    >
      <p className="text-[13px] leading-relaxed">
        We use necessary cookies to keep you signed in. With your permission we
        also use anonymous usage analytics to help improve AuraMind. You can
        change this anytime in Settings.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => choose(false)}
          className="flex-1 rounded-xl border px-3 py-2 text-[13px] font-medium"
          style={{ borderColor: "#2A2A3A" }}
        >
          Accept only necessary
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{ background: "#7C3AED", color: "#fff" }}
        >
          Accept all
        </button>
      </div>
    </section>
  );
}

export default CookieConsentBanner;
