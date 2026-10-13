/**
 * AdminAppCheckPage — "walk through the app and check it all."
 *
 * Two halves:
 *   1. System Health — hits the real admin diagnostics endpoints
 *      (`/api/admin/test` + `/api/admin/health/payments`) and shows live
 *      pass/fail for Supabase, Stripe API, Stripe webhook, and Resend.
 *   2. Feature Walkthrough — a checklist of every key app surface. Each
 *      row opens the route in a new tab so you can verify it, then you
 *      tick it off. Progress persists to localStorage.
 *
 * Auth: uses the Supabase session JWT as the Bearer token (same as the
 * Users page).
 */
import React, { useState } from 'react';
import {
  ClipboardCheck, RefreshCw, Check, AlertTriangle, ExternalLink, ShieldCheck,
} from '@/components/icons';
import { requireSupabase } from '../../services/database/supabase';

type Step = { status: 'pending' | 'passed' | 'failed'; name: string; message?: string };

// The surfaces you walk through and tick off.
const FEATURES: { key: string; title: string; desc: string; route: string }[] = [
  { key: 'overview', title: 'Dashboard Overview', desc: 'Stats, streak, due cards render', route: '/dashboard' },
  { key: 'decks', title: 'Deck Library', desc: 'Browse, search, open a deck', route: '/dashboard/decks' },
  { key: 'study', title: 'Study Session', desc: 'Flip a card, rate 1–4, FSRS schedules', route: '/dashboard/study' },
  { key: 'voice', title: 'Voice Q&A', desc: 'Enable Voice in study — speak question + answer aloud', route: '/dashboard/study-tools' },
  { key: 'audio', title: 'Audio → Flashcards', desc: 'Record or upload a clip, transcribe, generate deck', route: '/dashboard/study-tools' },
  { key: 'docs', title: 'Document → Notes/Slides', desc: 'Upload PDF/DOCX, generate notes/slides/cards', route: '/dashboard/study-tools' },
  { key: 'generator', title: 'AI Generator', desc: 'Generate quiz / flashcards / presentation', route: '/dashboard/generator' },
  { key: 'settings', title: 'Settings & Billing', desc: 'Profile, plan, subscription management', route: '/dashboard/settings' },
  { key: 'landing', title: 'Landing Page', desc: 'Hero copy, pricing, CTA works', route: '/' },
  { key: 'auth', title: 'Auth / Sign-in', desc: 'Sign up, sign in, verification flow', route: '/auth' },
];

const WALKTHROUGH_KEY = 'bonamind-admin.walkthrough';

const api = () => import.meta.env.VITE_API_BASE_URL || '';

