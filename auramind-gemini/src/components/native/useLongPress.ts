import { useCallback, useEffect, useRef } from "react";
import { ImpactStyle } from "../../lib/nativeShim";
import { hapticTap } from "./androidHaptics";

const HOLD_MS = 450;
/** A finger that travels further than this is scrolling, not holding. */
const SLOP_PX = 10;

/**
 * Press-and-hold on a touch target, the Android gesture for "more actions".
 *
 * Spread the returned handlers onto the element. When the hold fires, the
 * click the browser sends on release is swallowed, so a long-press opens
 * the action sheet without also triggering the row's tap action. The native
 * context menu is suppressed for the same reason.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        hapticTap(ImpactStyle.Heavy);
        callback.current();
      }, HOLD_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!origin.current) return;
      const dx = event.clientX - origin.current.x;
      const dy = event.clientY - origin.current.y;
      if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: (event: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
    },
  };
}
