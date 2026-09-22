/**
 * AdminSettingsPage — real admin settings at /admin/settings.
 *
 * Two sections, both backed by things that already exist:
 *   1. Coupons — list / create / delete via /api/coupons/* (admin-gated,
 *      Stripe-backed). The create form enforces Stripe's own rules:
 *      exactly one of percent_off / amount_off, duration_in_months only
 *      when duration is repeating.
 *   2. Environment — read-only readout of the client config answering
 *      "which backend is this admin panel pointed at". Reads go through
 *      getEnvVar() (the CLIENT_ENV allowlist); secrets are never here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings, RefreshCw, CreditCard, Server, Plus, Trash2, X,
  Check, AlertTriangle,
} from '@/components/icons';
import { requireSupabase } from '../../services/database/supabase';
import { getEnvVar } from '../../lib/env';

interface Coupon {
  id: string;
  name?: string | null;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
  duration?: string | null;
  duration_in_months?: number | null;
  valid?: boolean;
  times_redeemed?: number | null;
}

const API = () => import.meta.env.VITE_API_BASE_URL || '';

async function authed(path: string, init?: RequestInit): Promise<{ ok: boolean; json?: any; error?: string }> {
  const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
  if (!token) return { ok: false, error: 'Not authenticated' };
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, json } : { ok: false, error: json.error || `HTTP ${res.status}` };
}

const mask = (v: string | undefined, keep = 6) => {
  if (!v) return 'not set';
  return v.length <= keep + 3 ? v : `${v.slice(0, keep)}…${v.slice(-4)}`;
};

function couponLabel(c: Coupon): string {
  if (c.percent_off != null) return `${c.percent_off}% off`;
  if (c.amount_off != null) return `$${(c.amount_off / 100).toFixed(2)} off`;
  return 'discount';
}

function couponDuration(c: Coupon): string {
  if (c.duration === 'repeating') return `repeating × ${c.duration_in_months ?? '?'} mo`;
  return c.duration || 'once';
}

export default function AdminSettingsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = useState('20');
  const [amount, setAmount] = useState('5');
  const [duration, setDuration] = useState('once');
  const [months, setMonths] = useState('3');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await authed('/api/coupons/list', { method: 'GET' });
    if (r.ok && Array.isArray(r.json?.coupons)) {
      setCoupons(r.json.coupons);
    } else {
      setError(r.error || 'Failed to load coupons');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setFormError(null);
    const pct = kind === 'percent' ? Number(percent) : NaN;
    const amt = kind === 'amount' ? Number(amount) : NaN;
    if (kind === 'percent' && (!Number.isFinite(pct) || pct <= 0 || pct > 100)) {
      setFormError('Percent off must be between 1 and 100.');
      return;
    }
    if (kind === 'amount' && (!Number.isFinite(amt) || amt <= 0)) {
      setFormError('Amount off must be more than $0.');
      return;
    }
    const mos = duration === 'repeating' ? Number(months) : NaN;
    if (duration === 'repeating' && (!Number.isFinite(mos) || mos < 1)) {
      setFormError('Repeating coupons need a month count of at least 1.');
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      ...(code.trim() ? { id: code.trim().toUpperCase() } : {}),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(kind === 'percent' ? { percent_off: pct } : { amount_off: amt }),
      duration,
      ...(duration === 'repeating' ? { duration_in_months: mos } : {}),
    };
    const r = await authed('/api/coupons/create', { method: 'POST', body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) {
      setFormError(r.error || 'Failed to create coupon');
      return;
    }
    setShowForm(false);
    setCode(''); setName(''); setPercent('20'); setAmount('5'); setDuration('once'); setMonths('3');
    void load();
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    const r = await authed('/api/coupons/delete', { method: 'POST', body: JSON.stringify({ couponId: id }) });
    setDeletingId(null);
    if (!r.ok) {
      setError(r.error || 'Failed to delete coupon');
      return;
    }
    void load();
  };

  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const projectRef = (() => {
    try {
      const host = new URL(supabaseUrl).hostname;
      return host.split('.')[0] || host;
    } catch { return supabaseUrl || 'not set'; }
  })();
  const envRows: { label: string; value: string; sensitive?: boolean }[] = [
    { label: 'API base URL', value: getEnvVar('VITE_API_BASE_URL') || '(same origin as web app)' },
    { label: 'Supabase project', value: projectRef },
    { label: 'Owner email', value: getEnvVar('VITE_OWNER_EMAIL') || 'not set' },
    { label: 'Stripe publishable key', value: mask(getEnvVar('VITE_STRIPE_PUBLISHABLE_KEY'), 7), sensitive: true },
    { label: 'Monthly price ID', value: getEnvVar('VITE_STRIPE_PRICE_ID_MONTHLY') || 'not set' },
    { label: 'Annual price ID', value: getEnvVar('VITE_STRIPE_PRICE_ID_ANNUAL') || 'not set' },
    { label: 'AI model', value: getEnvVar('VITE_AI_MODEL') || 'not set' },
    { label: 'PostHog analytics', value: getEnvVar('VITE_POSTHOG_KEY') ? 'configured' : 'not set' },
    { label: 'Turnstile captcha', value: getEnvVar('VITE_TURNSTILE_SITE_KEY') ? 'configured' : 'not set' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-[#8B5CF6]" />
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Settings</h1>
          <p className="text-[11px] text-zinc-500">Discount coupons and the environment this panel is pointed at.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs bg-red-500/5 border border-red-500/20 text-red-400">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Coupons */}
      <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[#8B5CF6]" /> Discount coupons
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#2A2A3A] text-[#7A7A96] hover:text-white text-[11px] font-medium transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => { setShowForm(v => !v); setFormError(null); }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#7C3AED] text-white text-[11px] font-medium hover:bg-[#6D28D9] transition-colors">
              {showForm ? <X size={12} /> : <Plus size={12} />} {showForm ? 'Cancel' : 'New coupon'}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4 p-4 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/[0.04] space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Code (optional — auto if blank)</span>
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  placeholder="WELCOME20"
                  className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-[#7C3AED]/50" />
              </label>
              <label className="block">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Display name</span>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Welcome discount"
                  className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/50" />
              </label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Discount type</span>
                <select value={kind} onChange={e => setKind(e.target.value as 'percent' | 'amount')}
                  className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/50">
                  <option value="percent">Percent off</option>
                  <option value="amount">Amount off (USD)</option>
                </select>
              </label>
              {kind === 'percent' ? (
                <label className="block">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Percent (1–100)</span>
                  <input value={percent} onChange={e => setPercent(e.target.value)} inputMode="decimal"
                    className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white tabular-nums focus:outline-none focus:border-[#7C3AED]/50" />
                </label>
              ) : (
                <label className="block">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Dollars off</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
                    className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white tabular-nums focus:outline-none focus:border-[#7C3AED]/50" />
                </label>
              )}
              <label className="block">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Duration</span>
                <select value={duration} onChange={e => setDuration(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/50">
                  <option value="once">Once</option>
                  <option value="forever">Forever</option>
                  <option value="repeating">Repeating</option>
                </select>
              </label>
            </div>
            {duration === 'repeating' && (
              <label className="block max-w-[200px]">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Repeat months</span>
                <input value={months} onChange={e => setMonths(e.target.value)} inputMode="numeric"
                  className="mt-1 w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white tabular-nums focus:outline-none focus:border-[#7C3AED]/50" />
              </label>
            )}
            {formError && <p className="text-[11px] text-red-400">{formError}</p>}
            <button onClick={create} disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-[#7C3AED] text-white text-[11px] font-medium hover:bg-[#6D28D9] transition-colors disabled:opacity-50">
              <Check size={12} /> {saving ? 'Creating…' : 'Create coupon'}
            </button>
          </div>
        )}

        {loading && coupons.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-zinc-500 text-xs">Loading coupons…</div>
        ) : coupons.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-zinc-500 text-xs">No coupons yet — create one above.</div>
        ) : (
          <div className="divide-y divide-[#2A2A3A]/60">
            {coupons.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium font-mono truncate">{c.id}</div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {c.name || 'Coupon'} · {couponLabel(c)} · {couponDuration(c)}
                    {c.valid === false ? ' · expired' : ''}
                    {c.times_redeemed != null ? ` · redeemed ×${c.times_redeemed}` : ''}
                  </div>
                </div>
                <button onClick={() => remove(c.id)} disabled={deletingId === c.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#2A2A3A] text-[#7A7A96] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 text-[10px] font-medium transition-colors">
                  <Trash2 size={11} /> {deletingId === c.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Environment */}
      <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
        <h2 className="text-xs font-semibold text-white mb-0.5 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-[#8B5CF6]" /> Environment
        </h2>
        <p className="text-[11px] text-zinc-500 mb-4">Read-only — which backend this panel is pointed at. Secrets never appear here.</p>
        <div className="divide-y divide-[#2A2A3A]/60">
          {envRows.map(r => (
            <div key={r.label} className="flex items-center justify-between gap-4 py-2">
              <span className="text-[11px] text-zinc-500">{r.label}</span>
              <span className={`text-[11px] font-mono truncate ${r.value === 'not set' ? 'text-amber-400' : 'text-zinc-200'}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
