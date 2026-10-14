import { motion, useMotionValue } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { useReducedMotion } from "../../utils/reducedMotion";

export type ProfLinneaVariant = "rest" | "thinking" | "streaming" | "badge";
export type ProfLinneaMood = "default" | "encouraging" | "focused";

export interface ProfLinneaProps {
  variant?: ProfLinneaVariant;
  size?: number;
  className?: string;
  mood?: ProfLinneaMood;
  /** Live microphone volume in the 0..1 range. */
  audioLevel?: number;
}

// Prism Aperture geometry translated from the canonical favicon into the
// avatar's 0..100 viewBox. One faceted outer frame, one inner aperture, and
// one bright core keep Prof. Linnea recognizable without drawing a face.
const OUTER_PATH = "M 50 15.4 L 82.8 50 L 50 84.6 L 17.2 50 Z";
const INNER_PATH = "M 50 29.5 L 69.7 50 L 50 70.5 L 30.3 50 Z";
const CORE_X = 50;
const CORE_Y = 50;

interface ProfLinneaPalette {
  halo: [string, string, string];
  core: string;
  ring: string;
}

const PALETTES: Record<ProfLinneaMood, ProfLinneaPalette> = {
  default: {
    halo: ["#72F4FF", "#8E89FF", "#FF9ACD"],
    core: "#F1FEFF",
    ring: "#C4B5FD",
  },
  encouraging: {
    halo: ["#FDE68A", "#F472B6", "#FDBA74"],
    core: "#FFF8DC",
    ring: "#F9A8D4",
  },
  focused: {
    halo: ["#7DD3FC", "#6366F1", "#A5B4FC"],
    core: "#E0F2FE",
    ring: "#67E8F9",
  },
};

export default function ProfLinnea({
  variant = "rest",
  size = 28,
  className = "",
  mood = "default",
  audioLevel,
}: ProfLinneaProps) {
  const reduced = useReducedMotion();
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const palette = PALETTES[mood];
  const isBadge = variant === "badge";
  const isThinking = variant === "thinking";
  const isStreaming = variant === "streaming";
  const animate = !reduced && !isBadge;
  const audioGain = typeof audioLevel === "number" ? Math.max(0, Math.min(1, audioLevel)) : 0;
  const breathDuration = isStreaming ? 2.2 : isThinking ? 3.4 : 5.2;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const trackingEnabled = !reduced && !isBadge && !isStreaming && size >= 28;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || !trackingEnabled) {
      mouseX.set(0);
      mouseY.set(0);
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
      mouseX.set(dx * size * 0.05);
      mouseY.set(dy * size * 0.035);
    };
    const handleLeave = () => {
      mouseX.set(0);
      mouseY.set(0);
    };

    element.addEventListener("mousemove", handleMove);
    element.addEventListener("mouseleave", handleLeave);
    return () => {
      element.removeEventListener("mousemove", handleMove);
      element.removeEventListener("mouseleave", handleLeave);
    };
  }, [mouseX, mouseY, size, trackingEnabled]);

  const markId = `${id}-mark`;
  const auraId = `${id}-aura`;
  const coreId = `${id}-core`;
  const glowId = `${id}-glow`;
  const outerWidth = 10.9 + audioGain * 0.55;
  const innerWidth = 4.5 + audioGain * 0.25;

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="overflow-visible"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={markId} x1="20%" y1="82%" x2="80%" y2="18%">
            <stop offset="0%" stopColor={palette.halo[0]} />
            <stop offset="38%" stopColor={palette.halo[1]} />
            <stop offset="68%" stopColor={palette.halo[1]} />
            <stop offset="100%" stopColor={palette.halo[2]} />
          </linearGradient>
          <radialGradient id={auraId} cx="50%" cy="50%" r="58%">
            <stop offset="0%" stopColor={palette.halo[1]} stopOpacity="0.28" />
            <stop offset="55%" stopColor={palette.halo[2]} stopOpacity="0.12" />
            <stop offset="100%" stopColor={palette.halo[2]} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={coreId} cx="32%" cy="24%" r="80%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="52%" stopColor={palette.core} />
            <stop offset="100%" stopColor={palette.halo[0]} />
          </radialGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill={`url(#${auraId})`}
          animate={
            animate
              ? { scale: [1, 1.04 + audioGain * 0.08, 1], opacity: [0.72, 1, 0.72] }
              : { scale: 1, opacity: 0.84 }
          }
          transition={
            animate
              ? { duration: breathDuration, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
          style={{ transformOrigin: "50px 50px" }}
        />

        {animate && !isBadge && (
          <motion.circle
            cx="50"
            cy="50"
            r={41 + audioGain * 3}
            fill="none"
            stroke={palette.ring}
            strokeWidth="0.9"
            strokeOpacity={isThinking ? 0.34 : 0.18 + audioGain * 0.16}
            strokeDasharray={isThinking ? "1 5" : "0.6 7"}
            animate={{ rotate: 360 }}
            transition={{ duration: isThinking ? 24 : 80, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "50px 50px" }}
          />
        )}

        <motion.g
          style={{ x: mouseX, y: mouseY, transformOrigin: "50px 50px" }}
          animate={animate ? { scale: [1, 1 + audioGain * 0.035, 1] } : { scale: 1 }}
          transition={
            animate
              ? { duration: breathDuration, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
        >
          <path
            d={OUTER_PATH}
            fill="none"
            stroke={`url(#${markId})`}
            strokeWidth={outerWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.25"
            filter={`url(#${glowId})`}
          />
          <motion.path
            d={OUTER_PATH}
            fill="none"
            stroke={`url(#${markId})`}
            strokeWidth={outerWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={
              animate
                ? { opacity: isStreaming ? [0.62, 1, 0.62] : [0.78, 1, 0.78] }
                : { opacity: 0.9 }
            }
            transition={
              animate
                ? { duration: breathDuration, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0 }
            }
          />
          <motion.path
            d={INNER_PATH}
            fill="none"
            stroke={`url(#${markId})`}
            strokeWidth={innerWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={
              animate
                ? { rotate: [0, isThinking ? 8 : 3, 0], opacity: [0.72, 1, 0.72] }
                : { rotate: 0, opacity: 0.88 }
            }
            transition={
              animate
                ? { duration: breathDuration, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0 }
            }
            style={{ transformOrigin: "50px 50px" }}
          />

          <motion.circle
            cx={CORE_X}
            cy={CORE_Y}
            r={5.5 + audioGain * 1.2}
            fill={`url(#${coreId})`}
            animate={
              animate
                ? { scale: [1, 1.1 + audioGain * 0.18, 1], opacity: [0.86, 1, 0.86] }
                : { scale: 1, opacity: 0.96 }
            }
            transition={
              animate
                ? {
                    duration: isStreaming ? 1.2 : breathDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                : { duration: 0 }
            }
            style={{ transformOrigin: `${CORE_X}px ${CORE_Y}px` }}
          />
          <circle cx="48.2" cy="48.2" r="1.7" fill="#FFFFFF" opacity="0.9" />
        </motion.g>
      </svg>
    </div>
  );
}
