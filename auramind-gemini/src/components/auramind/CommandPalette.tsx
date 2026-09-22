import {
  Sparkles,
  Home,
  LayoutDashboard,
  Brain,
  MessageSquare,
  Shield,
  Activity,
  Settings,
  LogIn,
  Keyboard,
  Users,
  Wrench,
} from "@/components/icons";
import { useAuraMind } from "@/lib/auramind/store";
import type { ViewKey } from "@/lib/auramind/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardWorkspace } from "@/contexts/DashboardWorkspaceContext";
import { isAdminOrHigher } from "@/utils/permissions";

const NAV_ITEMS: {
  key: ViewKey;
  label: string;
  icon: typeof Home;
  hint: string;
  path: string;
}[] = [
  { key: "landing", label: "Landing Page", icon: Home, hint: "Marketing site", path: "/" },
  { key: "auth", label: "Auth (Login / Signup)", icon: LogIn, hint: "Authentication", path: "/auth" },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Your study home", path: "/dashboard" },
  { key: "study", label: "Study Mode", icon: Brain, hint: "Flashcard review", path: "/dashboard" },
  { key: "chat", label: "Ask Aura (AI Tutor)", icon: MessageSquare, hint: "Chat with Aura", path: "/dashboard/chat" },
  { key: "settings", label: "Settings", icon: Settings, hint: "Preferences", path: "/dashboard/settings" },
];

const ADMIN_PALETTE_ITEMS: {
  key: ViewKey;
  label: string;
  icon: typeof Home;
  hint: string;
  path: string;
}[] = [
  // Kept deliberately small: every entry here must resolve to a real route.
  // The palette previously advertised eleven unbuilt admin pages that all
  // rendered a blank shell. Role management lives in Users, subscriptions
  // are per-user in Users — they don't need their own pages. Audit Trail
  // and Test Users have working APIs and can be added back on demand.
  { key: "admin", label: "Admin Overview", icon: Shield, hint: "Launch cockpit", path: "/admin" },
  { key: "users", label: "User Management", icon: Users, hint: "User registry", path: "/admin/users" },
  { key: "health", label: "Health Check", icon: Activity, hint: "Readiness scanner", path: "/admin/check" },
  { key: "config", label: "System Config", icon: Wrench, hint: "Platform settings", path: "/admin/settings" },
];

export function CommandPalette() {
  const { cmdOpen, setCmdOpen } = useAuraMind();
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();

  const filteredNavItems = useMemo(() => {
    return isAdminOrHigher(workspace?.user?.role) ? [...NAV_ITEMS, ...ADMIN_PALETTE_ITEMS] : NAV_ITEMS;
  }, [workspace?.user?.role]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(!cmdOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cmdOpen, setCmdOpen]);

  const go = (v: ViewKey) => {
    const item = filteredNavItems.find((n) => n.key === v);
    if (item) navigate(item.path);
    setCmdOpen(false);
  };

  return (
    <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
      <CommandInput placeholder="Search pages, actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {filteredNavItems.map((item) => (
            <CommandItem
              key={item.key}
              value={`${item.label} ${item.hint}`}
              onSelect={() => go(item.key)}
              className="gap-2"
            >
              <item.icon className="h-4 w-4 text-violet-400" />
              <span>{item.label}</span>
              <span className="ml-auto text-xs text-[#7A7A96]">{item.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go("study")} className="gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span>Start today&apos;s review</span>
          </CommandItem>
          <CommandItem onSelect={() => go("chat")} className="gap-2">
            <MessageSquare className="h-4 w-4 text-violet-400" />
            <span>Ask Aura about a card</span>
          </CommandItem>
          {isAdminOrHigher(workspace?.user?.role) && (
            <CommandItem onSelect={() => go("health")} className="gap-2">
              <Activity className="h-4 w-4 text-violet-400" />
              <span>Run readiness scan</span>
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Shortcuts">
          <CommandItem className="gap-2 opacity-60">
            <Keyboard className="h-4 w-4" />
            <span>Press</span>
            <kbd className="ml-auto rounded border border-[#2A2A3A] bg-[#1A1A24] px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
            <span className="text-xs text-[#7A7A96]">anytime to open this palette</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
