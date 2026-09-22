import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Zap, Bell, Palette, Shield, AlertTriangle, Volume2, RefreshCw, Languages, Accessibility, Pencil, Check, X, Camera, Trash2, Upload as UploadIcon, LogOut, Sparkles } from '@/components/icons';
import { toast } from 'sonner';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { supabase, requireSupabase } from '../../services/database/supabase';
import { userService } from '../../services/user/userService';
import { uploadAvatar, deleteAvatar } from '../../services/user/avatarService';
import ProfAuraAvatar from '../../components/auramind/ProfAuraAvatar';
import { DeleteAccountModal } from '../../components/settings/DeleteAccountModal';
import { Capacitor } from '../../lib/nativeShim';
import { useAppPreference } from '../../lib/appPreferences';
import { analyticsService } from '../../services/analytics/analyticsService';
import { useReminderSync } from '../../hooks/useReminderSync';
import { useVoiceOptions } from '../../hooks/useVoiceOptions';
import {
  isSpeechOutputAvailable,
  resetRandomVoice,
  speak,
  VOICE_PREF_KEY,
  VOICE_RANDOM,
  DEFAULT_VOICE,
} from '../../services/voice/speechOutput';
import { getAIProvider, setAIProvider, type AIProvider } from '../../lib/aiProvider';
import {
  listFactors, beginEnrollment, verifyEnrollment, unenroll,
  type MfaFactor,
} from '../../services/auth/mfaService';
import type { UserProfile } from '../../types';

type MfaStep =
  | { step: 'idle' }
  | { step: 'qr'; factorId: string; qrSvg: string; secret: string }
  | { step: 'verify'; factorId: string };

/**
 * Two-factor authentication (TOTP) management.
 *
 * Enroll: begin → scan QR (or type the secret) → confirm with the first
 * 6-digit code. Unenroll: remove a factor with confirmation. The login flow
 * itself lives in AuthPage's MFA challenge step.
 */
