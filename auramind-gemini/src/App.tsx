import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Deck, Card, UserProfile, UserRole } from "./types";
import { getInitialCardState } from "./services/study/srs";
import { dbService } from "./services/database/dbService";
import {
  createMetadataTemplates,
  mergeCardMetadata,
  persistCardMetadata,
} from "./services/study/roadmapService";
import { syncCurrentUser } from "./services/database/syncUser";
import {
  cacheDeckForOffline,
  getCachedCards,
  getCachedDecks,
  isOnline,
} from "./services/offline/offlineStudyService";
import { storeSubscriptionStatus, subscriptionFallback } from "./lib/offlineSubscriptionStatus";
import { loadOfflineAwareData } from "./lib/offlineAwareData";
import { getAppPreference } from "./lib/appPreferences";
import { resetUserData } from "./services/gamification/gamificationService";
import { analyticsService } from "./services/analytics/analyticsService";
import {
  getPermissions,
  getDefaultRole,
  resolveAuthorizationRole,
} from "./utils/permissions";
import { addNotification } from "./services/notifications/notificationStore";
import {
  initRealtimeNotifications,
  destroyRealtimeNotifications,
} from "./services/notifications/realtimeNotifications";
import { checkReducedMotion } from "./styles/animations/awe";
import {
  getPageTransitionVariant,
  isMarketingRoute,
  type PageTransitionVariant,
} from "./lib/motion";
import "./styles/design-tokens.css";
import { LayoutProvider } from "./contexts/LayoutContext";
import { AchievementProvider } from "./components/achievements/AchievementUnlock";
import ReducedMotionGuard from "./components/shared/ReducedMotionGuard";
import StreakBurst from "./components/gamification/StreakBurst";
import Announcer from "./components/shared/Announcer";
import { GenericPageSkeleton } from "./components/shared/RouteSkeleton";
import { SkeletonProvider } from "./components/shared/SkeletonProvider";

const AmbientPlayer = React.lazy(() => import("./components/shared/AmbientPlayer"));
import HmrRefreshNotice from "./components/shared/HmrRefreshNotice";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import PuterQuotaBanner from "./components/shared/PuterQuotaBanner";
import CookieConsentBanner from "./components/shared/CookieConsentBanner";
import { KeyboardAware } from "./components/shared/KeyboardAware";
import NativeRuntime from "./components/native/NativeRuntime";
import BiometricGate from "./components/native/BiometricGate";
import { initPushListeners } from "./services/notifications/pushService";
import { App as NativeApp, Capacitor, SplashScreen } from "./lib/nativeShim";
import { useReminderSync } from "./hooks/useReminderSync";
import { useSparkSync } from "./hooks/useSparkSync";
import { useShareTarget } from "./hooks/useShareTarget";
import QuizGenerationNotifier from "./components/notifications/QuizGenerationNotifier";
import { Toaster, toast } from "./components/ui/sonner";
import { ThemeProvider } from "./hooks/useTheme";
import { supabase, requireSupabase } from "./services/database/supabase";
import { CommandPalette } from "./components/auramind/CommandPalette";
import { CinematicLoader } from "./components/ui/CinematicLoader";
import { CustomCursor } from "./components/ui/CustomCursor";
import { registerWorkspaceRefresh } from "./lib/workspaceRefresh";
import { readClientEnv } from "./lib/env";

function loadWorkspaceData(userId: string) {
  return loadOfflineAwareData(userId, {
    online: isOnline(),
    offlineMode: getAppPreference("auramind_offlineMode", false),
    autoSync: getAppPreference("auramind_autoSync", true),
    getCachedDecks,
    getCachedCards,
    fetchDecks: (id) => dbService.fetchDecks(id),
    fetchCards: (id) => dbService.fetchCards(id),
    cacheDeck: cacheDeckForOffline,
    syncUser: syncCurrentUser,
  });
}

