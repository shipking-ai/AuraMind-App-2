import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";

interface VideoBackgroundProps {
  name: string;
  opacity?: number;
  blur?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  lazy?: boolean;
}

const BLUR_MAP: Record<string, string> = {
  sm: "blur-sm",
  md: "blur-md",
  lg: "blur-lg",
  xl: "blur-xl",
  "2xl": "blur-2xl",
};

export function VideoBackground({
  name,
  opacity = 0.5,
  blur,
  className,
  lazy = false,
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  const [armed, setArmed] = useState(!lazy);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!lazy) {
      if (!reduced) el.play().catch(() => {});
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setArmed(true);
          if (!reduced) el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy, reduced]);

  return (
    <video
      ref={videoRef}
      autoPlay={!reduced}
      loop
      muted
      playsInline
      preload={lazy && !armed ? "none" : "auto"}
      poster={`/auramind/video/${name}-poster.jpg`}
      aria-hidden
      className={cn(
        "absolute inset-0 w-full h-full object-cover pointer-events-none",
        blur ? BLUR_MAP[blur] || "" : "",
        className,
      )}
      style={{ opacity }}
    >
      {armed && (
        <>
          <source src={`/auramind/video/${name}.webm`} type="video/webm" />
          <source src={`/auramind/video/${name}.mp4`} type="video/mp4" />
        </>
      )}
    </video>
  );
}