function TwoFactorSection() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState<MfaStep>({ step: 'idle' });
  const [code, setCode] = useState('');

  const refresh = useCallback(async () => {
    try {
      setFactors(await listFactors());
    } catch {
      setFactors([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleBegin = async () => {
    setBusy(true);
    try {
      const enroll = await beginEnrollment();
      setMfaStep({ step: 'qr', factorId: enroll.factorId, qrSvg: enroll.qrSvg, secret: enroll.secret });
    } catch (err: any) {
      toast.error(err?.message || 'Could not start 2FA setup');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (mfaStep.step !== 'qr' && mfaStep.step !== 'verify') return;
    setBusy(true);
    try {
      await verifyEnrollment(mfaStep.factorId, code.replace(/\s+/g, ''));
      toast.success('Two-factor authentication enabled');
      setMfaStep({ step: 'idle' });
      setCode('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Invalid code — try again');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (factor: MfaFactor) => {
    setBusy(true);
    try {
      await unenroll(factor.id);
      toast.success('Two-factor authentication disabled');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove the authenticator');
    } finally {
      setBusy(false);
    }
  };

  const enabled = loaded && factors.length > 0;

  return (
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
      <SectionHeader icon={Shield} title="Two-factor authentication" subtitle="Require a 6-digit code from an authenticator app at sign-in." />
      <div className="space-y-3">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-[#F0EFFE] text-xs">
              Status: <span className={enabled ? 'text-emerald-400' : 'text-[#7A7A96]'}>
                {loaded ? (enabled ? 'Enabled' : 'Off') : '…'}
              </span>
            </div>
            {enabled && (
              <div className="text-[#7A7A96] text-[10px] mt-0.5">
                {factors.length} authenticator{factors.length > 1 ? 's' : ''} linked
              </div>
            )}
          </div>
          {!enabled ? (
            <button
              onClick={handleBegin}
              disabled={busy || !loaded}
              className="px-4 py-1.5 bg-[#7C3AED] text-white text-[11px] font-medium rounded-lg hover:bg-[#6D28D9] transition-all disabled:opacity-50"
            >
              Enable
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {factors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleRemove(f)}
                  disabled={busy}
                  className="px-3 py-1.5 border border-red-500/30 text-red-400 text-[11px] font-medium rounded-lg hover:bg-red-500/10 transition-all disabled:opacity-50"
                >
                  Remove
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Enroll flow */}
        {mfaStep.step === 'qr' && (
          <div className="border-t border-[#2A2A3A]/30 pt-4">
            <p className="text-[#9090A8] text-xs mb-3">
              1. Scan this QR code with Google Authenticator, 1Password, or Authy.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-3">
              {mfaStep.qrSvg ? (
                <div
                  className="w-40 h-40 p-2 bg-white rounded-lg shrink-0 [&>svg]:w-full [&>svg]:h-full"
                  // Supabase returns the QR as a trusted inline SVG document.
                  dangerouslySetInnerHTML={{ __html: mfaStep.qrSvg }}
                />
              ) : (
                <div className="w-40 h-40 bg-[#1A1A24] rounded-lg shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[#9090A8] text-xs mb-1">Can't scan? Enter this key instead:</p>
                <code className="block bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2 text-[#F0EFFE] text-xs break-all select-all">
                  {mfaStep.secret}
                </code>
              </div>
            </div>
            <p className="text-[#9090A8] text-xs mb-2">2. Enter the 6-digit code to confirm.</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                className="w-32 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-2 text-[#F0EFFE] text-sm tracking-[0.3em] outline-none focus:border-[#7C3AED]/50"
              />
              <button
                onClick={handleVerify}
                disabled={busy || code.replace(/\s/g, '').length !== 6}
                className="px-4 py-2 bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-all disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => { setMfaStep({ step: 'idle' }); setCode(''); }}
                className="px-3 py-2 text-[#7A7A96] hover:text-[#9090A8] text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-[#7A7A96] text-[10px] mt-3">
              Keep a backup of the secret key — a lost authenticator without it means contacting support to regain access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  return useAppPreference(key, defaultValue);
}

const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!on)}
    className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
      on ? 'bg-[#7C3AED]' : 'bg-[#2A2A3A]'
    }`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow ${
      on ? 'left-5' : 'left-0.5'
    }`} />
  </button>
);

const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-3 py-1.5 text-[#F0EFFE] text-xs outline-none focus:border-[#7C3AED]/50 min-w-[120px] max-w-full shrink-0"
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-[#7C3AED]/10 flex items-center justify-center text-sm shrink-0 mt-0.5">
        <Icon size={14} className="text-[#8B5CF6]" />
      </div>
      <div>
        <h3 className="text-[#F0EFFE] text-sm font-medium">{title}</h3>
        <p className="text-[#7A7A96] text-[11px]">{subtitle}</p>
      </div>
    </div>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <div className="text-[#F0EFFE] text-xs">{label}</div>
        {desc && <div className="text-[#7A7A96] text-[10px] mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  // Use workspace user for display name (matches sidebar), fall back to profile
  const displayName = workspace?.user?.name || profile?.name || 'User';

  const [dailyGoal, setDailyGoal] = useLocalStorage('auramind_dailyGoal', '20');
  const [newCards, setNewCards] = useLocalStorage('auramind_newCards', '10');
  const [maxReviews, setMaxReviews] = useLocalStorage('auramind_maxReviews', '100');
  const [retention, setRetention] = useLocalStorage('auramind_retention', 'Balanced - 85%');
  const [showIntervals, setShowIntervals] = useLocalStorage('auramind_showIntervals', true);
  const [keyboardShortcuts, setKeyboardShortcuts] = useLocalStorage('auramind_keyboardShortcuts', true);
  const [cardsPerGen, setCardsPerGen] = useLocalStorage('auramind_cardsPerGen', '20');
  const [includeExamples, setIncludeExamples] = useLocalStorage('auramind_includeExamples', true);
  const [defaultLanguage, setDefaultLanguage] = useLocalStorage('auramind_defaultLanguage', 'English');
  const [dailyReminder, setDailyReminder] = useLocalStorage('auramind_dailyReminder', true);
  // Memory sparks (sporadic FSRS-driven resurfacing) — master + per-surface.
  const [sparksEnabled, setSparksEnabled] = useLocalStorage('auramind_sparksEnabled', true);
  const [sparksPopup, setSparksPopup] = useLocalStorage('auramind_sparksPopup', true);
  const [sparksNotifications, setSparksNotifications] = useLocalStorage('auramind_sparksNotifications', true);
  const [reminderTime, setReminderTime] = useLocalStorage('auramind_reminderTime', '09:00');
  const [dueReminder, setDueReminder] = useLocalStorage('auramind_dueReminder', true);
  const [streakReminder, setStreakReminder] = useLocalStorage('auramind_streakReminder', true);
  const [weeklySummary, setWeeklySummary] = useLocalStorage('auramind_weeklySummary', false);
  const [theme, setTheme] = useLocalStorage('auramind_theme', 'dark');
  const [reduceMotion, setReduceMotion] = useLocalStorage('auramind_reduceMotion', false);
  const [compactMode, setCompactMode] = useLocalStorage('auramind_compactMode', false);
  const [usageAnalytics, setUsageAnalytics] = useLocalStorage('auramind_usageAnalytics', true);
  const [saveChatHistory, setSaveChatHistory] = useLocalStorage('auramind_saveChatHistory', true);
  const [soundEffects, setSoundEffects] = useLocalStorage('auramind_soundEffects', true);
  const [studyMusicVolume, setStudyMusicVolume] = useLocalStorage('auramind_studyMusicVolume', '50');
  const [autoSync, setAutoSync] = useLocalStorage('auramind_autoSync', true);
  const [offlineMode, setOfflineMode] = useLocalStorage('auramind_offlineMode', false);
  const [fontSize, setFontSize] = useLocalStorage('auramind_fontSize', 'Medium');
  const [highContrast, setHighContrast] = useLocalStorage('auramind_highContrast', false);
  const [textToSpeech, setTextToSpeech] = useLocalStorage('auramind_textToSpeech', false);
  const [ttsVoice, setTtsVoice] = useLocalStorage<string>(VOICE_PREF_KEY, DEFAULT_VOICE);
  const voiceOptions = useVoiceOptions(ttsVoice);
  const chooseVoice = (next: string) => {
    if (next === VOICE_RANDOM) resetRandomVoice();
    setTtsVoice(next);
  };
  const [autoNightMode, setAutoNightMode] = useLocalStorage('auramind_autoNightMode', true);
  const [reviewOrder, setReviewOrder] = useLocalStorage('auramind_reviewOrder', 'FSRS - Optimized');
  const [showHintFirst, setShowHintFirst] = useLocalStorage('auramind_showHintFirst', false);
  const [autoPlayAudio, setAutoPlayAudio] = useLocalStorage('auramind_autoPlayAudio', false);
  const [aiProvider, setAiProviderState] = useState<AIProvider>(getAIProvider());
  const [_showPassword, _setShowPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Reminder controls map to real Android schedules. 'request' because
  // toggling one here is an explicit user action and may raise the permission
  // dialog; app start uses 'maintain' and never prompts. Scheduling lives in
  // useReminderSync so this page and the Android shell cannot drift apart.
  useReminderSync('request');

  useEffect(() => {
    if (usageAnalytics) void analyticsService.init();
  }, [usageAnalytics]);

  useEffect(() => {
    if (userId === undefined) return;
    let cancelled = false;
    (async () => {
      try {
        if (userId) {
          const p = await userService.getCurrentUser();
          if (cancelled) return;
          setProfile(p);
          setNameInput(p?.name || '');
        }
      } catch { /* intentionally ignored */ } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) {
      setEditingName(false);
      setNameInput(displayName);
      return;
    }
    setNameSaving(true);
    try {
      // Use workspace updateProfile if available (keeps sidebar in sync)
      if (workspace?.updateProfile) {
        await workspace.updateProfile({ name: trimmed });
      } else {
        // Fallback: direct supabase update
        if (supabase) {
          const { error } = await requireSupabase().auth.updateUser({
            data: { full_name: trimmed },
          });
          if (error) throw error;
          await supabase.from('user_profiles').update({ name: trimmed }).eq('id', profile!.id);
        }
      }
      setProfile(prev => prev ? { ...prev, name: trimmed } : prev);
      setNameInput(trimmed);
      setEditingName(false);
    } catch (err) {
      console.error('Failed to save name:', err);
      setNameInput(displayName);
      setEditingName(false);
    } finally {
      setNameSaving(false);
    }
  }, [nameInput, displayName, workspace, profile]);

  const handleChangePassword = useCallback(() => {
    navigate('/reset-password');
  }, [navigate]);

  const handleManageSubscription = useCallback(async () => {
    try {
      // If the user already has a Stripe customer, open the billing portal
      // so they can manage/upgrade/cancel their real subscription. Otherwise
      // send them to the plan page to start one.
      const { data: { session } } = await requireSupabase().auth.getSession();
      const customerId = session?.user?.user_metadata?.stripe_customer_id as string | undefined;
      const api = import.meta.env.VITE_API_BASE_URL || '';
      if (customerId) {
        const token = session?.access_token;
        const res = await fetch(`${api}/api/stripe/portal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ customerId }),
        });
        const json = await res.json().catch(() => ({}));
        if (json.url) {
          window.open(json.url, '_blank', 'noopener');
          return;
        }
      }
      navigate('/subscribe');
    } catch {
      navigate('/subscribe');
    }
  }, [navigate]);

  const handleSignOut = useCallback(() => {
    // workspace.onLogout clears local state, resets gamification, and signs
    // out of Supabase. Navigate immediately as a belt-and-suspenders so the
    // user always lands somewhere, even if the auth event fires async.
    try {
      void workspace?.onLogout?.();
    } catch { /* ignore */ }
    navigate('/auth');
  }, [workspace, navigate]);

  const handleDeletedAccount = useCallback(() => {
    // Account is gone server-side. Wipe local device state and leave.
    try { void workspace?.onLogout?.(); } catch { /* ignore */ }
    navigate('/');
  }, [workspace, navigate]);

  const handleClearCache = useCallback(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('auramind_') && k !== 'auramind_theme');
    keys.forEach(k => localStorage.removeItem(k));
    toast.success('Cache cleared');
  }, []);

  const handleResetProgress = useCallback(() => {
    if (!window.confirm('This will reset all your study progress and streaks. Are you sure?')) return;
    const keep = ['auramind_theme', 'auramind_dailyGoal', 'auramind_newCards', 'auramind_maxReviews'];
    const keys = Object.keys(localStorage).filter(k => k.startsWith('auramind_') && !keep.includes(k));
    keys.forEach(k => localStorage.removeItem(k));
    toast.success('Progress reset');
  }, []);

  const handleExportData = useCallback(async () => {
    const stats = Object.keys(localStorage)
      .filter(k => k.startsWith('auramind_'))
      .reduce((acc, k) => ({ ...acc, [k]: localStorage.getItem(k) }), {} as Record<string, string | null>);
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auramind-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported');
  }, []);

  const handleExportAnki = useCallback(async () => {
    const blob = new Blob(['# AuraMind Anki Export\n# Format: Front\tBack\n'], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auramind-anki-${Date.now()}.tsv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Anki package exported');
  }, []);

  const handleDeleteAccount = useCallback(() => {
    setDeleteOpen(true);
  }, []);

  return (
      <div className={`space-y-8 ${Capacitor.getPlatform() === 'android' ? 'android-settings-page android-native-page' : ''}`}>
        {/* Header */}
        <div>
          <p className="nova-label text-violet-200/80">You</p>
          <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">Settings</h1>
          <p className="mt-2 text-sm text-zinc-400">Tune study defaults, notifications, and account identity.</p>
        </div>

        {/* Profile Card — full width at top */}
        <AvatarEditor
          currentAvatarUrl={profile?.avatar ?? null}
          displayName={displayName}
          userId={profile?.id || userId || ''}
          onChange={async (url) => {
            // Persist via workspace so AppShell sidebar reads it instantly.
            try {
              if (workspace?.updateProfile) {
                await workspace.updateProfile({ avatar: url || undefined });
              } else if (supabase && profile?.id) {
                await supabase.from('user_profiles').update({ avatar_url: url }).eq('id', profile.id);
              }
              setProfile((p) => (p ? { ...p, avatar: url || undefined } : p));
            } catch (_err) {
              toast.error('Could not save the new avatar. Try again.');
            }
          }}
        />
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveName()}
                    className="flex-1 px-2 py-1 bg-[#1A1A24] border border-[#7C3AED]/50 rounded-lg text-[#F0EFFE] text-sm outline-none focus:border-[#7C3AED] max-w-xs"
                    autoFocus
                    placeholder="Your name"
                  />
                  <button onClick={saveName} disabled={nameSaving} className="p-1.5 rounded-lg bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50 transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setEditingName(false); setNameInput(profile?.name || ''); }} className="p-1.5 rounded-lg hover:bg-[#2A2A3A] text-[#7A7A96]">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    onClick={() => { setNameInput(profile?.name || ''); setEditingName(true); }}
                    className="text-[#F0EFFE] text-lg font-medium truncate cursor-pointer hover:text-[#8B5CF6] transition-colors"
                    title="Click to edit name"
                  >
                    {profileLoading && !workspace ? 'Loading...' : displayName}
                  </span>
                  <button onClick={() => { setNameInput(profile?.name || ''); setEditingName(true); }} className="text-[#7A7A96] hover:text-[#8B5CF6] transition-colors">
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 rounded-full bg-[#7C3AED]/10 text-[#8B5CF6] text-[9px] font-medium shrink-0">
                  {profile?.plan || 'Free'}
                </span>
              </div>
              <p className="text-[#7A7A96] text-xs mt-1">{profile?.email || ''}</p>
              <button onClick={handleManageSubscription} className="text-[#8B5CF6] text-[10px] font-medium hover:text-[#7C3AED] transition-colors mt-1">
                Manage subscription
              </button>
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0 flex-wrap">
              <button onClick={handleChangePassword} className="px-4 py-2 border border-[#2A2A3A] text-[#F0EFFE] text-xs font-medium rounded-lg hover:border-[#3A3A4F] transition-all">
                Change Password
              </button>
              <button onClick={handleSignOut} className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#2A2A3A] text-[#7A7A96] text-xs font-medium rounded-lg hover:border-[#7C3AED]/40 hover:text-[#F0EFFE] transition-all">
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Settings Grid — 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Study */}
          <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={BookOpen} title="Study" subtitle="Tune your daily review rhythm and retention target." />
          <div className="space-y-1">
            <SettingRow label="Daily goal" desc="Cards to review each day">
              <Select value={dailyGoal} onChange={setDailyGoal} options={[10,15,20,25,30,40,50,100].map(n => ({ label: `${n} cards`, value: String(n) }))} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="New cards per day">
              <Select value={newCards} onChange={setNewCards} options={[5,10,15,20,25,30].map(n => ({ label: `${n} cards`, value: String(n) }))} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Max reviews per day">
              <Select value={maxReviews} onChange={setMaxReviews} options={[50,75,100,150,200,9999].map(n => ({ label: n === 9999 ? 'Unlimited' : `${n} cards`, value: String(n) }))} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Target retention">
              <Select value={retention} onChange={setRetention} options={[
                { label: 'Conservative - 90%', value: 'Conservative - 90%' },
                { label: 'Balanced - 85%', value: 'Balanced - 85%' },
                { label: 'Aggressive - 80%', value: 'Aggressive - 80%' },
              ]} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Show next intervals">
              <Toggle on={showIntervals} onChange={setShowIntervals} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Enable keyboard shortcuts">
              <Toggle on={keyboardShortcuts} onChange={setKeyboardShortcuts} />
            </SettingRow>
          </div>
        </div>

        {/* AI Generation */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Zap} title="AI Generation" subtitle="Defaults applied when Aura builds new cards." />
          <div className="space-y-1">
            <SettingRow
              label="AI engine"
              desc="Cloud is fast and always available. On-device runs a small model in your browser — private, offline, needs WebGPU (Chrome or Edge)."
            >
              <Select
                value={aiProvider}
                onChange={(v) => {
                  const next = v as AIProvider;
                  setAIProvider(next);
                  setAiProviderState(next);
                  if (next === 'local') {
                    toast.info('On-device AI enabled — the model will download on first use.');
                  }
                }}
                options={[
                  { label: 'Cloud (recommended)', value: 'cloud' },
                  { label: 'On-device (offline)', value: 'local' },
                ]}
              />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Cards per generation">
              <Select value={cardsPerGen} onChange={setCardsPerGen} options={[5,10,15,20,25,30].map(n => ({ label: `${n} cards`, value: String(n) }))} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Include examples">
              <Toggle on={includeExamples} onChange={setIncludeExamples} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Default language">
              <Select value={defaultLanguage} onChange={setDefaultLanguage} options={[
                { label: 'English', value: 'English' },
                { label: 'Spanish', value: 'Spanish' },
                { label: 'French', value: 'French' },
                { label: 'German', value: 'German' },
                { label: 'Japanese', value: 'Japanese' },
              ]} />
            </SettingRow>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Bell} title="Notifications" subtitle="Reminders that keep your streak alive." />
          <div className="space-y-1">
            <SettingRow label="Daily reminder">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  className="bg-[#1A1A24] border border-[#2A2A3A] rounded-lg px-2 py-1 text-[#F0EFFE] text-xs outline-none focus:border-[#7C3AED]/50"
                />
                <Toggle on={dailyReminder} onChange={setDailyReminder} />
              </div>
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Due cards reminder">
              <Toggle on={dueReminder} onChange={setDueReminder} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Streak reminder">
              <Toggle on={streakReminder} onChange={setStreakReminder} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Weekly progress summary">
              <Toggle on={weeklySummary} onChange={setWeeklySummary} />
            </SettingRow>
          </div>
        </div>

        {/* Memory sparks */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader
            icon={Sparkles}
            title="Memory sparks"
            subtitle="Sporadically resurface cards as recall fades — pop-ups, gentle notifications, and mixes into study sessions."
          />
          <div className="space-y-1">
            <SettingRow label="Memory sparks">
              <Toggle on={sparksEnabled} onChange={setSparksEnabled} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="In-app pop-up sparks">
              <Toggle on={sparksPopup} onChange={setSparksPopup} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Notification sparks">
              <Toggle on={sparksNotifications} onChange={setSparksNotifications} />
            </SettingRow>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Palette} title="Appearance" subtitle="How AuraMind looks and feels on this device." />
          <div className="space-y-1">
            <SettingRow label="Theme">
              {/* Light is intentionally not offered yet: the product is
                  dark-first and surfaces use fixed dark palettes, so a light
                  setting would be a silent no-op. Re-add once a light token
                  set ships across components. */}
              <Select value={theme.toLowerCase() === 'light' ? 'dark' : theme.toLowerCase()} onChange={setTheme} options={[
                { label: 'Dark', value: 'dark' },
                { label: 'System', value: 'system' },
              ]} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Reduce motion">
              <Toggle on={reduceMotion} onChange={setReduceMotion} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Compact mode">
              <Toggle on={compactMode} onChange={setCompactMode} />
            </SettingRow>
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Shield} title="Privacy" subtitle="What we store, what stays on your device." />
          <div className="space-y-1">
            <SettingRow label="Send anonymous usage analytics">
              <Toggle on={usageAnalytics} onChange={setUsageAnalytics} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Save AI chat history">
              <Toggle on={saveChatHistory} onChange={setSaveChatHistory} />
            </SettingRow>
          </div>
        </div>

        {/* Security — two-factor authentication */}
        <TwoFactorSection />

        {/* Audio */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Volume2} title="Audio" subtitle="Sound effects, study music, and text-to-speech." />
          <div className="space-y-1">
            <SettingRow label="Sound effects" desc="Card flip and button sounds">
              <Toggle on={soundEffects} onChange={setSoundEffects} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Study music volume" desc="Ambient background during study sessions">
              <Select value={studyMusicVolume} onChange={setStudyMusicVolume} options={[
                { label: 'Off', value: '0' },
                { label: '25%', value: '25' },
                { label: '50%', value: '50' },
                { label: '75%', value: '75' },
                { label: '100%', value: '100' },
              ]} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Text-to-speech" desc="Read cards aloud during review">
              <Toggle on={textToSpeech} onChange={setTextToSpeech} />
            </SettingRow>
            {isSpeechOutputAvailable() && (
              <>
                <div className="border-t border-[#2A2A3A]/30" />
                <SettingRow label="Voice" desc="Used for read-aloud and voice study">
                  <div className="flex items-center gap-2">
                    <Select value={ttsVoice} onChange={chooseVoice} options={voiceOptions} />
                    <button
                      type="button"
                      onClick={() => void speak("Hi, I'm Prof. Aura. This is the voice I'll read your cards in.", { voice: ttsVoice })}
                      className="rounded-lg border border-[#2A2A3A] px-3 py-1.5 text-xs text-[#F0EFFE] hover:border-[#7C3AED]/50"
                    >
                      Test
                    </button>
                  </div>
                </SettingRow>
              </>
            )}
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Auto-play audio" desc="Play card audio automatically">
              <Toggle on={autoPlayAudio} onChange={setAutoPlayAudio} />
            </SettingRow>
          </div>
        </div>

        {/* Sync & Data */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={RefreshCw} title="Sync & Data" subtitle="How your data stays up to date across devices." />
          <div className="space-y-1">
            <SettingRow label="Auto-sync" desc="Sync progress automatically">
              <Toggle on={autoSync} onChange={setAutoSync} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Offline mode" desc="Work without internet connection">
              <Toggle on={offlineMode} onChange={setOfflineMode} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <div className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-[#F0EFFE] text-xs">Clear local cache</div>
                <div className="text-[#7A7A96] text-[10px] mt-0.5">Free up storage on this device</div>
              </div>
              <button onClick={handleClearCache} className="px-4 py-1.5 border border-[#2A2A3A] text-[#7A7A96] text-[11px] font-medium rounded-lg hover:border-[#3A3A4F] hover:text-[#F0EFFE] transition-all">
                Clear
              </button>
            </div>
            <div className="border-t border-[#2A2A3A]/30" />
            <div className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-[#F0EFFE] text-xs">Reset progress</div>
                <div className="text-[#7A7A96] text-[10px] mt-0.5">Reset all study progress and streaks</div>
              </div>
              <button onClick={handleResetProgress} className="px-4 py-1.5 border border-red-500/30 text-red-400 text-[11px] font-medium rounded-lg hover:bg-red-500/10 transition-all">
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Accessibility */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Accessibility} title="Accessibility" subtitle="Make AuraMind comfortable for your needs." />
          <div className="space-y-1">
            <SettingRow label="Font size">
              <Select value={fontSize} onChange={setFontSize} options={[
                { label: 'Small', value: 'Small' },
                { label: 'Medium', value: 'Medium' },
                { label: 'Large', value: 'Large' },
                { label: 'Extra Large', value: 'Extra Large' },
              ]} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="High contrast">
              <Toggle on={highContrast} onChange={setHighContrast} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Auto night mode" desc="Dim screen during late-night study">
              <Toggle on={autoNightMode} onChange={setAutoNightMode} />
            </SettingRow>
          </div>
        </div>

        {/* Learning */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
          <SectionHeader icon={Languages} title="Learning Preferences" subtitle="Fine-tune how cards are presented during review." />
          <div className="space-y-1">
            <SettingRow label="Review order">
              <Select value={reviewOrder} onChange={setReviewOrder} options={[
                { label: 'FSRS - Optimized', value: 'FSRS - Optimized' },
                { label: 'Random', value: 'Random' },
                { label: 'Newest first', value: 'Newest first' },
                { label: 'Oldest first', value: 'Oldest first' },
                { label: 'Hardest first', value: 'Hardest first' },
              ]} />
            </SettingRow>
            <div className="border-t border-[#2A2A3A]/30" />
            <SettingRow label="Show hint first" desc="Reveal hint before showing answer">
              <Toggle on={showHintFirst} onChange={setShowHintFirst} />
            </SettingRow>
          </div>
        </div>
      </div>

      {/* Danger Zone — full width */}
      <div className="mt-8 bg-[#111118] border border-red-500/20 rounded-xl p-6">
          <SectionHeader icon={AlertTriangle} title="Danger Zone" subtitle="Irreversible actions. Proceed with care." />
          <div className="space-y-3">
            {['Export your data', 'Export Anki package', 'Delete account'].map((item, i) => {
              const handler = item === 'Export your data' ? handleExportData
                : item === 'Export Anki package' ? handleExportAnki
                : handleDeleteAccount;
              return (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-[#F0EFFE] text-xs">{item}</span>
                  <button onClick={handler} className={`px-4 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                    item === 'Delete account'
                      ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                      : 'border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#3A3A4F]'
                  }`}>
                    {item === 'Delete account' ? 'Delete' : 'Export'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Account deletion — asks why, then confirms permanently */}
        <DeleteAccountModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={handleDeletedAccount}
        />
      </div>
  );
}

/**
 * AvatarEditor — file picker + drag-drop + upload for the user's avatar.
 *
 * Why inline instead of a separate component:
 *   - Closes over `setProfile` + `workspace.updateProfile` + `toast` so we
 *     avoid prop-drilling through SettingsPage state. Splitting later
 *     wouldn't be hard, but right now this is the only surface that edits
 *     the avatar — YAGNI wins.
 *
 * Visual contract:
 *   - Up to 256×256 raster (auto-encode to webp ≤5 MiB)
 *   - GIF and SVG pass through unmodified so animated-gif avatars actually
 *     animate when rendered.
 *   - Hover state shows the upload affordance overlay.
 *   - Drag-over state shows a violet wash so the user knows the dropzone
 *     is active.
 */
function AvatarEditor({
  currentAvatarUrl,
  displayName,
  userId,
  onChange,
}: {
  currentAvatarUrl: string | null;
  displayName: string;
  userId: string;
  onChange: (url: string | null) => Promise<void> | void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = (displayName || 'A').slice(0, 2).toUpperCase();
  const hasUploaded = !!currentAvatarUrl;

  // onPick is intentionally kept stable via a ref pattern so the
  // drag-drop useEffect below doesn't re-attach document listeners on
  // every render (parent passes a fresh `onChange` lambda each tick,
  // which would otherwise blow up our memory churn).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const stableOnPick = useCallback(async (file: File) => {
    if (!userId) {
      setError('No signed-in user \u2014 cannot upload.');
      return;
    }
    setError(null);
    setUploading(true);
    const result = await uploadAvatar(file, userId);
    setUploading(false);
    // Narrow with `'error' in result` so TS doesn't widen the union back
    // to the full `UploadResult` type. (read-only `as const` returns
    // infer the discriminant narrowly, but combining with optional
    // fields in different branches across the function body can defeat
    // the control flow analysis — the runtime guard sidesteps it.)
    if (!result.ok || 'error' in result) {
      const err = (result as { error: string }).error;
      setError(err);
      toast.error(err);
      return;
    }
    await onChangeRef.current(result.url);
    toast.success(
      file.type === 'image/gif' || file.type === 'image/svg+xml'
        ? 'Animated avatar saved.'
        : 'Avatar saved.',
    );
  }, [userId]);

  const stableOnRemove = useCallback(async () => {
    if (!userId) return;
    setUploading(true);
    await deleteAvatar(userId);
    setUploading(false);
    await onChangeRef.current(null);
    toast.success('Avatar removed.');
  }, [userId]);

  // Drag-drop wiring — listens to document events so the user can drop
  // anywhere on the editor card, not just the inner button. Listener
  // identity is stable because stableOnPick is itself stable (deps: [userId]).
  useEffect(() => {
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setIsDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void stableOnPick(file);
    };
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [stableOnPick]);

  return (
    <div
      className={`bg-[#111118] border rounded-xl p-6 transition-colors ${
        isDragging ? 'border-[#7C3AED]/70 bg-[#7C3AED]/[0.04]' : 'border-[#2A2A3A]'
      }`}
    >
      <SectionHeader
        icon={Camera}
        title="Avatar"
        subtitle="Your picture shows up in chat, leaderboards, and the sidebar everywhere."
      />
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="shrink-0">
          {hasUploaded ? (
            <img
              src={currentAvatarUrl!}
              alt="Your avatar"
              className="w-20 h-20 rounded-full object-cover ring-2 ring-[#7C3AED]/40"
            />
          ) : (
            <ProfAuraAvatar size={80} halo initial={initial} variant="badge" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#F0EFFE] text-sm font-medium">
            {hasUploaded ? 'Custom avatar' : 'Using Prof. Aura as default'}
          </p>
          <p className="text-[#7A7A96] text-[11px] mt-1 leading-relaxed">
            PNG, JPG, WEBP up to 5 MB · GIF and SVG also supported (animated GIFs play as themselves).
            We resize raster images to 256×256 before upload to save bandwidth.
          </p>
          {error && (
            <p className="text-[10px] text-amber-400 mt-2" role="alert">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors"
            >
              <UploadIcon size={11} />
              {uploading ? 'Uploading\u2026' : hasUploaded ? 'Replace avatar' : 'Upload avatar'}
            </button>
            {hasUploaded && (
              <button
                onClick={stableOnRemove}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A3A] text-[#7A7A96] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 text-[11px] font-medium transition-colors"
              >
                <Trash2 size={11} />
                Remove
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void stableOnPick(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
