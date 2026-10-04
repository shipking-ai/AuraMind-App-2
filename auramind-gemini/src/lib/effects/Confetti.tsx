/**
 * Confetti — canvas-based burst used on achievement unlocks + streak milestones.
 *
 * Faithful re-implementation of the most-used primitives of Magic UI's
 * `<Confetti/>` shipped with the BonaMind hand-rolled effects layer (see
 * `lib/effects/index.ts`) so we keep first-party ownership of every
 * animation. The contract is deliberately tiny:
 *
 *   - Either pass `trigger={true}` (effect flips to firing on that
 *     change, then sets an internal cooldown). OR
 *   - Pass an imperative `fire` ref via `useImperativeHandle` style
 *     (call it from `onClick` etc.).
 *
 * Reduced-motion: if the user has `prefers-reduced-motion: reduce`,
 * this component renders a no-op (no canvas particle loop) but still
 * emits `onSettled` so the caller's UI progression doesn't stall.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface ConfettiHandle {
  fire: (overrides?: ConfettiOverrides) => void;
}

export interface ConfettiOverrides {
  particleCount?: number;
  spread?: number;
  originX?: number;
  originY?: number;
  colors?: string[];
}

export interface ConfettiProps extends ConfettiOverrides {
  durationMs?: number;
  startVelocity?: number;
  /** Optional callback when the burst finishes — useful for advancing UI state. */
  onSettled?: () => void;
  /** CSS className forwarded to the canvas. */
  className?: string;
}

const DEFAULT_COLORS = ['#7C3AED', '#EC4899', '#06B6D4', '#F59E0B', '#10B981', '#EF4444'];

export const Confetti = forwardRef<ConfettiHandle, ConfettiProps>(function Confetti(
  props,
  ref,
) {
  const {
    particleCount = 80,
    spread = 70,
    originX = 0.5,
    originY = 0.4,
    colors = DEFAULT_COLORS,
    durationMs = 1500,
    startVelocity = 50,
    onSettled,
    className,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      life: number;
      maxLife: number;
      rot: number;
      vRot: number;
      size: number;
    }>
  >([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect prefers-reduced-motion once on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Match canvas pixel ratio so bursts stay crisp on retina.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const fire = useCallback(
    (overrides?: ConfettiOverrides) => {
      if (reducedMotion) {
        // Skip animation entirely; emit onSettled immediately so caller
        // doesn't wait on a UI gate that's invisible.
        onSettled?.();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cx = (overrides?.originX ?? originX) * window.innerWidth;
      const cy = (overrides?.originY ?? originY) * window.innerHeight;
      const palette = overrides?.colors ?? colors;
      const n = overrides?.particleCount ?? particleCount;
      const sp = overrides?.spread ?? spread;
      startTimeRef.current = performance.now();
      // Seed particles with random velocity across a cone.
      for (let i = 0; i < n; i++) {
        const angle = (Math.random() - 0.5) * (sp * Math.PI / 180);
        const vel = startVelocity * (0.6 + Math.random() * 0.4);
        particles.current.push({
          x: cx,
          y: cy,
          vx: Math.sin(angle) * vel,
          vy: -Math.cos(angle) * vel,
          color: palette[Math.floor(Math.random() * palette.length)],
          life: 0,
          maxLife: durationMs + Math.random() * 400,
          rot: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 0.3,
          size: (4 + Math.random() * 4),
        });
      }
      // Re-arm render loop if not running.
      if (rafRef.current == null) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const tick = (now: number) => {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          const elapsed = now - startTimeRef.current;
          const next: typeof particles.current = [];
          for (const p of particles.current) {
            p.life += 16;
            p.vy += 0.6; // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vRot;
            const alpha = Math.max(0, 1 - p.life / p.maxLife);
            if (alpha <= 0) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
            next.push(p);
          }
          particles.current = next;
          // Use dpr-scaled clear.
          if (particles.current.length === 0 || elapsed > durationMs + 800) {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            rafRef.current = null;
            onSettled?.();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
          // swallow unused `dpr` to satisfy strict mode
          void dpr;
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [colors, durationMs, onSettled, originX, originY, particleCount, reducedMotion, spread, startVelocity],
  );

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      particles.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="confetti-canvas"
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
});
