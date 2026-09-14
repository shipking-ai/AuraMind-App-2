import { useEffect, useState } from "react";

/** Scroll this far before the top bar changes, so a nudge doesn't flicker it. */
const SCROLLED_PX = 8;
/** Don't hide the nav near the top of a page, where it frames the content. */
const HIDE_AFTER_PX = 140;
/** Ignore jitter: direction only counts after this much travel. */
const DIRECTION_PX = 6;

/**
 * Material scroll behaviour for the Android shell:
 *  - `scrolled`: the top app bar picks up its divider and compact height once
 *    content moves under it (M3 "on scroll" elevation)
 *  - `navHidden`: the bottom nav slides away while reading down a list and
 *    returns the moment the finger reverses (hide-on-scroll)
 *
 * Resets whenever `resetKey` (the route) changes, so a new screen always
 * opens with its chrome in place.
 */
export function useAndroidScrollChrome(scrollerId: string, enabled: boolean, resetKey: string) {
  const [scrolled, setScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);

  useEffect(() => {
    setScrolled(false);
    setNavHidden(false);
    if (!enabled) return;
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;

    let lastY = scroller.scrollTop;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = scroller.scrollTop;
        setScrolled(y > SCROLLED_PX);
        const delta = y - lastY;
        if (Math.abs(delta) < DIRECTION_PX) return;
        // Near the bottom the scroll bounces; keep the nav rather than
        // toggling it on every overscroll tick.
        const atEnd = y + scroller.clientHeight >= scroller.scrollHeight - 4;
        if (delta > 0 && y > HIDE_AFTER_PX && !atEnd) setNavHidden(true);
        else if (delta < 0) setNavHidden(false);
        lastY = y;
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerId, enabled, resetKey]);

  return { scrolled, navHidden };
}
