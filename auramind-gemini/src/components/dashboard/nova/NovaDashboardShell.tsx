import React, { Suspense, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, BookOpen, Brain, Settings, GraduationCap, Sparkles,
  Search, Bell, Menu, X, Flame,
  Shield, Users, Activity, Play, LogOut,
} from '@/components/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDashboardWorkspace } from '../../../contexts/DashboardWorkspaceContext';
import { UserRole } from '../../../types';
import { AnimatedBrandMark, PulsingDot } from './icons';
import { PageTransition, Shimmer } from './motion';
import OnboardingTutorial from '../../shared/OnboardingTutorial';
import AndroidBottomNav from '../../native/AndroidBottomNav';
import AndroidMobileTopBar from '../../native/AndroidMobileTopBar';
import AndroidPullToRefresh from '../../native/AndroidPullToRefresh';
import { useAndroidScrollChrome } from '../../native/useAndroidScrollChrome';

const ANDROID_REFRESHABLE_PATHS = new Set(['/dashboard', '/dashboard/decks', '/dashboard/study']);
import { MobileWebBottomNav } from './MobileWebBottomNav';
import { Capacitor } from '../../../lib/nativeShim';

// ─── Navigation config ──────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: string;
}

interface NavSection {
  title: string;
  badge?: string;
  items: NavItem[];
}

const USER_NAV_SECTIONS: NavSection[] = [
  {
    title: 'Learn',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Library', icon: BookOpen, path: '/dashboard/decks' },
      { label: 'Study', icon: Brain, path: '/dashboard/study' },
    ],
  },
  {
    title: 'Create',
    items: [
      { label: 'Prof. Aura', icon: GraduationCap, path: '/dashboard/chat' },
      { label: 'Generator', icon: Sparkles, path: '/dashboard/generator' },
    ],
  },
];

// Admin nav links are limited to routes that actually exist in App.tsx —
// advertising unbuilt pages just produces 404s for admins. Extend this list
// when new admin routes ship (currently: /admin, /admin/users, /admin/check).
const ADMIN_VAULT_SECTION: NavSection = {
  title: 'Admin',
  badge: 'ADMIN',
  items: [
    { label: 'Overview', icon: Shield, path: '/admin' },
    { label: 'Users', icon: Users, path: '/admin/users' },
    { label: 'App Check', icon: Activity, path: '/admin/check' },
  ],
};

function buildAdminNavSections(_role: UserRole | undefined): NavSection[] {
  // Single real section today; role gating returns when tiered admin pages ship.
  return [ADMIN_VAULT_SECTION];
}

// ─── Background layers ──────────────────────────────────────────────────────

function FloatingOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-[0.07]"
        style={{
          background: 'radial-gradient(circle at center, rgba(124,58,237,0.5), transparent 70%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.05, 0.95, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-48 top-1/3 h-[420px] w-[420px] rounded-full opacity-[0.06]"
        style={{
          background: 'radial-gradient(circle at center, rgba(34,211,238,0.45), transparent 70%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, -40, 20, 0], y: [0, 30, -20, 0], scale: [1, 0.95, 1.05, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-32 left-1/4 h-[380px] w-[380px] rounded-full opacity-[0.05]"
        style={{
          background: 'radial-gradient(circle at center, rgba(236,72,153,0.4), transparent 70%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, 20, -30, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function AuroraGradient({ admin }: { admin: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: admin
            ? 'radial-gradient(60% 50% at 20% 0%, rgba(254,205,211,0.18) 0%, transparent 60%),' +
              'radial-gradient(50% 40% at 80% 30%, rgba(252,165,165,0.16) 0%, transparent 70%),' +
              'radial-gradient(70% 60% at 60% 100%, rgba(251,191,36,0.10) 0%, transparent 70%)'
            : 'radial-gradient(60% 50% at 18% 0%, rgba(196,181,253,0.24) 0%, transparent 58%),' +
              'radial-gradient(50% 42% at 88% 28%, rgba(244,114,182,0.14) 0%, transparent 68%),' +
              'radial-gradient(70% 55% at 55% 100%, rgba(34,211,238,0.14) 0%, transparent 68%)',
        }}
      />
      <div className="absolute inset-0 nova-page-grid opacity-35" />
    </div>
  );
}

// ─── Sidebar Nav Button ─────────────────────────────────────────────────────

function NavBtn({
  item,
  active,
  dueCount,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  dueCount?: number;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const Icon = item.icon;
  const handleClick = onClick ?? (() => navigate(item.path));

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#3247E8] ${
        active
          ? 'bg-gradient-to-r from-violet-500/30 via-violet-500/10 to-transparent font-semibold text-white'
          : 'font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'
      }`}
    >
      {active && (
        <motion.div
          layoutId="navActive"
          className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-gradient-to-b from-violet-300 to-fuchsia-500"
          style={{ boxShadow: '0 0 14px rgba(167,139,250,0.55)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-violet-200' : 'text-zinc-500 group-hover:text-zinc-300'}`} aria-hidden />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {item.badge && (
        <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-300">
          {item.badge}
        </span>
      )}
      {dueCount !== undefined && dueCount > 0 && (
        <span
          className="rounded-md bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-cyan-200"
          aria-label={`${dueCount} cards due`}
        >
          {dueCount}
        </span>
      )}
    </button>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
  mobile,
  onClose,
  isAdminRoute,
  sections,
  brand,
}: {
  mobile?: boolean;
  onClose?: () => void;
  isAdminRoute: boolean;
  sections: NavSection[];
  brand: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const cards = workspace?.cards || [];
  const totalDue = cards.filter(c => (c.nextReview ?? 0) <= Date.now()).length;

  const isActive = (path: string) => {
    if (path === '/dashboard' || path === '/admin') return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  return (
    <aside
      className={`${
        mobile
          ? 'fixed inset-0 z-50 nova-chrome border-r border-white/[0.08]'
          : 'flex h-screen w-[252px] shrink-0 flex-col nova-chrome border-r border-white/[0.08]'
      } flex flex-col`}
      role="navigation"
      aria-label={isAdminRoute ? 'Administrative navigation' : 'Primary navigation'}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex items-center gap-3">{brand}</div>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {!isAdminRoute && (
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => {
              if (workspace?.decks.length) workspace.startQuickStudy();
              else handleNav('/dashboard/decks');
              onClose?.();
            }}
            className="nova-cta w-full"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
            {totalDue > 0 ? `Study ${totalDue} due` : 'Start session'}
          </button>
        </div>
      )}

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" role="list">
        {sections.map(section => (
          <div key={section.title} role="listitem">
            <div className="mb-2 flex items-center gap-2 px-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                {section.title}
              </span>
              {section.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                    section.badge === 'ADMIN'
                      ? 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
                      : section.badge === 'CEO+'
                        ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                        : section.badge === 'OWNER'
                          ? 'border border-violet-500/20 bg-violet-500/10 text-violet-400'
                          : 'border border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
                  }`}
                >
                  {section.badge}
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavBtn
                  key={item.path}
                  item={item}
                  active={isActive(item.path)}
                  dueCount={
                    !isAdminRoute &&
                    item.path === '/dashboard/study' &&
                    !location.pathname.startsWith('/dashboard/study')
                      ? totalDue
                      : undefined
                  }
                  onClick={() => handleNav(item.path)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-white/[0.06] px-3 py-3">
        <button
          type="button"
          onClick={() => handleNav(isAdminRoute ? '/admin' : '/dashboard/settings')}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-zinc-500 transition-all hover:bg-white/[0.04] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">{isAdminRoute ? 'Admin Settings' : 'Settings'}</span>
        </button>
        {workspace?.onLogout && (
          <button
            type="button"
            onClick={() => workspace.onLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-zinc-500 transition-all hover:bg-white/[0.04] hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────

function TopBar({
  onMenuClick,
  user,
  isAdmin,
}: {
  onMenuClick: () => void;
  user: { name?: string; email?: string; streak?: number } | null | undefined;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const initials =
    user?.name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'AM';

  const due = workspace?.cards.filter(c => (c.nextReview ?? 0) <= Date.now()).length ?? 0;

  return (
    <header
      role="banner"
      aria-label="Application header"
      className={`flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 nova-chrome lg:px-7 ${
        isAdmin ? 'border-rose-500/20' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div
          className={`relative hidden transition-all duration-300 sm:block ${
            searchFocused ? 'w-80' : 'w-64'
          }`}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            role="searchbox"
            aria-label="Search decks, achievements, and tools"
            placeholder="Search decks, tools…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isAdmin && (
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (workspace?.decks.length) workspace.startQuickStudy();
              else navigate('/dashboard/decks');
            }}
            className="nova-cta hidden !py-2 !text-xs sm:inline-flex"
          >
            <Play className="h-3 w-3 fill-current" aria-hidden />
            {due > 0 ? `Study ${due}` : 'Study'}
          </motion.button>
        )}

        {(user?.streak ?? 0) > 0 && (
          <div className="hidden items-center gap-1.5 rounded-xl border border-amber-400/15 bg-amber-400/10 px-2.5 py-1.5 md:flex">
            <Flame className="h-3.5 w-3.5 text-amber-300" aria-hidden />
            <span className="text-xs font-bold tabular-nums text-amber-100">{user?.streak}</span>
          </div>
        )}

        <button
          type="button"
          className="relative rounded-xl p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => navigate('/dashboard/settings')}
          aria-label={`Account menu for ${user?.name ?? 'user'}`}
          className="ml-1 flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-lg ${
              isAdmin
                ? 'bg-gradient-to-br from-rose-500 to-amber-500 shadow-rose-500/25'
                : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-violet-500/25'
            }`}
            aria-hidden
          >
            <span className="text-[11px] font-bold text-white">{initials}</span>
          </div>
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-zinc-200 md:block">
            {user?.name || 'User'}
          </span>
        </button>
      </div>
    </header>
  );
}

function RouteFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading route content">
      <div className="h-48 overflow-hidden rounded-3xl bg-white/[0.04]">
        <Shimmer />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-28 overflow-hidden rounded-2xl bg-white/[0.04]">
            <Shimmer />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-64 overflow-hidden rounded-2xl bg-white/[0.04] lg:col-span-3">
          <Shimmer />
        </div>
        <div className="h-64 overflow-hidden rounded-2xl bg-white/[0.04] lg:col-span-2">
          <Shimmer />
        </div>
      </div>
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#nova-main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-[1000] focus-visible:rounded-lg focus-visible:bg-violet-600 focus-visible:px-4 focus-visible:py-2 focus-visible:text-white focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      Skip to main content
    </a>
  );
}

// ─── NovaDashboardShell ─────────────────────────────────────────────────────

interface NovaDashboardShellProps {
  children: React.ReactNode;
}

function isImmersivePath(pathname: string): boolean {
  // Full-bleed study runtime: /dashboard/study/:deckId (not the picker).
  if (/^\/dashboard\/study\/[^/]+/.test(pathname)) return true;
  return false;
}

function isBleedPath(pathname: string): boolean {
  // Fill the content column edge-to-edge (keep chrome, drop max-width padding).
  if (pathname === '/dashboard/chat') return true;
  return isImmersivePath(pathname);
}

// ─── FirstRunGate ───────────────────────────────────────────────────────────
// Shows the onboarding tour once, to genuinely new users: no completedTutorials
// flag has ever been written and they don't own any decks yet. Skipping or
// completing the tour marks the flag, so it can't re-open on every visit.

const FIRST_RUN_FLAG = 'auramind:completedTutorials';

function readFirstRunFlag(): boolean {
  try {
    const stored = localStorage.getItem(FIRST_RUN_FLAG);
    if (!stored) return false;
    const completed: unknown[] = JSON.parse(stored);
    return Array.isArray(completed) && completed.includes('onboarding');
  } catch {
    return false;
  }
}

function FirstRunGate() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  React.useEffect(() => {
    if (checked) return;
    // Only run on the non-admin dashboard hub; study/:deckId is immersive and
    // shouldn't fight the tour for focus.
    if (location.pathname.startsWith('/admin')) return;
    if (readFirstRunFlag()) {
      setChecked(true);
      return;
    }
    // Give the dashboard a beat to mount before the modal pops over it.
    const t = window.setTimeout(() => {
      setOpen(true);
      setChecked(true);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!open) return null;
  return (
    <OnboardingTutorial
      isOpen
      onClose={() => setOpen(false)}
      onComplete={() => setOpen(false)}
    />
  );
}

export function NovaDashboardShell({ children }: NovaDashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isOnAdminRoute = location.pathname.startsWith('/admin');
  const immersive = isImmersivePath(location.pathname);
  const bleed = isBleedPath(location.pathname);
  const workspace = useDashboardWorkspace();
  const user = workspace?.user;
  const isAndroidApp = Capacitor.getPlatform() === 'android';
  const isAndroidMobile = isAndroidApp && !isOnAdminRoute && !immersive;
  const showAndroidBottomNav = isAndroidMobile;
  const showMobileWebNav = !isAndroidApp && !isOnAdminRoute && !immersive;
  const { scrolled, navHidden } = useAndroidScrollChrome(
    'nova-main-content',
    isAndroidMobile && !bleed,
    location.pathname,
  );
  // Swipe-to-refresh belongs on the list screens. Chat, the generator and
  // settings have their own scrolling inputs a pull would fight with.
  const canPullToRefresh =
    isAndroidMobile && ANDROID_REFRESHABLE_PATHS.has(location.pathname.replace(/\/$/, ''));

  const sections = useMemo<NavSection[]>(
    () => (isOnAdminRoute ? buildAdminNavSections(user?.role) : USER_NAV_SECTIONS),
    [isOnAdminRoute, user?.role],
  );

  const brand = (
    <>
      <AnimatedBrandMark variant={isOnAdminRoute ? 'admin' : 'user'} size={34} />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">
          {isOnAdminRoute ? (
            <>
              Vault<span className="text-rose-300">.</span>
            </>
          ) : (
            <>
              Aura<span className="bg-gradient-to-r from-violet-200 to-fuchsia-300 bg-clip-text text-transparent font-script font-normal tracking-normal">Mind</span>
            </>
          )}
        </div>
        {!isOnAdminRoute && (
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            <PulsingDot size={4} color="#22D3EE" />
            Focus mode
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`nova-shell relative flex h-screen overflow-hidden bg-transparent text-white ${isAndroidMobile ? 'android-mobile-shell' : ''} ${scrolled ? 'is-scrolled' : ''} ${navHidden ? 'is-nav-hidden' : ''}`}
    >
      <SkipLink />
      <AuroraGradient admin={isOnAdminRoute} />
      <FloatingOrbs />

      {!immersive && !isAndroidMobile && (
        <div className="hidden lg:flex">
          <Sidebar isAdminRoute={isOnAdminRoute} sections={sections} brand={brand} />
        </div>
      )}

      <AnimatePresence>
        {!immersive && !isAndroidMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative"
            >
              <Sidebar
                mobile
                isAdminRoute={isOnAdminRoute}
                onClose={() => setSidebarOpen(false)}
                sections={sections}
                brand={brand}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex min-w-0 flex-1 flex-col ${isAndroidMobile ? 'android-mobile-app-column' : ''}`}>
        {!immersive && (
          isAndroidMobile ? (
            <AndroidMobileTopBar user={user} />
          ) : (
            <TopBar onMenuClick={() => setSidebarOpen(true)} user={user} isAdmin={isOnAdminRoute} />
          )
        )}
        <main
          id="nova-main-content"
          role="main"
          aria-label="Main content"
          className={`scrollbar-thin flex-1 ${bleed ? 'overflow-hidden' : 'overflow-y-auto'} ${showAndroidBottomNav ? 'android-mobile-main pb-24' : ''} ${showMobileWebNav ? 'pb-20' : ''}`}
        >
          <div
            className={
              isAndroidMobile
                ? bleed
                  ? 'android-mobile-bleed'
                  : 'android-mobile-content'
                : bleed
                  ? 'flex h-full min-h-0 flex-col'
                  : 'mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8'
            }
          >
            <Suspense fallback={<RouteFallback />}>
              <PageTransition pathname={location.pathname}>{children}</PageTransition>
            </Suspense>
          </div>
        </main>
        {canPullToRefresh && <AndroidPullToRefresh scrollerId="nova-main-content" />}
      </div>
      {isAndroidMobile && <AndroidBottomNav />}
      {showMobileWebNav && <MobileWebBottomNav />}
      <FirstRunGate />
    </div>
  );
}
