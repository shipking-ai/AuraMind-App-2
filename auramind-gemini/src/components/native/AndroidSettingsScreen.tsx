import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from "@/components/icons";
import { toast } from "sonner";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { useBiometricAuth } from "../../hooks/useNative";
import { APP_LOCK_PREF_KEY } from "./BiometricGate";
import { disablePush, enablePush } from "../../services/notifications/pushService";
import { useAppPreference } from "../../lib/appPreferences";
import { hapticSelection, hapticSuccess, hapticTap, hapticWarning } from "./androidHaptics";
import { userService } from "../../services/user/userService";
import { analyticsService } from "../../services/analytics/analyticsService";
import { useReminderSync } from "../../hooks/useReminderSync";
import { useVoiceOptions } from "../../hooks/useVoiceOptions";
import { AuraSpeech } from "../../lib/auraSpeech";
import { SPOKEN_REMINDER_MESSAGES, type SpokenReminderMode } from "../../lib/reminderSchedule";
import {
  resetRandomVoice,
  speak,
  VOICE_PREF_KEY,
  VOICE_RANDOM,
  DEFAULT_VOICE,
} from "../../services/voice/speechOutput";
import { deleteAvatar, uploadAvatar } from "../../services/user/avatarService";
import ProfAuraAvatar from "../auramind/ProfAuraAvatar";
import { DeleteAccountModal } from "../settings/DeleteAccountModal";
import type { UserProfile } from "../../types";

type StoredValue<T> = [T, (value: T | ((previous: T) => T)) => void];

function useStoredValue<T>(key: string, initial: T): StoredValue<T> {
  return useAppPreference(key, initial);
}

function AndroidSettingsSection({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="android-settings-section">
      <div className="android-settings-section-heading">
        <span className="android-settings-section-icon">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
      </div>
      <div className="android-settings-section-body">{children}</div>
    </section>
  );
}

function AndroidSettingRow({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="android-settings-row">
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
      {children}
    </div>
  );
}

function AndroidToggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`android-settings-toggle ${value ? "is-on" : ""}`}
      onClick={() => {
        hapticSelection();
        onChange(!value);
      }}
    >
      <span />
    </button>
  );
}

function AndroidSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  label: string;
}) {
  return (
    <select
      className="android-settings-select"
      value={value}
      onChange={(event) => {
        hapticSelection();
        onChange(event.target.value);
      }}
      aria-label={label}
    >
      {options.map((option) =>
        typeof option === "string" ? (
          <option key={option}>{option}</option>
        ) : (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ),
      )}
    </select>
  );
}

/**
 * Mask the local part of an email, keeping the domain.
 *
 * The settings screen shows the signed-in address permanently, which means
 * it is on screen in every screenshot, screen share and over-the-shoulder
 * glance. The domain is rarely the identifying part; the local part is. So
 * the local part is masked by default and the whole address is one tap away
 * for anyone who genuinely needs to check which account they are in.
 *
 * Short local parts (1-2 chars) are masked entirely rather than leaving the
 * whole thing legible.
 */
function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return "•".repeat(Math.max(local.length, 3)) + domain;
  return local.slice(0, 2) + "•".repeat(Math.max(local.length - 2, 3)) + domain;
}