if (typeof window !== "undefined" && !window.requestIdleCallback) {
  window.requestIdleCallback = function (
    callback: IdleRequestCallback,
    options?: { timeout?: number },
  ) {
    const start = Date.now();
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, options?.timeout || 1) as unknown as number;
  };
  window.cancelIdleCallback = function (id: number) {
    clearTimeout(id);
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  ROUTE-LEVEL LAZY IMPORTS
//
//  Two hubs own the authenticated product surface:
//   • NovaHub   — every /dashboard/* path (overview, tools, study, etc.)
//   • AdminHub  — every /admin/* path, inside the same Nova shell chrome
// ─────────────────────────────────────────────────────────────────────────

const NovaHub = React.lazy(() => import("./pages/dashboard/NovaHub"));
const AdminHub = React.lazy(() => import("./pages/admin/AdminHub"));
const AdminOverviewRoute = React.lazy(() => import("./pages/admin/AdminOverviewPage"));
const AdminSettingsRoute = React.lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminUsersRoute = React.lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminAppCheckRoute = React.lazy(() => import("./pages/admin/AdminAppCheckPage"));

const AuraLandingPage = React.lazy(() => import("./components/landing/ModernLandingPage"));
const AndroidWelcomeScreen = React.lazy(() => import("./components/native/AndroidWelcomeScreen"));
const IOSWelcomeScreen = React.lazy(() => import("./components/ios/IOSWelcomeScreen"));
const AndroidVisualPreview = React.lazy(() => import("./components/native/AndroidVisualPreview"));
const IOSVisualPreview = React.lazy(() => import("./components/ios/IOSVisualPreview"));
// Sample-data iPhone screens for CI screenshots; never set in a release build.
const IOS_PREVIEW_ENABLED = import.meta.env.DEV || readClientEnv("VITE_IOS_PREVIEW") === "true";
const AuthPage = React.lazy(() => import("./components/auth/AuthPage"));
const DeckDetailRoute = React.lazy(() => import("./pages/deck/DeckDetailRoute"));
const DocsPage = React.lazy(() => import("./pages/legal/DocsPage"));
const PrivacyPolicyPage = React.lazy(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsOfServicePage = React.lazy(() => import("./pages/legal/TermsOfServicePage"));
const AboutPage = React.lazy(() => import("./pages/system/AboutPage"));
const StatusPage = React.lazy(() => import("./pages/system/StatusPage"));
const ResetPasswordPage = React.lazy(() => import("./pages/auth/ResetPasswordPage"));
const RestoreAccountPage = React.lazy(() => import("./pages/auth/RestoreAccountPage"));
const CallbackPage = React.lazy(() => import("./pages/auth/CallbackPage"));
const SchoologyCallbackPage = React.lazy(() => import("./pages/auth/SchoologyCallbackPage"));
const NotFoundPage = React.lazy(() => import("./pages/NotFoundPage"));
const PaymentPage = React.lazy(() => import("./components/auth/PaymentPage"));
const OnboardingFlow = React.lazy(() => import("./pages/onboarding/OnboardingFlow"));
const DownloadPage = React.lazy(() => import("./pages/DownloadPage"));

import { ArrowDownIcon as ArrowDown } from "./components/icons/CustomIcons";

const ScrollTopButton = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-32 md:bottom-10 right-10 w-16 h-16 border border-border bg-background/80 text-muted-foreground flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all z-50 group backdrop-blur-xl rounded-[20px] shadow-2xl"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          aria-label="Scroll to top"
        >
          <ArrowDown
            size={20}
            className="rotate-180 group-hover:-translate-y-1 transition-transform"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

const ProtectedRoute = ({
  user,
  status,
  onLogout: _onLogout,
  useLayout = true,
  children,
}: {
  user: UserProfile | null;
  status: "active" | "trialing" | "canceled" | "past_due" | "none" | "loading";
  onLogout: () => void;
  useLayout?: boolean;
  children?: React.ReactNode;
}) => {
  if (status === "loading") {
    return null;
  }
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  if (!user.isEmailVerified && !user.isPhoneVerified) {
    return <Navigate to="/auth" replace />;
  }
  if (status !== "active" && status !== "trialing") {
    return <Navigate to="/subscribe" replace />;
  }
  if (useLayout) {
    return <div className="min-h-screen bg-zinc-950">{children ?? <Outlet />}</div>;
  }
  return <Outlet />;
};

const PageTransition = ({
  children,
  variant = "full",
}: {
  children: React.ReactNode;
  variant?: PageTransitionVariant;
}) => {
  if (variant === "none" || checkReducedMotion()) {
    return <div className="min-h-screen relative">{children}</div>;
  }
  if (variant === "lite") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] as const }}
        className="min-h-screen relative"
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const },
      }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const } }}
      className="min-h-screen gpu-accelerated relative"
    >
      {children}
    </motion.div>
  );
};

const StreakBurstMount = () => {
  const [streak, setStreak] = useState<number>(0);
  React.useEffect(() => {
    const onUpdate = (e: Event) => {
      const value = (e as CustomEvent<{ streak: number }>).detail?.streak;
      if (typeof value === "number") setStreak(value);
    };
    window.addEventListener("auraMind:streak", onUpdate as EventListener);
    return () => window.removeEventListener("auraMind:streak", onUpdate as EventListener);
  }, []);
  return <StreakBurst trigger={streak} />;
};

