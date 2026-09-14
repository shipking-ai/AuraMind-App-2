import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { refreshWorkspace } from "../../lib/workspaceRefresh";
import { hapticSelection, hapticSuccess } from "./androidHaptics";

/** Distance (after resistance) the indicator must travel to trigger. */
const TRIGGER_PX = 72;
const MAX_PX = 120;
/** Finger travel is damped so the pull feels weighted, not 1:1. */
const RESISTANCE = 0.5;
/** A refresh that finishes instantly would flash; hold the spinner briefly. */
const MIN_SPIN_MS = 650;

/**
 * Swipe down at the top of a list to reload decks and cards — the Material
 * swipe-to-refresh pattern.
 *
 * It listens on the shell's scroll container rather than wrapping content,
 * so screens don't need to know it exists. The pull only begins when the
 * container is already at the top, so it never fights a normal scroll.
 */
export function AndroidPullToRefresh({ scrollerId }: { scrollerId: string }) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // While the finger is down the indicator tracks it 1:1; on release it eases.
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;

    const setPull = (value: number) => {
      distanceRef.current = value;
      setDistance(value);
    };

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current || scroller.scrollTop > 0 || event.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
      armed.current = false;
      setDragging(true);
    };

    const onMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const travel = event.touches[0].clientY - startY.current;
      if (travel <= 0 || scroller.scrollTop > 0) {
        if (distanceRef.current !== 0) setPull(0);
        return;
      }
      // Own the gesture: stop the WebView's overscroll glow and rubber band.
      if (event.cancelable) event.preventDefault();
      const next = Math.min(MAX_PX, travel * RESISTANCE);
      if (next >= TRIGGER_PX && !armed.current) {
        armed.current = true;
        hapticSelection();
      } else if (next < TRIGGER_PX && armed.current) {
        armed.current = false;
      }
      setPull(next);
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      setDragging(false);
      if (distanceRef.current < TRIGGER_PX) {
        setPull(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(TRIGGER_PX);
      const started = Date.now();
      void refreshWorkspace().then((ok) => {
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
        setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
          if (ok) hapticSuccess();
          else toast.error("Couldn't refresh. Check your connection and try again.");
        }, wait);
      });
    };

    scroller.addEventListener("touchstart", onStart, { passive: true });
    // Non-passive: preventDefault is what suppresses the native overscroll.
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd, { passive: true });
    scroller.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollerId]);

  const progress = Math.min(1, distance / TRIGGER_PX);
  const visible = distance > 0 || refreshing;

  return (
    <div
      className={`android-ptr ${visible ? "is-visible" : ""} ${refreshing ? "is-refreshing" : ""}`}
      style={{
        transform: `translate(-50%, ${distance - 56}px)`,
        transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      }}
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" className="android-ptr-spinner" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(4, progress * 50)} 60`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </svg>
      <span className="sr-only">{refreshing ? "Refreshing your library" : ""}</span>
    </div>
  );
}

export default AndroidPullToRefresh;