export default function AndroidSettingsScreen() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  // Masked by default and never persisted: revealing is a per-visit decision,
  // so leaving the screen re-hides the address.
  const [emailRevealed, setEmailRevealed] = useState(false);
  const [name, setName] = useState(workspace?.user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [dailyGoal, setDailyGoal] = useStoredValue("auramind_dailyGoal", "20");
  const [newCards, setNewCards] = useStoredValue("auramind_newCards", "10");
  const [maxReviews, setMaxReviews] = useStoredValue("auramind_maxReviews", "100");
  const [retention, setRetention] = useStoredValue("auramind_retention", "Balanced - 85%");
  const [cardsPerGeneration, setCardsPerGeneration] = useStoredValue("auramind_cardsPerGen", "20");
  const [includeExamples, setIncludeExamples] = useStoredValue("auramind_includeExamples", true);
  const [defaultLanguage, setDefaultLanguage] = useStoredValue(
    "auramind_defaultLanguage",
    "English",
  );
  const [reviewOrder, setReviewOrder] = useStoredValue("auramind_reviewOrder", "FSRS - Optimized");
  const [dailyReminder, setDailyReminder] = useStoredValue("auramind_dailyReminder", true);
  const [reminderTime, setReminderTime] = useStoredValue("auramind_reminderTime", "09:00");
  const [dueReminder, setDueReminder] = useStoredValue("auramind_dueReminder", true);
  const [pushReminders, setPushReminders] = useStoredValue("auramind_pushReminders", false);

  /**
   * Server-sent push. Enabling probes Firebase for real: without
   * google-services.json the registration never resolves and the toggle
   * fails closed with an explanation instead of a stuck "on". The day
   * credentials land, this exact path starts working — nothing else changes.
   */
  const togglePush = async (next: boolean) => {
    if (!next) {
      setPushReminders(false);
      await disablePush(userId ?? "");
      return;
    }
    if (!userId) {
      toast.error("Sign in to enable push reminders");
      return;
    }
    const ok = await enablePush(userId);
    if (ok) {
      hapticSuccess();
      setPushReminders(true);
      toast.success("Push reminders on");
    } else {
      hapticWarning();
      toast.error("Push isn't available on this build yet");
    }
  };
  const [streakReminder, setStreakReminder] = useStoredValue("auramind_streakReminder", true);
  const [weeklySummary, setWeeklySummary] = useStoredValue("auramind_weeklySummary", false);
  const [soundEffects, setSoundEffects] = useStoredValue("auramind_soundEffects", true);
  const [textToSpeech, setTextToSpeech] = useStoredValue("auramind_textToSpeech", false);
  const [ttsVoice, setTtsVoice] = useStoredValue<string>(VOICE_PREF_KEY, DEFAULT_VOICE);
  const voiceOptions = useVoiceOptions(ttsVoice);
  const [spokenReminder, setSpokenReminder] = useStoredValue<SpokenReminderMode>(
    "auramind_spokenReminder",
    "off",
  );
  const [spokenReminderMessage, setSpokenReminderMessage] = useStoredValue<string>(
    "auramind_spokenReminderMessage",
    SPOKEN_REMINDER_MESSAGES[0],
  );

  const chooseVoice = (next: string) => {
    // A fresh pick every time Random is chosen, so "Test voice" shows it off.
    if (next === VOICE_RANDOM) resetRandomVoice();
    setTtsVoice(next);
  };

  const testVoice = async () => {
    hapticTap();
    const { interrupted } = await speak(
      "Hi, I'm Prof. Aura. This is the voice I'll read your cards in.",
      { voice: ttsVoice },
    );
    if (interrupted) toast.error("Couldn't play the voice. Check your media volume.");
  };

  const testSpokenReminder = async () => {
    hapticTap();
    const message =
      spokenReminder === "chosen"
        ? spokenReminderMessage
        : SPOKEN_REMINDER_MESSAGES[Math.floor(Math.random() * SPOKEN_REMINDER_MESSAGES.length)];
    try {
      await AuraSpeech.previewSpokenReminder({ message, voice: ttsVoice, lang: "en-US" });
    } catch {
      toast.error("Couldn't play the reminder. Check your notification volume.");
    }
  };
  const [autoPlayAudio, setAutoPlayAudio] = useStoredValue("auramind_autoPlayAudio", false);
  const [reduceMotion, setReduceMotion] = useStoredValue("auramind_reduceMotion", false);
  const [highContrast, setHighContrast] = useStoredValue("auramind_highContrast", false);
  const [compactMode, setCompactMode] = useStoredValue("auramind_compactMode", false);
  const [autoNightMode, setAutoNightMode] = useStoredValue("auramind_autoNightMode", true);
  const [showHintFirst, setShowHintFirst] = useStoredValue("auramind_showHintFirst", false);
  const [showIntervals, setShowIntervals] = useStoredValue("auramind_showIntervals", true);
  const [keyboardShortcuts, setKeyboardShortcuts] = useStoredValue(
    "auramind_keyboardShortcuts",
    true,
  );
  const [fontSize, setFontSize] = useStoredValue("auramind_fontSize", "Medium");
  const [theme, setTheme] = useStoredValue("auramind_theme", "dark");
  const [autoSync, setAutoSync] = useStoredValue("auramind_autoSync", true);
  const [offlineMode, setOfflineMode] = useStoredValue("auramind_offlineMode", false);
  const [usageAnalytics, setUsageAnalytics] = useStoredValue("auramind_usageAnalytics", true);
  const [saveChatHistory, setSaveChatHistory] = useStoredValue("auramind_saveChatHistory", true);
  const [appLock, setAppLock] = useStoredValue(APP_LOCK_PREF_KEY, false);
  const [biometricDetail, setBiometricDetail] = useState<string | null>(null);
  const { getAvailability, authenticate } = useBiometricAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Resolve the biometric detail line once: "Fingerprint" when ready,
  // "Add a fingerprint in system Settings" when not enrolled, and nothing
  // on web (this screen is Android-only, so a null detail hides the row).
  useEffect(() => {
    let cancelled = false;
    void getAvailability().then((availability) => {
      if (cancelled) return;
      if (availability.isAvailable) {
        const kind =
          availability.biometryType === "face"
            ? "Face unlock"
            : availability.biometryType === "iris"
              ? "Iris unlock"
              : availability.biometryType === "multiple"
                ? "Biometrics"
                : "Fingerprint";
        setBiometricDetail(`${kind} required to open AuraMind`);
      } else if (availability.reason === "not_enrolled") {
        setBiometricDetail("Add a fingerprint or face in system Settings first");
      } else {
        setBiometricDetail(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getAvailability]);

  /** Enabling proves the sheet works first — a lock nobody can pass is a brick. */
  const toggleAppLock = async (next: boolean) => {
    if (!next) {
      setAppLock(false);
      return;
    }
    const ok = await authenticate("Confirm biometrics to enable App lock");
    if (ok) {
      hapticSuccess();
      setAppLock(true);
      toast.success("App lock enabled");
    } else {
      hapticWarning();
      toast.error("Biometric check failed — App lock stayed off");
    }
  };

  const displayName = workspace?.user.name || profile?.name || "Learner";

  useEffect(() => {
    if (userId === undefined || !userId) return;
    let cancelled = false;
    void userService
      .getCurrentUser()
      .then((next) => {
        if (cancelled || !next) return;
        setProfile(next);
        setName(next.name || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 'request' rather than 'maintain': changing a reminder here is an explicit
  // user action, so this is the one place allowed to raise the permission
  // dialog. App start uses 'maintain' and never prompts. The scheduling
  // itself is shared, so the two cannot drift apart.
  useReminderSync("request");

  useEffect(() => {
    if (usageAnalytics) void analyticsService.init();
  }, [usageAnalytics]);

  const saveName = async () => {
    const nextName = name.trim();
    if (!nextName || nextName === displayName) {
      setName(displayName);
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await workspace?.updateProfile({ name: nextName });
      setProfile((previous) => (previous ? { ...previous, name: nextName } : previous));
      setEditingName(false);
      hapticSuccess();
      toast.success("Name updated");
    } catch {
      setProfileError("Could not save your name. Try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatar = async (file: File) => {
    if (!userId) return;
    setAvatarBusy(true);
    setProfileError(null);
    try {
      const result = await uploadAvatar(file, userId);
      if (!result.ok || !("url" in result)) throw new Error("Avatar upload failed.");
      await workspace?.updateProfile({ avatar: result.url });
      setProfile((previous) => (previous ? { ...previous, avatar: result.url } : previous));
      hapticSuccess();
      toast.success("Avatar updated");
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not update your avatar.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!userId) return;
    setAvatarBusy(true);
    try {
      await deleteAvatar(userId);
      await workspace?.updateProfile({ avatar: undefined });
      setProfile((previous) => (previous ? { ...previous, avatar: undefined } : previous));
      toast.success("Avatar removed");
    } catch {
      setProfileError("Could not remove your avatar.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const exportData = () => {
    const values = Object.keys(localStorage)
      .filter((key) => key.startsWith("auramind_"))
      .reduce<Record<string, string | null>>(
        (all, key) => ({ ...all, [key]: localStorage.getItem(key) }),
        {},
      );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(values, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `auramind-settings-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    hapticSuccess();
    toast.success("Settings exported");
  };

  const clearLocalData = () => {
    const preferenceKeys = new Set([
      "auramind_dailyGoal",
      "auramind_newCards",
      "auramind_maxReviews",
      "auramind_cardsPerGen",
      "auramind_includeExamples",
      "auramind_defaultLanguage",
      "auramind_retention",
      "auramind_reviewOrder",
      "auramind_dailyReminder",
      "auramind_reminderTime",
      "auramind_dueReminder",
      "auramind_streakReminder",
      "auramind_weeklySummary",
      "auramind_soundEffects",
      "auramind_textToSpeech",
      VOICE_PREF_KEY,
      "auramind_spokenReminder",
      "auramind_spokenReminderMessage",
      "auramind_autoPlayAudio",
      "auramind_reduceMotion",
      "auramind_highContrast",
      "auramind_compactMode",
      "auramind_autoNightMode",
      "auramind_showHintFirst",
      "auramind_showIntervals",
      "auramind_keyboardShortcuts",
      "auramind_fontSize",
      "auramind_theme",
      "auramind_autoSync",
      "auramind_offlineMode",
      "auramind_usageAnalytics",
      "auramind_saveChatHistory",
    ]);
    Object.keys(localStorage)
      .filter((key) => key.startsWith("auramind_") && !preferenceKeys.has(key))
      .forEach((key) => localStorage.removeItem(key));
    hapticSuccess();
    toast.success("Local cache cleared");
  };

  const signOut = () => {
    workspace?.onLogout();
    navigate("/auth");
  };

  const handleDeleted = () => {
    workspace?.onLogout();
    navigate("/");
  };

  return (
    <div className="android-native-settings" data-testid="android-settings-screen">
      <div className="android-native-screen-heading">
        <div>
          <p className="android-eyebrow">YOUR DEVICE</p>
          <h1>Settings</h1>
          <p>Make AuraMind fit the way you learn on Android.</p>
        </div>
      </div>

      <section className="android-native-profile-card">
        <div className="android-native-profile-avatar">
          {profile?.avatar || workspace?.user.avatar ? (
            <img src={profile?.avatar || workspace?.user.avatar} alt="" />
          ) : (
            <ProfAuraAvatar
              size={62}
              halo
              variant="badge"
              initial={displayName.slice(0, 2).toUpperCase()}
            />
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            aria-label="Change avatar"
          >
            <Upload className="h-4 w-4" aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleAvatar(file);
              event.target.value = "";
            }}
          />
        </div>
        <div className="android-native-profile-copy">
          {editingName ? (
            <div className="android-native-name-edit">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                aria-label="Your name"
              />
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={savingName}
                aria-label="Save name"
              >
                <Check className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(displayName);
                  setEditingName(false);
                }}
                aria-label="Cancel name edit"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="android-native-name-button"
              onClick={() => {
                setName(displayName);
                setEditingName(true);
              }}
            >
              {displayName}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}
          {(() => {
            const address = profile?.email || workspace?.user.email;
            if (!address) return <span>Signed-in learner</span>;
            return (
              <button
                type="button"
                className="android-native-email"
                onClick={() => {
                  setEmailRevealed((v) => !v);
                  hapticSelection();
                }}
                aria-label={emailRevealed ? "Hide email address" : "Show email address"}
                title={emailRevealed ? "Tap to hide" : "Tap to reveal"}
              >
                {emailRevealed ? address : maskEmail(address)}
              </button>
            );
          })()}
          <small>
            {profile?.plan || workspace?.user.plan || "Starter"} plan ·{" "}
            {workspace?.user.streak ?? 0} day streak
          </small>
          {profileError && (
            <p className="android-native-error" role="alert">
              {profileError}
            </p>
          )}
        </div>
      </section>

      <AndroidSettingsSection
        icon={BookOpen}
        title="Study rhythm"
        detail="Control how much you review each day."
      >
        <AndroidSettingRow label="Daily goal" detail="Cards to review">
          <AndroidSelect
            label="Daily goal"
            value={dailyGoal}
            onChange={setDailyGoal}
            options={["10", "20", "30", "40", "50", "100"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="New cards" detail="Fresh cards per day">
          <AndroidSelect
            label="New cards"
            value={newCards}
            onChange={setNewCards}
            options={["5", "10", "15", "20", "30"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Maximum reviews" detail="Cap a single review session">
          <AndroidSelect
            label="Maximum reviews"
            value={maxReviews}
            onChange={setMaxReviews}
            options={["50", "75", "100", "150", "200"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Show hint first" detail="Offer a hint before the answer">
          <AndroidToggle
            value={showHintFirst}
            onChange={setShowHintFirst}
            label="Show hint first"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Show next intervals">
          <AndroidToggle
            value={showIntervals}
            onChange={setShowIntervals}
            label="Show next intervals"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Keyboard shortcuts" detail="Use 1–4 while studying">
          <AndroidToggle
            value={keyboardShortcuts}
            onChange={setKeyboardShortcuts}
            label="Keyboard shortcuts"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Target retention">
          <AndroidSelect
            label="Target retention"
            value={retention}
            onChange={setRetention}
            options={["Conservative - 90%", "Balanced - 85%", "Aggressive - 80%"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Review order">
          <AndroidSelect
            label="Review order"
            value={reviewOrder}
            onChange={setReviewOrder}
            options={["FSRS - Optimized", "Random", "Newest first", "Hardest first"]}
          />
        </AndroidSettingRow>
      </AndroidSettingsSection>

      <AndroidSettingsSection
        icon={Sparkles}
        title="Generation"
        detail="Set the defaults Aura uses when making material."
      >
        <AndroidSettingRow label="Cards per generation">
          <AndroidSelect
            label="Cards per generation"
            value={cardsPerGeneration}
            onChange={setCardsPerGeneration}
            options={["5", "10", "15", "20", "25", "30"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Include examples">
          <AndroidToggle
            value={includeExamples}
            onChange={setIncludeExamples}
            label="Include examples"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Default language">
          <AndroidSelect
            label="Default language"
            value={defaultLanguage}
            onChange={setDefaultLanguage}
            options={["English", "Spanish", "French", "German", "Japanese"]}
          />
        </AndroidSettingRow>
      </AndroidSettingsSection>

      <AndroidSettingsSection icon={Bell} title="Reminders" detail="Keep your memory curve moving.">
        <AndroidSettingRow label="Daily reminder" detail="A local notification on this device">
          <div className="android-settings-inline">
            <input
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
              aria-label="Reminder time"
            />
            <AndroidToggle
              value={dailyReminder}
              onChange={setDailyReminder}
              label="Daily reminder"
            />
          </div>
        </AndroidSettingRow>
        <AndroidSettingRow label="Due cards" detail="Nudge me when reviews are waiting">
          <AndroidToggle value={dueReminder} onChange={setDueReminder} label="Due cards reminder" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Streak protection">
          <AndroidToggle
            value={streakReminder}
            onChange={setStreakReminder}
            label="Streak reminder"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Weekly summary">
          <AndroidToggle value={weeklySummary} onChange={setWeeklySummary} label="Weekly summary" />
        </AndroidSettingRow>
        <AndroidSettingRow
          label="Speak reminder"
          detail="Says it out loud with the first reminder. Stays quiet on silent or Do Not Disturb."
        >
          <AndroidSelect
            label="Speak reminder"
            value={spokenReminder}
            onChange={(next) => setSpokenReminder(next as SpokenReminderMode)}
            options={[
              { value: "off", label: "Off" },
              { value: "random", label: "Random message" },
              { value: "chosen", label: "A message I choose" },
            ]}
          />
        </AndroidSettingRow>
        {spokenReminder === "chosen" && (
          <AndroidSettingRow label="Message">
            <AndroidSelect
              label="Reminder message"
              value={spokenReminderMessage}
              onChange={setSpokenReminderMessage}
              options={SPOKEN_REMINDER_MESSAGES.map((line) => ({ value: line, label: line }))}
            />
          </AndroidSettingRow>
        )}
        {spokenReminder !== "off" && (
          <button
            type="button"
            className="android-settings-action"
            onClick={() => void testSpokenReminder()}
          >
            <Volume2 className="h-4 w-4" aria-hidden /> Play reminder now
            <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
        )}
        <AndroidSettingRow label="Push reminders" detail="Server-sent nudges, even when closed">
          <AndroidToggle
            value={pushReminders}
            onChange={(next) => void togglePush(next)}
            label="Push reminders"
          />
        </AndroidSettingRow>
      </AndroidSettingsSection>

      <AndroidSettingsSection
        icon={Volume2}
        title="Aura behavior"
        detail="Tune voice and feedback for hands-free study."
      >
        <AndroidSettingRow label="Sound effects">
          <AndroidToggle value={soundEffects} onChange={setSoundEffects} label="Sound effects" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Read cards aloud">
          <AndroidToggle value={textToSpeech} onChange={setTextToSpeech} label="Text to speech" />
        </AndroidSettingRow>
        <AndroidSettingRow
          label="Voice"
          detail="Used for read-aloud, voice study and spoken reminders"
        >
          <AndroidSelect label="Voice" value={ttsVoice} onChange={chooseVoice} options={voiceOptions} />
        </AndroidSettingRow>
        <button type="button" className="android-settings-action" onClick={() => void testVoice()}>
          <Volume2 className="h-4 w-4" aria-hidden /> Test voice
          <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
        </button>
        <AndroidSettingRow label="Auto-play audio">
          <AndroidToggle
            value={autoPlayAudio}
            onChange={setAutoPlayAudio}
            label="Auto play audio"
          />
        </AndroidSettingRow>
      </AndroidSettingsSection>

      <AndroidSettingsSection
        icon={Palette}
        title="Appearance"
        detail="Keep the mobile interface comfortable at night."
      >
        <AndroidSettingRow label="Theme" detail="Apply instantly across the app">
          <AndroidSelect
            label="Theme"
            value={theme.toLowerCase() === "light" ? "dark" : theme.toLowerCase()}
            onChange={setTheme}
            options={["dark", "system"]}
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Reduce motion">
          <AndroidToggle value={reduceMotion} onChange={setReduceMotion} label="Reduce motion" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Compact mode">
          <AndroidToggle value={compactMode} onChange={setCompactMode} label="Compact mode" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Auto night mode" detail="Dim the interface after 8 PM">
          <AndroidToggle
            value={autoNightMode}
            onChange={setAutoNightMode}
            label="Auto night mode"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="High contrast">
          <AndroidToggle value={highContrast} onChange={setHighContrast} label="High contrast" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Font size">
          <AndroidSelect
            label="Font size"
            value={fontSize}
            onChange={setFontSize}
            options={["Small", "Medium", "Large", "Extra Large"]}
          />
        </AndroidSettingRow>
      </AndroidSettingsSection>

      <AndroidSettingsSection
        icon={RefreshCw}
        title="Device & privacy"
        detail="Choose what stays on this phone."
      >
        <AndroidSettingRow label="Anonymous usage analytics" detail="Help improve AuraMind">
          <AndroidToggle
            value={usageAnalytics}
            onChange={setUsageAnalytics}
            label="Anonymous usage analytics"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Save chat history" detail="Keep conversations on this device">
          <AndroidToggle
            value={saveChatHistory}
            onChange={setSaveChatHistory}
            label="Save chat history"
          />
        </AndroidSettingRow>
        <AndroidSettingRow label="Auto-sync" detail="Keep progress synced automatically">
          <AndroidToggle value={autoSync} onChange={setAutoSync} label="Auto sync" />
        </AndroidSettingRow>
        <AndroidSettingRow label="Offline mode" detail="Prefer local study data">
          <AndroidToggle value={offlineMode} onChange={setOfflineMode} label="Offline mode" />
        </AndroidSettingRow>
        {biometricDetail && (
          <AndroidSettingRow label="App lock" detail={biometricDetail}>
            <AndroidToggle
              value={appLock}
              onChange={(next) => void toggleAppLock(next)}
              label="App lock"
            />
          </AndroidSettingRow>
        )}
        <button
          type="button"
          className="android-settings-action"
          onClick={() => {
            hapticTap();
            clearLocalData();
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Clear local cache{" "}
          <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className="android-settings-action"
          onClick={() => {
            hapticTap();
            exportData();
          }}
        >
          <Download className="h-4 w-4" aria-hidden /> Export device settings{" "}
          <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
        </button>
      </AndroidSettingsSection>

      <div className="android-native-account-actions">
        {profile?.avatar && (
          <button
            type="button"
            className="android-native-secondary"
            onClick={() => void removeAvatar()}
            disabled={avatarBusy}
          >
            <X className="h-4 w-4" aria-hidden /> Remove avatar
          </button>
        )}
        <button
          type="button"
          className="android-native-secondary"
          onClick={() => {
            hapticWarning();
            signOut();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
        <button
          type="button"
          className="android-native-danger"
          onClick={() => {
            hapticWarning();
            setDeleteOpen(true);
          }}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden /> Delete account
        </button>
      </div>
      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={handleDeleted}
      />
      <div className="android-native-tip">
        <Moon className="h-4 w-4" aria-hidden />
        <span>Dark Prism mode is tuned for late-night study sessions.</span>
      </div>
    </div>
  );
}
