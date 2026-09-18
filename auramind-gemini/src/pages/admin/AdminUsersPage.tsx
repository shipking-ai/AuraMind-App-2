/**
 * AdminUsersPage — manage every AuraMind account:
 *   - search users by email
 *   - change role / plan / subscription status
 *   - delete a user (with confirm)
 *   - refresh the fleet
 *
 * Wires to the existing backend:
 *   GET  /api/admin/list      → list users
 *   POST /api/admin/utility    → set_role / set_subscription / delete_user
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, RefreshCw, Edit3, Trash2, Check, X, AlertTriangle, Users,
} from '@/components/icons';
import { requireSupabase } from '../../services/database/supabase';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  subscriptionStatus: string;
  lastSignIn: string;
  created: string;
}

const API = () => import.meta.env.VITE_API_BASE_URL || '';

async function apiCall(path: string, init?: RequestInit): Promise<{ ok: boolean; json?: any; error?: string }> {
  const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
  if (!token) return { ok: false, error: 'Not authenticated' };
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, json } : { ok: false, error: json.error || `HTTP ${res.status}` };
}

const planColor = (p: string) =>
  p === 'Pro' || p === 'pro' ? 'bg-[#7C3AED]/10 text-[#8B5CF6] border border-[#7C3AED]/20'
  : p === 'Scholar' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
  : 'bg-[#2A2A3A] text-[#7A7A96]';

const statusColor = (s: string) =>
  s === 'active' || s === 'trialing' ? 'bg-emerald-500/10 text-emerald-400'
  : s === 'past_due' ? 'bg-orange-500/10 text-orange-400'
  : s === 'canceled' ? 'bg-red-500/10 text-red-400'
  : 'bg-[#2A2A3A] text-[#7A7A96]';

const roleColor = (r: string) =>
  r === 'owner' || r === 'ceo' ? 'bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/20'
  : r === 'admin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
  : r === 'tester' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
  : 'bg-[#2A2A3A] text-[#7A7A96]';

const fmt = (iso?: string) => {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiCall('/api/admin/list', { method: 'GET' });
    if (r.ok && r.json?.users) {
      setUsers((r.json.users as any[]).map((u: any) => ({
        id: u.id, email: u.email || 'unknown', name: u.name || u.email?.split('@')[0] || 'User',
        role: u.role || 'user', plan: u.plan || 'Starter',
        subscriptionStatus: u.subscriptionStatus || 'none',
        lastSignIn: u.lastSignIn, created: u.created,
      })));
    } else {
      setError(r.error || 'Failed to load users');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase())
  );

  const del = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const r = await apiCall('/api/admin/utility', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_user', targetUserId: id }),
    });
    if (r.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
    } else {
      setError(r.error || 'Failed to delete user');
    }
    setDeletingId(null);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const roleRes = await apiCall('/api/admin/utility', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_role', targetUserId: editing.id, testData: { role: editing.role } }),
      });
      if (!roleRes.ok && roleRes.error) throw new Error(`Role: ${roleRes.error}`);
      const subRes = await apiCall('/api/admin/utility', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_subscription', targetUserId: editing.id, testData: { status: editing.subscriptionStatus, plan: editing.plan } }),
      });
      if (!subRes.ok && subRes.error) throw new Error(`Subscription: ${subRes.error}`);
      setEditing(null);
      await load();
    } catch (err: any) {
        setError(err.message);
    } finally {
        setSaving(false);
    }
  };

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#8B5CF6]" />
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">Users</h1>
              <p className="text-[11px] text-zinc-500">Manage the AuraMind fleet — roles, plans, subscriptions, access.</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#111118] border border-[#2A2A3A] text-[11px] font-medium text-zinc-400 hover:text-white hover:border-[#3A3A4F] transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20 text-red-300 text-xs">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users by email or name…"
            className="w-full pl-9 pr-4 py-2.5 bg-[#111118] border border-[#2A2A3A] rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#7C3AED]/40 transition-colors"
          />
        </div>

        {/* Table */}
        <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#2A2A3A]">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Subscription</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500 text-xs">Loading users…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500 text-xs">No users match “{search}”.</td></tr>
              )}
              {!loading && filtered.map(u => (
                <tr key={u.id} className="border-b border-[#2A2A3A]/30 text-xs hover:bg-[#1A1A24] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED]/30 to-[#3B82F6]/20 border border-[#2A2A3A] flex items-center justify-center text-[10px] font-bold text-[#A78BFA]">
                        {u.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-white font-medium">{u.name}</div>
                        <div className="text-zinc-500 text-[10px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleColor(u.role)}`}>{u.role}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${planColor(u.plan)}`}>{u.plan}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(u.subscriptionStatus)}`}>{u.subscriptionStatus}</span></td>
                  <td className="px-4 py-3 text-zinc-500">{fmt(u.created)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing({ ...u })} className="p-1.5 rounded-lg bg-[#2A2A3A] text-zinc-400 hover:text-white hover:bg-[#7C3AED]/20 transition-colors" title="Edit">
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Delete user ${u.email}? This is permanent.`)) del(u.id); }}
                        disabled={deletingId === u.id}
                        className="p-1.5 rounded-lg bg-[#2A2A3A] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Delete">
                        {deletingId === u.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <div className="w-full max-w-md bg-[#111118] border border-[#2A2A3A] rounded-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Edit {editing.email}</h3>
                <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
              </div>
              <div className="space-y-4">
                <Field label="Role">
                  <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })} className="w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/40 transition-colors">
                    <option value="user">User</option>
                    <option value="tester">Tester</option>
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                    <option value="ceo">CEO</option>
                    <option value="owner">Owner</option>
                  </select>
                </Field>
                <Field label="Plan">
                  <select value={editing.plan} onChange={e => setEditing({ ...editing, plan: e.target.value })} className="w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/40 transition-colors">
                    <option value="Starter">Starter (Free)</option>
                    <option value="Pro">Pro</option>
                    <option value="Scholar">Scholar</option>
                  </select>
                </Field>
                <Field label="Subscription Status">
                  <select value={editing.subscriptionStatus} onChange={e => setEditing({ ...editing, subscriptionStatus: e.target.value })} className="w-full px-3 py-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl text-xs text-white focus:outline-none focus:border-[#7C3AED]/40 transition-colors">
                    <option value="none">None</option>
                    <option value="active">Active</option>
                    <option value="trialing">Trialing</option>
                    <option value="past_due">Past Due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </Field>
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t border-[#2A2A3A]/30">
                <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 rounded-xl bg-[#2A2A3A] text-white text-[11px] font-medium hover:bg-[#3A3A4F] transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-[11px] font-bold hover:bg-[#6D28D9] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}