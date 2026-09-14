import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App, Capacitor, StatusBar, Style } from "../../lib/nativeShim";
import { parseDeepLink } from "../../lib/deepLinks";
import { initPlayEngagement } from "../../lib/playEngagement";
import { initDynamicColor } from "../../lib/dynamicColor";
import { consumeBackPress } from "../../lib/backStack";
import { setKeepAwake } from "../../lib/auraDevice";

/**
 * Android runtime bridge. The web app keeps rendering normally, while the
 * installed Android app gets native chrome behavior that a browser cannot
 * provide: status-bar styling, the system back button, and launcher-shortcut
 * deep links.
 */
export function NativeRuntime() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateRef = useRef(navigate);
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  // Deep links (launcher shortcuts). This component mounts after the auth
  // check, so getLaunchUrl covers the cold start and the listener covers
  // warm opens — there is no window where a link can arrive unheard.
  //
  // Mounted with an empty dependency array ON PURPOSE. Two traps make re-keying
  // this effect on anything dangerous:
  //   - Capacitor's getLaunchUrl() is sticky: it keeps returning the
  //     activity's launch intent URL for the whole process lifetime. Any
  //     re-run re-applies the original deep link and bounces the user back to
  //     the launch route after every navigation.
  //   - In this build, useNavigate() returns a fresh function identity each
  //     render, so even `[navigate]` re-runs the effect after every commit —
  //     same visible bug (79ms after clicking any tab, the app snapshots back
  //     to the boot URL).
  // The live pathname is read through `locationRef` and navigation goes
  // through `navigateRef`, so warm appUrlOpen events still work without the
  // effect ever re-mounting.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let removeListener: (() => void) | undefined;

    const open = (url: string | null | undefined) => {
      if (!url) return;
      const path = parseDeepLink(url);
      if (path && path !== locationRef.current) navigateRef.current(path);
    };

    void App.getLaunchUrl()
      .then((result) => {
        if (!disposed) open(result?.url);
      })
      .catch(() => undefined);

    void App.addListener("appUrlOpen", (event: { url: string }) => {
      open(event.url);
    })
      .then((listener) => {
        if (disposed) {
          void listener.remove();
        } else {
          removeListener = () => {
            void listener.remove();
          };
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  // Keep the screen on for the length of a study session, like a reader or a
  // video player. A card you are thinking about should not go dark under you.
  const inStudySession = /^\/dashboard\/study\/[^/]+/.test(location.pathname);
  useEffect(() => {
    if (!inStudySession) return;
    void setKeepAwake(true);
    return () => {
      void setKeepAwake(false);
    };
  }, [inStudySession]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: "#0A0A0F" }).catch(() => undefined);

    // Review prompts, flexible updates, open counting. Self-guarded no-ops
    // everywhere except the installed app.
    initPlayEngagement();

    // Material You: tint the Android shell with the wallpaper palette.
    initDynamicColor();

    let disposed = false;
    let removeListener: (() => void) | undefined;
    // Android convention: the FIRST back press at the root shows a hint,
    // the SECOND (within 2s) exits. Prevents accidental app kills.
    let exitHintTimer: ReturnType<typeof setTimeout> | null = null;
    let exitArmed = false;
    const showExitHint = () => {
      exitArmed = true;
      const banner = document.createElement("div");
      banner.id = "android-exit-hint";
      banner.textContent = "Press back again to exit";
      Object.assign(banner.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "99999",
        background: "#1F1F2E",
        color: "#E5E7EB",
        border: "1px solid #3A3A4F",
        borderRadius: "9999px",
        padding: "8px 16px",
        fontSize: "13px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      });
      document.body.appendChild(banner);
      if (exitHintTimer) clearTimeout(exitHintTimer);
      exitHintTimer = setTimeout(() => {
        exitArmed = false;
        document.getElementById("android-exit-hint")?.remove();
      }, 2000);
    };

    void App.addListener("backButton", ({ canGoBack }) => {
      // An open sheet or dialog takes the gesture before navigation does.
      if (consumeBackPress()) return;
      if (canGoBack && location.pathname !== "/") {
        navigate(-1);
        return;
      }

      // Match Android's expected behavior at the root of the app instead of
      // trapping the user inside a browser-like history stack.
      if (Capacitor.getPlatform() === "android") {
        if (exitArmed) {
          if (exitHintTimer) clearTimeout(exitHintTimer);
          document.getElementById("android-exit-hint")?.remove();
          void App.exitApp();
        } else {
          showExitHint();
        }
      }
    })
      .then((listener) => {
        if (disposed) {
          void listener.remove();
        } else {
          removeListener = () => {
            void listener.remove();
          };
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      removeListener?.();
      if (exitHintTimer) clearTimeout(exitHintTimer);
      document.getElementById("android-exit-hint")?.remove();
    };
  }, [location.pathname, navigate]);

  return null;
}

export default NativeRuntime;