const AnnouncerMount = () => {
  const [msg, setMsg] = useState<string | null>(null);
  React.useEffect(() => {
    const onAnnounce = (e: Event) => {
      const text = (e as CustomEvent<{ message: string }>).detail?.message;
      if (typeof text === "string") setMsg(text);
    };
    window.addEventListener("auraMind:announce", onAnnounce as EventListener);
    return () => window.removeEventListener("auraMind:announce", onAnnounce as EventListener);
  }, []);
  return <Announcer message={msg} />;
};

const AppContent = ({ onUserRoleChange }: { onUserRoleChange: (role: UserRole) => void }) => {
  const location = useLocation();
  const transitionVariant = getPageTransitionVariant(location.pathname);
  const [_activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  // True once the initial session check has resolved (signed in OR signed out).
  // The loader must NOT be keyed on `user` alone — a signed-out visitor on a
  // public route (/about, /reset-password, 404s…) would otherwise hang
  // indefinitely instead of seeing the page.
  const [authChecked, setAuthChecked] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "active" | "trialing" | "canceled" | "past_due" | "none" | "loading"
  >("loading");
  const [showAmbientPlayer, setShowAmbientPlayer] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    analyticsService.init().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    initRealtimeNotifications(user.id);
    return () => {
      destroyRealtimeNotifications();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!location.pathname.startsWith("/dashboard")) {
      setShowAmbientPlayer(false);
      return;
    }
    const idleId = window.requestIdleCallback(() => setShowAmbientPlayer(true), { timeout: 2500 });
    return () => window.cancelIdleCallback(idleId);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMarketingRoute(location.pathname) || isMobile || checkReducedMotion()) {
      return;
    }
    let cancelled = false;
    const initMarketingMotion = async () => {
      const [{ initializeAweSystem }, { initializeScrollAnimations }] = await Promise.all([
        import("./styles/animations/awe"),
        import("./hooks/useScrollAnimations"),
      ]);
      if (cancelled) return;
      window.requestIdleCallback(() => {
        if (cancelled) return;
        initializeAweSystem();
        initializeScrollAnimations();
      });
    };
    initMarketingMotion();
    return () => {
      cancelled = true;
      import("./hooks/useScrollAnimations").then(({ cleanupScrollAnimations }) => {
        cleanupScrollAnimations();
      });
    };
  }, [location.pathname, isMobile]);

  // Clear every piece of session/workspace state so a signed-out (or deleted)
  // user never lingers on a protected screen. Used by both the SIGNED_OUT
  // auth event and onLogout's error fallback.
  const clearSessionState = useCallback(() => {
    setUser(null);
    setDecks([]);
    setCards([]);
    setActiveDeckId(null);
    setSubscriptionStatus("none");
    analyticsService.reset().catch(() => {});
  }, []);

  const checkSubscription = async (userId: string, email: string, forceCheck = false) => {
    /** Timeout guard: if /api/subscription is unreachable (local dev w/o API, or a
     * slow deploy), bail to "none" instead of leaving subscriptionStatus stuck on
     * "loading" forever. */
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      // The API now authenticates this call: the bearer token identifies the
      // caller server-side, so the body userId is only informational.
      const { data: { session } } = await supabase!.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`${apiBase}/api/subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, email }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        console.error("Subscription check failed:", response.status);
        setSubscriptionStatus(subscriptionFallback());
        return;
      }
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setSubscriptionStatus(subscriptionFallback());
        return;
      }
      const data = await response.json();
      if (forceCheck && data.status !== "active" && data.status !== "trialing") {
        setSubscriptionStatus("loading");
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          const retryRes = await fetch(`${apiBase}/api/subscription`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ userId, email }),
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.status === "active" || retryData.status === "trialing") {
              setSubscriptionStatus(retryData.status);
              const url = new URL(window.location.href);
              url.searchParams.delete("payment");
              window.history.replaceState({}, "", url.toString());
              return;
            }
          }
        }
      }
      if (forceCheck && (data.status === "active" || data.status === "trialing")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("payment");
        window.history.replaceState({}, "", url.toString());
      }
      // Grace-period dunning: `past_due` keeps full access while Stripe
      // smart-retries the card, but the user must see the payment warning.
      if (data.status === "past_due") {
        toast.error("Payment failed — your card couldn't be charged. Please update your payment method to keep access.", {
          id: "dunning-past-due",
          duration: 10000,
        });
      }
      const resolvedStatus =
        data.status === "past_due" || data.status === "active" || data.status === "trialing"
          ? "active"
          : data.status || "none";
      storeSubscriptionStatus(resolvedStatus);
      setSubscriptionStatus(resolvedStatus);
    } catch (err) {
      console.error("Subscription check failed:", err);
      setSubscriptionStatus(subscriptionFallback());
    }
  };

  const roleOf = useCallback((email?: string): UserRole => getDefaultRole(email), []);

  const mapAuthUserToProfile = useCallback(
    (authUser: any): UserProfile => {
      const metadata = authUser.user_metadata || {};
      // Authorization role: app_metadata ONLY (service-role written). The
      // client-writable user_metadata.role holds the onboarding persona and
      // whatever else the user typed into their own metadata — reading it here
      // would let any account grant itself `tester` free access or staff
      // access from the console.
      const role = resolveAuthorizationRole(authUser, roleOf(authUser.email));
      const permissions = getPermissions(role);
      onUserRoleChange(role);
      return {
        id: authUser.id,
        name: metadata.full_name || authUser.email?.split("@")[0] || "User",
        email: authUser.email || "",
        avatar: metadata.avatar_url,
        plan: metadata.plan || "Starter",
        streak: typeof metadata.streak === "number" ? metadata.streak : 0,
        streakFreezes: typeof metadata.streak_freezes === "number" ? metadata.streak_freezes : 2,
        joinedDate: metadata.joined_date ? Number(metadata.joined_date) : Date.now(),
        isAdmin: permissions.canAccessAdminPanel,
        role,
        persona:
          typeof metadata.role === "string" && metadata.role !== role
            ? metadata.role
            : undefined,
        isEmailVerified: !!authUser.email_confirmed_at,
        isPhoneVerified: !!authUser.phone_confirmed_at,
        phone: authUser.phone || "",
        lastStudyDate: metadata.last_study_date,
      };
    },
    [onUserRoleChange, roleOf],
  );

  useEffect(() => {
    const syncSession = async (session: any) => {
      try {
        if (!session?.user) {
          setUser(null);
          setDecks([]);
          setCards([]);
          setActiveDeckId(null);
          setSubscriptionStatus("none");
          analyticsService.reset().catch(() => {});
          setAuthChecked(true);
          return;
        }
        let profile = mapAuthUserToProfile(session.user);
        // Hydrate the user into app state IMMEDIATELY, before any awaited
        // round-trip below. The auth page navigates straight to /dashboard
        // after signInWithPassword resolves; if `user` is still null here,
        // ProtectedRoute bounces the user straight back to /auth (the
        // "sign in twice before it works" bug). The DB role upgrade below is
        // applied in place afterwards and does not block the guard.
        setUser(profile);
        setAuthChecked(true);
        try {
          // Refresh the user from the server. `session.user` above is the
          // JWT's embedded claims, frozen at token-mint time — a role
          // promotion (matty.cigemp -> owner) or an avatar uploaded on
          // another device stays invisible until the token refreshes, which
          // is exactly the "cards sync but profile pic / admin don't" bug.
          // `getUser()` round-trips to PostgREST and returns the CURRENT
          // app_metadata.role and user_metadata, so both stale-JWT symptom
          // classes self-heal on every boot without a manual re-login.
          const { data: freshUser, error: freshError } =
            await requireSupabase().auth.getUser();
          if (!freshError && freshUser?.user) {
            profile = mapAuthUserToProfile(freshUser.user);
            setUser(profile);
          } else if (freshError) {
            console.warn("Fresh user refresh failed, keeping cached session:", freshError.message);
          }
        } catch {
          // network hiccup — the cached session is still usable until next boot
        }
        try {
          const { data: dbProfile } = await requireSupabase()
            .from("user_profiles")
            .select("role")
            .eq("user_id", session.user.id)
            .maybeSingle();
          const dbRole = dbProfile?.role as UserRole | undefined;
          if (dbRole) {
            const dbPerms = getPermissions(dbRole);
            const memPerms = getPermissions(profile.role || UserRole.USER);
            if (dbPerms.canAccessAdminPanel && !memPerms.canAccessAdminPanel) {
              // user_profiles.role is written by the sync trigger from
              // app_metadata (server-side), so it is a legitimate elevation
              // source — unlike user_metadata, which is never read here.
              profile = { ...profile, role: dbRole, isAdmin: true };
              setUser(profile);
            }
          }
        } catch {
          // user_profiles not yet created — safe to ignore
        }
        analyticsService
          .identify(profile.id, { email: profile.email, plan: profile.plan })
          .catch(() => {});

        const permissions = getPermissions(profile.role || UserRole.USER);
        if (permissions.hasFreeAccess) {
          setSubscriptionStatus("active");
        } else {
          await checkSubscription(
            session.user.id,
            session.user.email || "",
            window.location.search.includes("payment=success"),
          );
        }

        const { decks: fetchedDecks, cards: fetchedCards } = await loadWorkspaceData(
          session.user.id,
        );

        setDecks(fetchedDecks);
        setCards(fetchedCards);
      } catch (err) {
        console.error("Failed to sync session:", err);
        setSubscriptionStatus("none");
        setAuthChecked(true);
      }
    };

    let subscription: { unsubscribe: () => void } | null = null;
    // Supabase emits INITIAL_SESSION when the auth client is ready. Keep the
    // explicit getSession fallback for unusual adapters, but dedupe it so a
    // normal boot does not fetch decks, subscriptions, and offline caches
    // twice before the first screen becomes interactive.
    let initialSessionKey: string | null | undefined;
    const syncInitialSessionOnce = (session: any) => {
      const key = session?.user?.id ?? null;
      if (initialSessionKey === key) return;
      initialSessionKey = key;
      void syncSession(session);
    };

    if (!supabase) {
      setAuthChecked(true);
    } else {
      const {
        data: { subscription: sub },
      } = requireSupabase().auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          // Clear all app state so protected routes fall through to /auth.
          // Without this, the UI stays "logged in" even after the session dies
          // — the classic "sign out button does nothing" bug.
          clearSessionState();
          return;
        }
        if (event === "INITIAL_SESSION") {
          syncInitialSessionOnce(session);
          return;
        }
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          void syncSession(session);
        }
      });
      subscription = sub;
    }
    supabase?.auth
      .getSession()
      .then(({ data: { session } }) => {
        syncInitialSessionOnce(session);
      })
      .catch((err) => console.error("Failed to get session:", err));
    return () => subscription?.unsubscribe();
  }, [mapAuthUserToProfile, clearSessionState]);

  // Pull-to-refresh on the Android screens reloads through the same path the
  // session sync uses, so a refresh honours offline mode and auto-sync too.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    return registerWorkspaceRefresh(async () => {
      const { decks: fetchedDecks, cards: fetchedCards } = await loadWorkspaceData(userId);
      setDecks(fetchedDecks);
      setCards(fetchedCards);
    });
  }, [userId]);

  const createDeck = useCallback(
    async (t: string, d: string) => {
      if (!user) return null;
      const deck = await dbService.createDeck(user.id, t, d);
      setDecks((prev) => [...prev, deck]);
      addNotification({
        title: "Deck Created",
        description: `"${t}" is ready for study`,
        type: "success",
        actionUrl: `/deck/${deck.id}`,
        actionLabel: "Open Deck",
      });
      return deck;
    },
    [user],
  );

  const deleteDeck = useCallback(async (id: string) => {
    try {
      await dbService.deleteDeck(id);
      dbService.clearCache();
      setDecks((prev) => prev.filter((d) => d.id !== id));
      setCards((prev) => prev.filter((c) => c.deckId !== id));
    } catch (err) {
      console.error("Failed to delete deck:", err);
      throw err;
    }
  }, []);

  const addCardsToDeck = useCallback(
    async (deckId: string, newCards: any[]) => {
      if (!user) return;
      const s = newCards.map((c) =>
        getInitialCardState(deckId, c.front || c.question, c.back || c.answer),
      );
      const templates = createMetadataTemplates(newCards, "AuraMind AI", "ai");
      const saved = mergeCardMetadata(await dbService.saveCards(user.id, s), templates);
      persistCardMetadata(saved);
      setCards((prev) => [...prev, ...saved]);
      setDecks((prev) =>
        prev.map((deck) =>
          deck.id === deckId ? { ...deck, cardCount: deck.cardCount + saved.length } : deck,
        ),
      );
      return saved.length;
    },
    [user],
  );

  const updateUserProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return;
      const nextProfile = { ...user, ...updates };
      const { data, error } = await requireSupabase().auth.updateUser({
        data: {
          full_name: nextProfile.name,
          avatar_url: nextProfile.avatar,
          plan: nextProfile.plan,
          role: nextProfile.role,
          streak: nextProfile.streak,
          streak_freezes: nextProfile.streakFreezes,
          joined_date: nextProfile.joinedDate,
          // is_admin is NOT set here: it lives in app_metadata (service-role
          // only) and must never be writable by the client SDK.
          last_study_date: nextProfile.lastStudyDate,
        },
      });
      if (error) throw error;
      if (updates.name) {
        await requireSupabase()
          .from("user_profiles")
          .update({ name: updates.name })
          .eq("id", user.id);
      }
      setUser(mapAuthUserToProfile(data.user ?? { ...user, user_metadata: {} }));
    },
    [user, mapAuthUserToProfile],
  );

  const currentUser = user || null;
  const onLogout = useCallback(() => {
    // Reset device-local gamification so the next account starts fresh.
    // This must happen before any network signOut so a failed signOut
    // (or null client) never leaves XP/streak lingering in localStorage.
    try {
      resetUserData();
    } catch {
      /* non-fatal */
    }
    if (supabase) {
      void requireSupabase()
        .auth.signOut()
        .catch((err) => {
          console.error("signOut failed:", err);
          // Even if the network call fails, clear in-memory state so the UI
          // never stays "logged in" forever.
          clearSessionState();
        });
    } else {
      clearSessionState();
    }
  }, [clearSessionState]);

  const workspaceProps = useMemo(
    () =>
      currentUser
        ? {
            user: currentUser,
            decks,
            cards,
            createDeck,
            deleteDeck,
            addCardsToDeck,
            updateProfile: updateUserProfile,
            onLogout,
          }
        : null,
    [
      currentUser,
      decks,
      cards,
      createDeck,
      deleteDeck,
      addCardsToDeck,
      updateUserProfile,
      onLogout,
    ],
  );

  // Repair and maintain the OS reminder schedule on every launch. In
  // 'maintain' mode this never raises a permission dialog -- it only
  // reschedules when the user has already granted it. See useReminderSync.
  useReminderSync('maintain');

  // Memory sparks (Surface 2): plan the day's notification sparks on native
  // platforms. Also 'maintain' mode — never prompts on launch. Settings asks.
  useSparkSync('maintain');

  // Content shared into AuraMind from any other app. Gated on authChecked so
  // a share cannot land on a route guard and bounce to /auth, losing itself.
  useShareTarget(authChecked);

  // Server-sent push listeners (token refresh, foreground presentation, tap
  // routing). Dormant until Firebase is configured — initPushListeners binds
  // nothing and upserts nothing when registration cannot succeed. Keyed on
  // the user id so a sign-out/sign-in swap never attributes a token to the
  // wrong account.
  useEffect(() => {
    if (!authChecked || !user?.id) return;
    return initPushListeners(user.id);
  }, [authChecked, user?.id]);

  /**
   * Hand off from the native splash exactly once, when the app can actually
   * render something.
   *
   * The splash no longer auto-hides, so without this it would stay up
   * forever. Hiding it here means the user sees one continuous loading
   * screen instead of the splash giving way to the app. The timeout is a
   * backstop: if auth never resolves, the splash must still come down
   * rather than trapping the user behind it.
   */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let done = false;
    const drop = () => {
      if (done) return;
      done = true;
      void SplashScreen.hide().catch(() => undefined);
    };
    if (authChecked) drop();
    const bail = setTimeout(drop, 8000);
    return () => clearTimeout(bail);
  }, [authChecked]);

  /**
   * Checkout opens in the phone's browser (Apple requires that on iOS, and
   * Capacitor sends every outside link there), so the purchase finishes
   * outside the app. Re-check the subscription whenever the app comes back to
   * the foreground so a new subscriber is let in without restarting the app.
   */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user || subscriptionStatus === "active") return;
    let listener: { remove: () => Promise<void> } | null = null;
    let disposed = false;
    void NativeApp.addListener("appStateChange", ({ isActive }) => {
      // No forced retry loop: that shows a loading screen on every resume.
      if (isActive) void checkSubscription(user.id, user.email || "");
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      void listener?.remove();
    };
    // checkSubscription is recreated each render; the listener only needs the
    // current user and whether they still lack access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, subscriptionStatus]);

  const isNativeShell = Capacitor.isNativePlatform();
  // /__e2e/* is a DEV-only harness that renders the Android shell in
  // isolation for the visual-contract tests. The boot screen is not part of
  // that contract, and letting it paint over the harness made every surface
  // snapshot fail on a wordmark that has nothing to do with the shell.
  const isVisualHarness = location.pathname.startsWith("/__e2e") || location.pathname.startsWith("/__preview");

  return (
    <>
      {/* The cinematic boot moment is the ONLY loading screen web users see.
          Android relies on the Capacitor native splash screen instead.

          It sits here, at a stable position in the tree, rather than inside
          the `!authChecked` branch. Rendering it there unmounted it the
          instant auth resolved, so it could never show that loading had
          finished — and the cut from a black screen straight to the app was
          abrupt. Kept mounted, it completes for real and fades while the app
          is already rendered and interactive underneath, so the fade costs
          the user nothing. */}
      {!isNativeShell && !isVisualHarness && <CinematicLoader ready={authChecked} />}

      {/* The harness renders regardless of auth. It is a component contract
          test for the Android shell, so gating it on a session check makes a
          layout assertion depend on network timing for no reason. */}
      {!authChecked && !isVisualHarness ? null : (
    <div className="min-h-screen bg-background text-foreground font-body selection:bg-primary selection:text-primary-foreground">
      <CustomCursor />
      <NativeRuntime />
      <BiometricGate />
      <StreakBurstMount />
      <AnnouncerMount />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#111118",
            color: "#F0EFFE",
            border: "1px solid #2A2A3A",
            fontSize: "12px",
          },
        }}
      />
      {/* Ambient chrome like the boot loader: excluded from the deterministic
          visual-contract harness (/__e2e/*) so baselines don't include it. */}
      {!isVisualHarness && <CookieConsentBanner />}
      <KeyboardAware>
        <CommandPalette />
        <AnimatePresence mode="sync">
          <Suspense fallback={<GenericPageSkeleton />}>
            <Routes location={location}>
              {/* ───── Public routes ───────────────────────────────────────── */}
              <Route
                path="/__e2e/android"
                element={
                  import.meta.env.DEV ? <AndroidVisualPreview /> : <Navigate to="/" replace />
                }
              />
              <Route
                path="/__preview/ios/*"
                element={IOS_PREVIEW_ENABLED ? <IOSVisualPreview /> : <Navigate to="/" replace />}
              />
              <Route
                path="/"
                element={
                  readClientEnv("VITE_IOS_PREVIEW") === "true" && Capacitor.getPlatform() === "ios" ? (
                    <Navigate to="/__preview/ios?tour=1" replace />
                  ) : Capacitor.isNativePlatform() ? (
                    user ? (
                      <Navigate to="/dashboard" replace />
                    ) : (
                      <PageTransition variant="lite">
                        {Capacitor.getPlatform() === "ios" ? <IOSWelcomeScreen /> : <AndroidWelcomeScreen />}
                      </PageTransition>
                    )
                  ) : (
                    <PageTransition variant={transitionVariant}>
                      <AuraLandingPage />
                    </PageTransition>
                  )
                }
              />
              <Route
                path="/auth"
                element={
                  <PageTransition>
                    <AuthPage />
                  </PageTransition>
                }
              />
              <Route
                path="/subscribe"
                element={
                  user && (subscriptionStatus === "active" || subscriptionStatus === "trialing") ? (
                    <Navigate to="/dashboard" replace />
                  ) : (
                    <PageTransition>
                      <PaymentPage
                        user={currentUser as any}
                        cancelled={window.location.search.includes("payment=cancelled")}
                      />
                    </PageTransition>
                  )
                }
              />

              <Route
                path="/onboarding"
                element={
                  <PageTransition>
                    <OnboardingFlow />
                  </PageTransition>
                }
              />

              <Route
                path="/docs"
                element={
                  <PageTransition>
                    <DocsPage />
                  </PageTransition>
                }
              />
              <Route
                path="/privacy"
                element={
                  <PageTransition>
                    <PrivacyPolicyPage />
                  </PageTransition>
                }
              />
              <Route
                path="/terms"
                element={
                  <PageTransition>
                    <TermsOfServicePage />
                  </PageTransition>
                }
              />
              <Route
                path="/download"
                element={
                  <PageTransition>
                    <DownloadPage />
                  </PageTransition>
                }
              />
              <Route
                path="/about"
                element={
                  <PageTransition>
                    <AboutPage />
                  </PageTransition>
                }
              />
              <Route
                path="/status"
                element={
                  <PageTransition>
                    <StatusPage />
                  </PageTransition>
                }
              />
              {/* ───── Deck detail (standalone) ───────────────────────────── */}
              <Route
                element={
                  <ProtectedRoute user={user} status={subscriptionStatus} onLogout={onLogout} />
                }
              >
                <Route
                  path="/deck/:id"
                  element={
                    <PageTransition>
                      <DeckDetailRoute />
                    </PageTransition>
                  }
                />
              </Route>

              {/* ───── /dashboard/* — NovaHub owns every sub-route ─────────── */}
              <Route
                element={
                  <ProtectedRoute user={user} status={subscriptionStatus} onLogout={onLogout} />
                }
              >
                <Route
                  path="/dashboard/*"
                  element={
                    <PageTransition variant="lite">
                      <SkeletonProvider skeleton="dashboard">
                        <Suspense fallback={<GenericPageSkeleton />}>
                          {workspaceProps ? (
                            <NovaHub
                              user={workspaceProps.user}
                              decks={workspaceProps.decks}
                              cards={workspaceProps.cards}
                              createDeck={workspaceProps.createDeck}
                              deleteDeck={workspaceProps.deleteDeck}
                              addCardsToDeck={workspaceProps.addCardsToDeck}
                              updateProfile={workspaceProps.updateProfile}
                              onLogout={workspaceProps.onLogout}
                            />
                          ) : (
                            <GenericPageSkeleton />
                          )}
                        </Suspense>
                      </SkeletonProvider>
                    </PageTransition>
                  }
                />
              </Route>

              {/* ───── /admin/* — Users + App Check, admin-gated ────────── */}
              <Route
                element={
                  <ProtectedRoute user={user} status={subscriptionStatus} onLogout={onLogout} />
                }
              >
                <Route
                  path="/admin"
                  element={
                    currentUser &&
                    getPermissions(currentUser.role || UserRole.USER).canAccessAdminPanel ? (
                      <Suspense fallback={<GenericPageSkeleton />}>
                        {workspaceProps ? (
                          <AdminHub
                            user={workspaceProps.user}
                            decks={workspaceProps.decks}
                            cards={workspaceProps.cards}
                            createDeck={workspaceProps.createDeck}
                            deleteDeck={workspaceProps.deleteDeck}
                            addCardsToDeck={workspaceProps.addCardsToDeck}
                            updateProfile={workspaceProps.updateProfile}
                            onLogout={workspaceProps.onLogout}
                          />
                        ) : (
                          <GenericPageSkeleton />
                        )}
                      </Suspense>
                    ) : (
                      <Navigate to="/dashboard" replace />
                    )
                  }
                >
                  <Route
                    index
                    element={
                      <Suspense fallback={<GenericPageSkeleton />}>
                        <AdminOverviewRoute />
                      </Suspense>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <Suspense fallback={<GenericPageSkeleton />}>
                        <AdminUsersRoute />
                      </Suspense>
                    }
                  />
                  <Route
                    path="check"
                    element={
                      <Suspense fallback={<GenericPageSkeleton />}>
                        <AdminAppCheckRoute />
                      </Suspense>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <Suspense fallback={<GenericPageSkeleton />}>
                        <AdminSettingsRoute />
                      </Suspense>
                    }
                  />
                </Route>
              </Route>

              {/* ───── Auth callback / restore pages ────────────────────── */}
              <Route
                path="/reset-password"
                element={
                  <PageTransition>
                    <ResetPasswordPage />
                  </PageTransition>
                }
              />
              <Route
                path="/restore-account"
                element={
                  <PageTransition>
                    <RestoreAccountPage />
                  </PageTransition>
                }
              />
              <Route
                path="/auth/callback"
                element={
                  <PageTransition>
                    <CallbackPage />
                  </PageTransition>
                }
              />
              <Route
                path="/auth/schoology/callback"
                element={
                  <PageTransition>
                    <SchoologyCallbackPage />
                  </PageTransition>
                }
              />

              {/* ───── 404 ──────────────────────────────────────────────── */}
              <Route
                path="*"
                element={
                  <PageTransition>
                    <NotFoundPage />
                  </PageTransition>
                }
              />
            </Routes>
          </Suspense>
        </AnimatePresence>

        {showAmbientPlayer && (
          <Suspense fallback={null}>
            <AmbientPlayer />
          </Suspense>
        )}
        <ScrollTopButton />
        <HmrRefreshNotice />
        <QuizGenerationNotifier />
        <PuterQuotaBanner />
      </KeyboardAware>
    </div>
      )}
    </>
  );
};

const App = () => {
  const [userRole, setUserRole] = useState<UserRole>(UserRole.USER);
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ReducedMotionGuard>
          <LayoutProvider role={userRole}>
            <AchievementProvider>
              <AppContent onUserRoleChange={setUserRole} />
            </AchievementProvider>
          </LayoutProvider>
        </ReducedMotionGuard>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