async function authGet(path: string): Promise<any> {
  const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
  if (!token) return { error: 'Not authenticated' };
  const res = await fetch(`${api()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? await res.json().catch(() => ({})) : { error: `HTTP ${res.status}` };
}

export default function AdminAppCheckPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [walkthrough, setWalkthrough] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(WALKTHROUGH_KEY) || '{}');
    } catch { return {}; }
  });
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    setSteps([{ status: 'pending', name: 'Running system diagnostics…' }]);
    try {
      const [sysTest, payTest] = await Promise.all([authGet('/api/admin/test'), authGet('/api/admin/health/payments')]);
      const out: Step[] = [];
      (sysTest.tests || []).forEach((t: any) => {
        out.push({ status: t.status === 'passed' ? 'passed' : 'failed', name: t.name, message: t.message });
      });
      if (payTest && payTest.apiOk !== undefined) {
        out.push({ status: payTest.configOk ? 'passed' : 'failed', name: 'Stripe Configuration', message: payTest.configOk ? 'Secret key configured' : payTest.errors?.[0] || 'Not configured' });
        out.push({ status: payTest.apiOk ? 'passed' : 'failed', name: 'Stripe API', message: `${(payTest.prices || []).length} prices listed` });
        out.push({ status: payTest.webhookConfigured ? 'passed' : 'failed', name: 'Stripe Webhook', message: payTest.webhookConfigured ? (payTest.webhookUrl || 'Endpoint configured') : 'No webhook endpoint found' });
      }
      if (sysTest.error) out.push({ status: 'failed', name: 'Supabase', message: sysTest.error });
      if (out.length === 0) out.push({ status: 'failed', name: 'Diagnostics', message: 'No results returned — check your API + env keys.' });
      const completed = counted(out);
      if (completed.total > 0 && completed.passed === completed.total) {
        out.push({ status: 'passed', name: 'All system checks passed', message: `${completed.passed}/${completed.total}` });
      }
      setSteps(out);
    } catch (err: any) {
      setSteps([{ status: 'failed', name: 'Diagnostics errored', message: err.message }]);
    } finally {
      setRunning(false);
    }
  };

  const counted = (arr: Step[]) => {
    const done = arr.filter(s => s.status !== 'pending');
    return { total: done.length, passed: done.filter(s => s.status === 'passed').length, failed: done.filter(s => s.status === 'failed').length };
  };

  const toggle = (key: string) => {
    const next = { ...walkthrough, [key]: !walkthrough[key] };
    setWalkthrough(next);
    localStorage.setItem(WALKTHROUGH_KEY, JSON.stringify(next));
  };

  const resetWalkthrough = () => {
    const empty: Record<string, boolean> = {};
    setWalkthrough(empty);
    localStorage.setItem(WALKTHROUGH_KEY, JSON.stringify(empty));
  };

  const doneCount = FEATURES.filter(f => walkthrough[f.key]).length;

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-[#8B5CF6]" />
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">App Check</h1>
              <p className="text-[11px] text-zinc-500">Verify system health and walk through every surface before launch.</p>
            </div>
          </div>
          <button onClick={runChecks} disabled={running}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#7C3AED] text-white text-[11px] font-medium hover:bg-[#6D28D9] transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
            {running ? 'Checking…' : 'Run System Check'}
          </button>
        </div>

        {/* System Health */}
        <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
          <h2 className="text-xs font-semibold text-white mb-0.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> System Health
          </h2>
          <p className="text-[11px] text-zinc-500 mb-4">Supabase, Stripe, Stripe webhook, and email — via the real diagnostic endpoints.</p>
          {steps.length === 0 && !running && (
            <div className="flex items-center justify-center h-28 text-zinc-500 text-xs">
              Click “Run System Check” to test connectivity.
            </div>
          )}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-xl text-xs ${
                s.status === 'passed' ? 'bg-emerald-500/5 border border-emerald-500/20'
                : s.status === 'failed' ? 'bg-red-500/5 border border-red-500/20'
                : 'bg-white/[0.02] border border-[#2A2A3A]'
              }`}>
                <div className="flex items-center gap-3">
                  {s.status === 'passed' ? <Check size={14} className="text-emerald-400" />
                    : s.status === 'failed' ? <AlertTriangle size={14} className="text-red-400" />
                    : <RefreshCw size={14} className="text-zinc-500 animate-spin" />}
                  <div>
                    <span className="text-white font-medium">{s.name}</span>
                    {s.message && <p className="text-zinc-500 text-[10px]">{s.message}</p>}
                  </div>
                </div>
                <span className={`text-[10px] font-medium capitalize ${
                  s.status === 'passed' ? 'text-emerald-400' : s.status === 'failed' ? 'text-red-400' : 'text-zinc-500'
                }`}>{s.status}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Walkthrough */}
        <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5 text-[#8B5CF6]" /> Feature Walkthrough
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500">{doneCount} / {FEATURES.length} verified</span>
              <button onClick={resetWalkthrough} className="text-[10px] text-zinc-500 hover:text-white transition-colors">Reset</button>
            </div>
          </div>
          {/* progress bar */}
          <div className="mt-2 mb-4 h-1.5 bg-[#2A2A3A] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] transition-all duration-300"
              style={{ width: `${(doneCount / FEATURES.length) * 100}%` }} />
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            {FEATURES.map(f => {
              const checked = !!walkthrough[f.key];
              return (
                <div key={f.key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  checked ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#2A2A3A] bg-white/[0.02] hover:border-[#3A3A4F]'
                }`}>
                  <button onClick={() => toggle(f.key)}
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                      checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#2A2A3A] text-transparent hover:border-[#7C3AED]/50'
                    }`} title={checked ? 'Mark unverified' : 'Mark verified'}>
                    <Check size={14} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-medium">{f.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{f.desc}</div>
                  </div>
                  <a href={f.route} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-[#8B5CF6] hover:text-[#A78BFA] transition-colors">
                    Open <ExternalLink size={11} />
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      </div>
  );
}