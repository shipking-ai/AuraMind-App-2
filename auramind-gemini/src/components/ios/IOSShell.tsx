import React, { Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Brain, Home, MessageCircle, Settings, type LucideIcon } from "../icons";
import { IOS_SCROLLER_ID } from "./IOSPrimitives";
import { iosSelection } from "./iosHaptics";
import { IOSDesignContext } from "./iosDesign";

interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { path: "/dashboard", label: "Today", icon: Home, match: (p) => p === "/dashboard" },
  {
    path: "/dashboard/decks",
    label: "Library",
    icon: BookOpen,
    match: (p) => p.startsWith("/dashboard/decks"),
  },
  {
    path: "/dashboard/study",
    label: "Study",
    icon: Brain,
    match: (p) => p === "/dashboard/study" || p.startsWith("/dashboard/study-tools"),
  },
  {
    path: "/dashboard/chat",
    label: "Aura",
    icon: MessageCircle,
    match: (p) => p.startsWith("/dashboard/chat"),
  },
  {
    path: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/dashboard/settings"),
  },
];

/** Screens drawn with the iOS design; everything else is padded for the status bar. */
const IOS_SCREENS = new Set([
  "/dashboard",
  "/dashboard/decks",
  "/dashboard/study",
  "/dashboard/chat",
  "/dashboard/settings",
]);

/** The route as if the shell were mounted at /dashboard (the preview mounts it elsewhere). */
function dashboardPath(pathname: string, basePath: string): string {
  const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  return `/dashboard${relative}`.replace(/\/$/, "");
}

/** Floating Liquid Glass tab bar with a sliding selection capsule. */
export function IOSTabBar({ basePath = "/dashboard" }: { basePath?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = dashboardPath(location.pathname, basePath);
  return (
    <nav className="ios-tabbar ios-glass" aria-label="Tabs">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <button
            key={tab.path}
            type="button"
            className="ios-tab"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) {
                iosSelection();
                navigate(tab.path.replace("/dashboard", basePath));
              } else {
                // Tapping the current tab scrolls to top, as in UIKit.
                document.getElementById(IOS_SCROLLER_ID)?.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            {active && (
              <motion.span
                layoutId="ios-tab-pill"
                className="ios-tab-pill"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <tab.icon aria-hidden />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function IOSShell({
  bleed,
  children,
  overlays,
  basePath = "/dashboard",
}: {
  bleed: boolean;
  children: React.ReactNode;
  overlays?: React.ReactNode;
  basePath?: string;
}) {
  const location = useLocation();
  const pathname = dashboardPath(location.pathname, basePath);
  const native = IOS_SCREENS.has(pathname);
  return (
    <div className="ios-app" data-testid="ios-shell">
      <main
        id={IOS_SCROLLER_ID}
        role="main"
        aria-label="Main content"
        className="ios-scroll"
        style={bleed ? { overflow: "hidden", paddingBottom: 0 } : undefined}
      >
        <div
          className={
            native
              ? bleed
                ? "ios-native-bleed"
                : undefined
              : bleed
                ? "ios-foreign-bleed"
                : "ios-foreign"
          }
        >
          <IOSDesignContext.Provider value={true}>
            <Suspense fallback={null}>{children}</Suspense>
          </IOSDesignContext.Provider>
        </div>
      </main>
      <IOSTabBar basePath={basePath} />
      {overlays}
    </div>
  );
}
