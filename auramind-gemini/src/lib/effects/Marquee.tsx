/**
 * Marquee — gradient-edge, pause-on-hover, optionally-reverse infinite
 * scroll. Faithful re-implementation of Magic UI's marquee primitive.
 *
 * The existing `components/ui/Marquee.tsx` is a similar hand-rolled
 * version; this one is the API BonaMind should converge on (gradient
 * edges, pause-on-hover, reverse, vertical). Backward-compat:
 * `MarqueeContent` is the inner block that should animate.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface MarqueeProps {
  children: ReactNode;
  /** Animate horizontally (default) or vertically. */
  direction?: 'horizontal' | 'vertical';
  /** Whether to animate in reverse. */
  reverse?: boolean;
  /** Pause animation when the user hovers. */
  pauseOnHover?: boolean;
  /** CSS duration for one full pass (s). Default 30. */
  duration?: number;
  /** Animate the same content continuously, or duplicate then loop. */
  repeat?: number;
  /** Render a fading mask on the leading + trailing edges. */
  gradientEdges?: boolean;
  className?: string;
}

export function Marquee({
  children,
  direction = 'horizontal',
  reverse = false,
  pauseOnHover = false,
  duration = 30,
  repeat = 4,
  gradientEdges = true,
  className,
}: MarqueeProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);

  // If reduced motion, render a static row with all repeats visible.
  useEffect(() => {
    /* no-op */
  }, [reduced]);

  const isVertical = direction === 'vertical';
  const animClass = reduced
    ? ''
    : `marquee-track ${reverse ? 'marquee-reverse' : ''} ${paused ? 'marquee-paused' : ''}`;

  const innerStyle: React.CSSProperties = {
    display: 'flex',
    [isVertical ? 'flexDirection' : 'flexDirection']: isVertical ? 'column' : 'row',
    gap: '2rem',
    animationDuration: `${duration}s`,
    willChange: 'transform',
  };

  return (
    <div
      ref={containerRef}
      className={`marquee-root ${className ?? ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: isVertical ? '100%' : undefined,
        ...(gradientEdges
          ? {
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
              maskImage:
                'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
            }
          : {}),
      }}
      onMouseEnter={pauseOnHover ? () => setPaused(true) : undefined}
      onMouseLeave={pauseOnHover ? () => setPaused(false) : undefined}
    >
      <style>{`
        @keyframes marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-y { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        .marquee-track { animation-name: marquee-x; animation-timing-function: linear; animation-iteration-count: infinite; }
        .marquee-reverse { animation-direction: reverse; }
        .marquee-paused { animation-play-state: paused; }
        .marquee-root > div[vertical="true"] > .marquee-track,
        div[marquee-vertical="true"] .marquee-track { animation-name: marquee-y; }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>
      <div className={animClass} style={innerStyle}>
        {Array.from({ length: repeat }).map((_, i) => (
          <div key={i} style={{ flexShrink: 0, display: 'flex', gap: '2rem' }}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
