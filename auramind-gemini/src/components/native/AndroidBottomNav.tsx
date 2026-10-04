import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Brain, GraduationCap, Home, Settings } from "@/components/icons";
import { hapticSelection, hapticTap } from "./androidHaptics";

type AndroidTab = {
  label: string;
  path: string;
  icon: typeof Home;
  featured?: boolean;
};

const TABS: AndroidTab[] = [
  { label: "Home", path: "/dashboard", icon: Home },
  { label: "Library", path: "/dashboard/decks", icon: BookOpen },
  { label: "Study", path: "/dashboard/study", icon: Brain, featured: true },
  { label: "Coach", path: "/dashboard/chat", icon: GraduationCap },
  { label: "More", path: "/dashboard/settings", icon: Settings },
] as const;

function isActive(pathname: string, path: string): boolean {
  if (path === "/dashboard") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Android's primary navigation: four destinations plus a raised study action. */
export function AndroidBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="android-bottom-nav android-mobile-bottom-nav"
      aria-label="BonaMind Android navigation"
    >
      <div className="android-mobile-bottom-nav-inner">
        {TABS.map(({ label, path, icon: Icon, featured }) => {
          const active = isActive(location.pathname, path);
          const handlePress = () => {
            if (active) {
              hapticTap();
              return;
            }
            hapticSelection();
            navigate(path);
          };
          return (
            <button
              key={path}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={label}
              onClick={handlePress}
              className={`android-nav-item ${featured ? "android-nav-item-featured" : ""} ${active ? "is-active" : ""}`}
            >
              {active && !featured && (
                <motion.span
                  layoutId="android-nav-active-pill"
                  className="android-nav-active-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={featured ? "android-nav-feature-icon" : "android-nav-icon"}>
                {featured ? (
                  <img src="/favicons,logos/favicon.svg" alt="" aria-hidden="true" />
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
              </span>
              <span className="android-nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default AndroidBottomNav;
