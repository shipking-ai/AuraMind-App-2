import { useEffect, useRef, useState } from "react";

/**
 * The web boot screen.
 *
 * Shows a determinate progress bar that climbs over time and jumps to 100%
 * the moment `ready` flips true. The bar reflects real elapsed time:
 * most boots resolve in under a second, slower ones show honest progress
 * rather than a fake sweep that claims completion before auth is done.
 *
 * The component no longer hides itself. It is unmounted by its parent when
 * `authChecked` flips, so it is on screen for exactly as long as the app is
 * actually loading.
 */
export function CinematicLoader({ ready = false }: { ready?: boolean }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (ready) {
      setProgress(100);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      // Logarithmic curve: fast early gains, slows as it approaches ~85%
      // 0ms → 0%, 500ms → ~40%, 1500ms → ~65%, 4000ms → ~80%, 8000ms → ~85%
      const maxProgress = 85;
      const p = maxProgress * (1 - Math.exp(-elapsed / 1800));
      setProgress(Math.min(p, maxProgress));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  // Status text phases — same timing as before but driven by elapsed time
  const [phase, setPhase] = useState<"quiet" | "working" | "slow">("quiet");

  useEffect(() => {
    if (ready) return;
    const working = setTimeout(() => setPhase("working"), 1200);
    const slow = setTimeout(() => setPhase("slow"), 6000);
    return () => {
      clearTimeout(working);
      clearTimeout(slow);
    };
  }, [ready]);

  return (
    <div className={`loader-mask ${ready ? "is-ready" : ""}`} role="status" aria-live="polite">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/auramind/video/loading-screen-poster.jpg"
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 object-cover opacity-60"
      >
        <source src="/auramind/video/loading-screen.webm" type="video/webm" />
        <source src="/auramind/video/loading-screen.mp4" type="video/mp4" />
      </video>

      <div className="loader-wordmark relative z-10">
        <span style={{ animationDelay: "0ms" }}>Aura</span>
        <span className="font-serif italic text-violet-400">Mind</span>
      </div>

      <div className="loader-bar" style={{ "--progress": `${progress}%` } as React.CSSProperties} />

      <p className="loader-status" aria-hidden={phase === "quiet"}>
        {phase === "slow"
          ? "Still restoring your session — this is taking longer than usual."
          : phase === "working"
            ? "Restoring your session…"
            : ""}
      </p>

      <span className="sr-only">
        {ready ? "Ready" : `Loading AuraMind — ${Math.round(progress)}%`}
      </span>
    </div>
  );
}
