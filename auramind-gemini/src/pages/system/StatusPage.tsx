import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type Health = {
  status: string;
  service?: string;
  version?: string;
  timestamp?: number;
  database?: { status: string; latencyMs?: number; authResponded?: boolean };
};

type ComponentState = 'operational' | 'degraded' | 'down' | 'checking';

interface ComponentRow {
  key: string;
  name: string;
  description: string;
  state: ComponentState;
  detail?: string;
}

function stateColor(state: ComponentState): string {
  switch (state) {
    case 'operational': return 'bg-emerald-400';
    case 'degraded': return 'bg-amber-400';
    case 'down': return 'bg-red-400';
    default: return 'bg-zinc-500 animate-pulse';
  }
}

function stateLabel(state: ComponentState): string {
  switch (state) {
    case 'operational': return 'Operational';
    case 'degraded': return 'Degraded';
    case 'down': return 'Down';
    default: return 'Checking…';
  }
}

/**
 * Public status page (/status) — what uptime monitors and users see.
 * Backed by the public /api/health endpoint (no auth); `probe=db` makes the
 * API verify its Supabase connection. Auto-refreshes every 60 seconds so an
 * open tab converges on reality without a manual reload.
 */
const StatusPage: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiState, setApiState] = useState<ComponentState>('checking');
  const [dbState, setDbState] = useState<ComponentState>('checking');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setApiState('checking');
    setDbState('checking');
    // Web app component: this page rendering IS the check.
    // API component: plain health hit.
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        setHealth(await res.json());
        setApiState('operational');
      } else {
        setApiState('degraded');
      }
    } catch {
      setApiState('down');
    }
    // Database component: API probes Supabase server-side (no keys in browser).
    try {
      const res = await fetch(`${API_BASE}/api/health?probe=db`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        setDbState(data.database?.status === 'reachable' ? 'operational' : 'degraded');
        setHealth(data);
      } else if (res.status === 503) {
        setDbState('down');
      } else {
        setDbState('degraded');
      }
    } catch {
      setDbState('down');
    }
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const components: ComponentRow[] = [
    { key: 'web', name: 'Web App', description: 'bonamind.app dashboard and study experience', state: 'operational' },
    { key: 'api', name: 'API', description: 'Authentication, billing, AI proxy, and sync endpoints', state: apiState },
    { key: 'db', name: 'Database', description: 'Supabase Postgres — accounts, decks, review history', state: dbState },
  ];

  const overall: ComponentState = components.some((c) => c.state === 'down')
    ? 'down'
    : components.some((c) => c.state === 'degraded' || c.state === 'checking')
      ? 'degraded'
      : 'operational';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#F0EFFE] flex flex-col">
      <div className="px-6 py-4">
        <Link to="/" className="flex items-center gap-2 text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors">
          <span>←</span><span>Back to home</span>
        </Link>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-6 pb-20">
        <h1 className="text-2xl font-light tracking-tight mb-1">System status</h1>
        <p className="text-[#7A7A96] text-xs mb-8">
          Live health of BonaMind's services{checkedAt ? ` · checked ${checkedAt.toLocaleTimeString()}` : ''}
        </p>

        {/* Overall banner */}
        <div
          className={`rounded-xl border p-5 mb-8 ${
            overall === 'operational'
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : overall === 'degraded'
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-red-500/20 bg-red-500/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${stateColor(overall)}`} />
            <div>
              <p className="text-sm font-medium">
                {overall === 'operational' ? 'All systems operational' : overall === 'degraded' ? 'Some systems degraded' : 'Service disruption'}
              </p>
              <p className="text-[#7A7A96] text-xs">
                {health?.version ? `API v${health.version}` : 'Awaiting first successful check'}
              </p>
            </div>
          </div>
        </div>

        {/* Components */}
        <div className="space-y-3">
          {components.map((c) => (
            <div key={c.key} className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[#7A7A96] text-xs truncate">{c.description}</p>
                {c.detail && <p className="text-[#7A7A96] text-xs mt-1">{c.detail}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`w-2 h-2 rounded-full ${stateColor(c.state)}`} />
                <span className="text-xs text-[#9090A8]">{stateLabel(c.state)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Incident history */}
        <div className="mt-10">
          <h2 className="text-sm font-medium text-[#F0EFFE] mb-3">Past incidents</h2>
          <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-4">
            <p className="text-[#7A7A96] text-xs">No incidents reported.</p>
          </div>
          <p className="text-[#7A7A96] text-[11px] mt-4 leading-relaxed">
            Experiencing an issue not shown here? Contact{' '}
            <a href="mailto:hello@bonamind.app" className="text-[#8B5CF6] hover:text-[#7C3AED]">hello@bonamind.app</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;
