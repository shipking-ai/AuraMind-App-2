/**
 * Settings for the iPhone app, laid out like Apple's Settings: a profile
 * cell, inset grouped sections with coloured icon tiles, switches, a
 * stepper, and pickers that open as sheets. Preferences use the same keys as
 * the web and Android settings, so a choice follows the account's device
 * storage no matter which screen changed it. Rarely used options stay on the
 * full settings page ("All Settings").
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import { useAppPreference } from "../../lib/appPreferences";
import { useVoiceOptions } from "../../hooks/useVoiceOptions";
import {
  DEFAULT_VOICE,
  VOICE_PREF_KEY,
  VOICE_RANDOM,
  resetRandomVoice,
  speak,
} from "../../services/voice/speechOutput";
import {
  Bell,
  Clock,
  Flame,
  Headphones,
  Layers,
  Moon,
  Settings,
  Sparkles,
  Star,
  Target,
  Volume2,
} from "../icons";
import {
  IOSChoiceList,
  IOSIconTile,
  IOSNavBar,
  IOSRow,
  IOSSection,
  IOSSheet,
  IOSStepper,
  IOSSwitch,
} from "./IOSPrimitives";
import { iosTap } from "./iosHaptics";
import { IOS_CARD_STYLE_KEY, type IOSCardStyle } from "./IOSStudySession";

const REMINDER_TIMES = [
  "07:00",
  "08:00",
  "09:00",
  "12:00",
  "15:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];

function timeLabel(value: string): string {
  const [h, m] = value.split(":").map((part) => Number.parseInt(part, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function IOSSettingsScreen() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const user = workspace?.user;

  const [dailyGoal, setDailyGoal] = useAppPreference("auramind_dailyGoal", "20");
  const [textToSpeech, setTextToSpeech] = useAppPreference("auramind_textToSpeech", false);
  const [soundEffects, setSoundEffects] = useAppPreference("auramind_soundEffects", true);
  const [voice, setVoice] = useAppPreference<string>(VOICE_PREF_KEY, DEFAULT_VOICE);
  const [dailyReminder, setDailyReminder] = useAppPreference("auramind_dailyReminder", true);
  const [reminderTime, setReminderTime] = useAppPreference("auramind_reminderTime", "09:00");
  const [dueReminder, setDueReminder] = useAppPreference("auramind_dueReminder", true);
  const [streakReminder, setStreakReminder] = useAppPreference("auramind_streakReminder", true);
  const [reduceMotion, setReduceMotion] = useAppPreference("auramind_reduceMotion", false);
  const voiceOptions = useVoiceOptions(voice);
  const [cardStyle, setCardStyle] = useAppPreference<IOSCardStyle>(IOS_CARD_STYLE_KEY, "paper");
  const [sheet, setSheet] = useState<"voice" | "time" | "card" | null>(null);

  const goal = Math.max(5, Number.parseInt(String(dailyGoal), 10) || 20);
  const voiceLabel =
    voiceOptions.find((o) => o.value === voice)?.label.replace(/ \(natural AI voice\)$/, "") ??
    "Automatic";

  return (
    <div>
      <IOSNavBar title="Settings" />

      <div className="ios-section">
        <div className="ios-list">
          <IOSRow
            leading={
              <span
                aria-hidden
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 600,
                  background: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
                  flexShrink: 0,
                }}
              >
                {(user?.name || "A").trim()[0]?.toUpperCase()}
              </span>
            }
            title={user?.name || "Your account"}
            subtitle={`${user?.plan || "Starter"} · ${user?.email || ""}`}
            chevron
            onClick={() => navigate("/dashboard/settings/all")}
          />
        </div>
      </div>

      <IOSSection caption="Study">
        <IOSRow
          leading={<IOSIconTile icon={Target} color="var(--ios-orange)" />}
          title="Daily goal"
          subtitle={`${goal} cards a day`}
          trailing={
            <IOSStepper
              label="daily goal"
              value={goal}
              min={5}
              max={200}
              step={5}
              onChange={(n) => setDailyGoal(String(n))}
            />
          }
        />
        <IOSRow
          leading={<IOSIconTile icon={Layers} color="var(--ios-green)" />}
          title="Card style"
          value={cardStyle === "glass" ? "Glass" : "Paper"}
          chevron
          onClick={() => setSheet("card")}
        />
        <IOSRow
          leading={<IOSIconTile icon={Volume2} color="var(--ios-pink)" />}
          title="Read cards aloud"
          trailing={
            <IOSSwitch
              label="Read cards aloud"
              checked={Boolean(textToSpeech)}
              onChange={setTextToSpeech}
            />
          }
        />
        <IOSRow
          leading={<IOSIconTile icon={Headphones} color="var(--ios-indigo)" />}
          title="Voice"
          value={voiceLabel}
          chevron
          onClick={() => setSheet("voice")}
        />
        <IOSRow
          leading={<IOSIconTile icon={Sparkles} color="var(--ios-teal)" />}
          title="Sound effects"
          trailing={
            <IOSSwitch
              label="Sound effects"
              checked={Boolean(soundEffects)}
              onChange={setSoundEffects}
            />
          }
        />
      </IOSSection>

      <IOSSection
        caption="Notifications"
        footer="Reminders are scheduled on this iPhone and work offline."
      >
        <IOSRow
          leading={<IOSIconTile icon={Bell} color="var(--ios-red)" />}
          title="Daily reminder"
          trailing={
            <IOSSwitch
              label="Daily reminder"
              checked={Boolean(dailyReminder)}
              onChange={setDailyReminder}
            />
          }
        />
        {dailyReminder && (
          <IOSRow
            leading={<IOSIconTile icon={Clock} color="var(--ios-blue)" />}
            title="Time"
            value={timeLabel(String(reminderTime))}
            chevron
            onClick={() => setSheet("time")}
          />
        )}
        <IOSRow
          leading={<IOSIconTile icon={Layers} color="var(--ios-tint-fill)" />}
          title="Cards due"
          trailing={
            <IOSSwitch
              label="Cards due reminder"
              checked={Boolean(dueReminder)}
              onChange={setDueReminder}
            />
          }
        />
        <IOSRow
          leading={<IOSIconTile icon={Flame} color="var(--ios-orange)" />}
          title="Streak protection"
          trailing={
            <IOSSwitch
              label="Streak protection"
              checked={Boolean(streakReminder)}
              onChange={setStreakReminder}
            />
          }
        />
      </IOSSection>

      <IOSSection caption="Accessibility">
        <IOSRow
          leading={<IOSIconTile icon={Moon} color="#636366" />}
          title="Reduce motion"
          trailing={
            <IOSSwitch
              label="Reduce motion"
              checked={Boolean(reduceMotion)}
              onChange={setReduceMotion}
            />
          }
        />
      </IOSSection>

      <IOSSection>
        <IOSRow
          leading={<IOSIconTile icon={Settings} color="#8e8e93" />}
          title="All Settings"
          chevron
          onClick={() => navigate("/dashboard/settings/all")}
        />
        <IOSRow
          leading={<IOSIconTile icon={Star} color="var(--ios-yellow)" />}
          title="Privacy Policy"
          chevron
          onClick={() => navigate("/privacy")}
        />
      </IOSSection>

      <IOSSection footer="AuraMind 2.0.0">
        <IOSRow title="Sign Out" destructive onClick={() => workspace?.onLogout()} />
      </IOSSection>

      <IOSSheet open={sheet === "voice"} title="Voice" onClose={() => setSheet(null)}>
        <IOSChoiceList
          options={voiceOptions}
          value={voice}
          onChange={(next) => {
            if (next === VOICE_RANDOM) resetRandomVoice();
            setVoice(next);
            void speak("Hi, I'm Prof. Aura. This is how I'll read your cards.", { voice: next });
          }}
        />
        <div className="ios-section-footer" style={{ padding: "10px 32px 0" }}>
          Natural AI voices need a connection and fall back to this iPhone’s best built-in voice
          when offline.
        </div>
      </IOSSheet>

      <IOSSheet open={sheet === "card"} title="Card Style" onClose={() => setSheet(null)}>
        <IOSChoiceList
          options={[
            { value: "paper" as IOSCardStyle, label: "Paper — AuraMind’s index card" },
            { value: "glass" as IOSCardStyle, label: "Glass — dark, lit in the deck’s colour" },
          ]}
          value={cardStyle}
          onChange={(next) => setCardStyle(next)}
        />
      </IOSSheet>

      <IOSSheet open={sheet === "time"} title="Reminder Time" onClose={() => setSheet(null)}>
        <IOSChoiceList
          options={REMINDER_TIMES.map((t) => ({ value: t, label: timeLabel(t) }))}
          value={String(reminderTime)}
          onChange={(next) => {
            iosTap();
            setReminderTime(next);
          }}
        />
      </IOSSheet>
    </div>
  );
}

export default IOSSettingsScreen;
