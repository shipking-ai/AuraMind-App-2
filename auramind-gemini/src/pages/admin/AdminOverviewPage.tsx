/**
 * AdminOverviewPage — the /admin landing page ("Overview" in the sidebar).
 *
 * Aggregates endpoints the app already calls, no new backend:
 *   GET /api/admin/list              → users (role / plan / created / lastSignIn)
 *   GET /api/admin/test              → system diagnostics (same shape App Check parses)
 *   GET /api/admin/health/payments   → Stripe config/api/webhook snapshot
 *
 * Sections: stat cards (total users, staff incl. tester, paid plans, active
 * in the last 7 days), role + plan breakdowns, 5 newest signups, a compact
 * system-health strip, and quick links to Users / App Check.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, RefreshCw, Users, Shield, CreditCard, Activity,
  Check, AlertTriangle, ArrowRight, Clock,
} from '@/components/icons';
import { requireSupabase } from '../../services/database/supabase';

interface FleetUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  lastSignIn?: string;
  created?: string;
}

interface HealthItem {
  ok: boolean;
  name: string;
  message?: string;
}

const API = () => import.meta.env.VITE_API_BASE_URL || '';

async function authGet(path: string): Promise<any> {
  const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
  if (!token) return { error: 'Not authenticated' };
  const res = await fetch(`${API()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? await res.json().catch(() => ({})) : { error: `HTTP ${res.status}` };
}

const STAFF_ROLES = new Set(['owner', 'ceo', 'admin', 'employee', 'tester']);
const PAID_PLANS = new Set(['pro']);

const roleColor = (r: string) =>
  r === 'owner' || r === 'ceo' ? 'bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/20'
  : r === 'admin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
  : r === 'tester' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
  : r === 'employee' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
  : 'bg-[#2A2A3A] text-[#7A7A96]';

const timeAgo = (iso?: string) => {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold text-white tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [users, setUsers] = useState<FleetUser[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, sysTest, payTest] = await Promise.all([
        authGet('/api/admin/list'),
        authGet('/api/admin/test'),
        authGet('/api/admin/health/payments'),
      ]);
      if (listRes.error || !Array.isArray(listRes.users)) {
        setError(listRes.error || 'Failed to load users');
      } else {
        setUsers(listRes.users.map((u: any) => ({
          id: u.id,
          email: u.email || 'unknown',
          name: u.name || u.email?.split('@')[0] || 'User',
          role: (u.role || 'user').toLowerCase(),
          plan: u.plan || 'Starter',
          lastSignIn: u.lastSignIn,
          created: u.created,
        })));
      }
      const items: HealthItem[] = [];
      (sysTest.tests || []).forEach((t: any) => {
        items.push({ ok: t.status === 'passed', name: t.name, message: t.message });
      });
      if (payTest && payTest.apiOk !== undefined) {
        items.push({ ok: !!payTest.configOk, name: 'Stripe config', message: payTest.configOk ? 'Key configured' : payTest.errors?.[0] || 'Not configured' });
        items.push({ ok: !!payTest.apiOk, name: 'Stripe API', message: `${(payTest.prices || []).length} prices listed` });
        items.push({ ok: !!payTest.webhookConfigured, name: 'Stripe webhook', message: payTest.webhookConfigured ? 'Endpoint configured' : 'No endpoint found' });
      }
      if (sysTest.error) items.push({ ok: false, name: 'Diagnostics', message: sysTest.error });
      setHealth(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staff = users.filter(u => STAFF_ROLES.has(u.role));
  const paid = users.filter(u => PAID_PLANS.has(u.plan.toLowerCase()));
  const active7d = users.filter(u => u.lastSignIn && Date.now() - new Date(u.lastSignIn).getTime() < 7 * 86400 * 1000);
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});
  const planCounts = users.reduce<Record<string, number>>((acc, u) => {
    const p = u.plan || 'Starter';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});
  const newest = [...users]
    .sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime())
    .slice(0, 5);
  const healthy = health.filter(h => h.ok).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-[#8B5CF6]" />
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Overview</h1>
            <p className="text-[11px] text-zinc-500">Fleet stats, newest signups, and system health at a glance.</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#7C3AED] text-white text-[11px] font-medium hover:bg-[#6D28D9] transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs bg-red-500/5 border border-red-500/20 text-red-400">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users size={13} />} label="Total users" value={loading ? '…' : String(users.length)} sub={`${staff.length} staff · ${users.length - staff.length} regular`} />
        <StatCard icon={<Shield size={13} />} label="Staff accounts" value={loading ? '…' : String(staff.length)} sub={staff.length ? staff.map(s => s.role).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'none yet'} />
        <StatCard icon={<CreditCard size={13} />} label="Paid plans" value={loading ? '…' : String(paid.length)} sub={Object.entries(planCounts).map(([p, n]) => `${p} ×${n}`).join(' · ') || 'all free'} />
        <StatCard icon={<Activity size={13} />} label="Active (7d)" value={loading ? '…' : String(active7d.length)} sub={`${healthy}/${health.length} health checks passing`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Role breakdown */}
        <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
          <h2 className="text-xs font-semibold text-white mb-3">Users by role</h2>
          <div className="flex flex-wrap gap-2">
            {Object.keys(roleCounts).length === 0 && <span className="text-xs text-zinc-500">{loading ? 'Loading…' : 'No users'}</span>}
            {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
              <span key={role} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${roleColor(role)}`}>
                {role}
                <span className="font-bold tabular-nums">×{n}</span>
              </span>
            ))}
          </div>
          <Link to="/admin/users" className="mt-4 inline-flex items-center gap-1 text-[11px] text-[#8B5CF6] hover:text-[#A78BFA] transition-colors">
            Manage users & roles <ArrowRight size={11} />
          </Link>
        </section>

        {/* System health snapshot */}
        <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
          <h2 className="text-xs font-semibold text-white mb-3">System health</h2>
          {health.length === 0 && <span className="text-xs text-zinc-500">{loading ? 'Loading…' : 'No results — see App Check'}</span>}
          <div className="space-y-1.5">
            {health.slice(0, 6).map((h, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs">
                {h.ok
                  ? <Check size={13} className="text-emerald-400 shrink-0" />
                  : <AlertTriangle size={13} className="text-red-400 shrink-0" />}
                <span className="text-zinc-200">{h.name}</span>
                {h.message && <span className="text-zinc-500 text-[10px] truncate">{h.message}</span>}
              </div>
            ))}
          </div>
          <Link to="/admin/check" className="mt-4 inline-flex items-center gap-1 text-[11px] text-[#8B5CF6] hover:text-[#A78BFA] transition-colors">
            Open full App Check <ArrowRight size={11} />
          </Link>
        </section>
      </div>

      {/* Newest signups */}
      <section className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
        <h2 className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5">
          <Clock size={13} className="text-zinc-500" /> Newest signups
        </h2>
        {newest.length === 0 && <span className="text-xs text-zinc-500">{loading ? 'Loading…' : 'No users yet'}</span>}
        <div className="divide-y divide-[#2A2A3A]/60">
          {newest.map(u => (
            <div key={u.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white font-medium truncate">{u.name}</div>
                <div className="text-[10px] text-zinc-500 truncate">{u.email}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${roleColor(u.role)}`}>{u.role}</span>
              <span className="text-[10px] text-zinc-500 w-16 text-right tabular-nums">{timeAgo(u.created)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
