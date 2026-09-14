import { toast } from "sonner";
import { Capacitor } from "./nativeShim";
import { getAppPreference, setAppPreference } from "./appPreferences";

/**
 * Play in-app review + flexible update, with JS-side politeness gates.
 *
 * Google applies its own quotas (the review sheet may simply not show), but
 * "Play might say no" is not a prompt strategy. So this module asks at most
 * once per 90 days, only after the app has been opened 10+ times — i.e. by
 * someone with an opinion — and never on web, where the plugin does not
 * exist and every call would be a rejection.
 */

function plugin(): any {
  return (Capacitor as unknown as { Plugins?: Record<string, any> })?.Plugins?.PlayEngagement;
}

const OPENS_KEY = "auramind_app_opens";
const LAST_REVIEW_KEY = "auramind_last_review_prompt";
const LAST_UPDATE_CHECK_KEY = "auramind_last_update_check";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function recordAppOpen(): void {
  try {
    const opens = getAppPreference<number>(OPENS_KEY, 0);
    setAppPreference(OPENS_KEY, opens + 1);
  } catch {
    // Telemetry must never break launch.
  }
}

/** Ask for a Play review when the user has earned an opinion. Never prompts. */
export async function maybePromptReview(): Promise<"shown" | "skipped" | "unavailable"> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  const native = plugin();
  if (!native?.promptReview) return "unavailable";

  const opens = getAppPreference<number>(OPENS_KEY, 0);
  const last = getAppPreference<number>(LAST_REVIEW_KEY, 0);
  if (opens < 10 || Date.now() - last < NINETY_DAYS_MS) return "skipped";

  try {
    await native.promptReview();
    setAppPreference(LAST_REVIEW_KEY, Date.now());
    return "shown";
  } catch {
    return "skipped";
  }
}

export interface UpdateStatus {
  available: boolean;
  flexibleAllowed: boolean;
  immediateAllowed: boolean;
  versionCode: number;
}

/** Check once a day; start a flexible download when Play offers one. */
export async function maybeStartUpdate(): Promise<UpdateStatus | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const native = plugin();
  if (!native?.checkUpdate) return null;

  const last = getAppPreference<number>(LAST_UPDATE_CHECK_KEY, 0);
  if (Date.now() - last < ONE_DAY_MS) return null;

  try {
    const status = (await native.checkUpdate()) as UpdateStatus;
    setAppPreference(LAST_UPDATE_CHECK_KEY, Date.now());
    if (status.available && status.flexibleAllowed) {
      await native.startFlexibleUpdate().catch(() => undefined);
    }
    return status;
  } catch {
    return null;
  }
}

/**
 * Wire once at startup: record the open, lazily prompt for review/update,
 * and toast a restart affordance when a flexible download lands.
 *
 * The review/update prompts are delayed past launch on purpose — firing them
 * during the splash/auth window would stack system sheets on top of the boot
 * screen.
 */
export function initPlayEngagement(): void {
  if (!Capacitor.isNativePlatform()) return;
  recordAppOpen();

  const native = plugin();
  if (native?.addListener) {
    try {
      native.addListener("onUpdateDownloaded", () => {
        toast("Update downloaded", {
          description: "Restart AuraMind to apply it.",
          action: {
            label: "Restart",
            onClick: () => {
              void native.completeUpdate?.().catch(() => undefined);
            },
          },
          duration: 15000,
        });
      });
    } catch {
      // Optional listener; never break startup.
    }
  }

  window.setTimeout(() => {
    void maybePromptReview();
    void maybeStartUpdate();
  }, 20000);
}
