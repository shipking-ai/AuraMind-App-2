import { useId, type CSSProperties } from "react";
import "../../styles/graphics.css";
import type { VoiceOrbState } from "./VoiceOrb";

/**
 * VoiceAura — BonaMind's fluid voice presence.
 *
 * The visual language is intentionally simple at a glance: one large,
 * pearlescent orb on a dark surface. Inside it, soft colour fields drift
 * like ink in water. The listening state scales the bloom and distortion from
 * the real microphone RMS level; the other states use slower, state-specific
 * motion instead of pretending there is audio when there is not.
 */

export interface VoiceAuraProps {
  state: VoiceOrbState;
  /** Normalised microphone amplitude, 0..1. */
  level?: number;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  label?: string;
}

const ORB_CENTER = 160;
const ORB_RADIUS = 124;

const STATE_LABEL: Record<VoiceOrbState, string> = {
  idle: "Voice ready",
  speaking: "Speaking the question",
  listening: "Listening for your answer",
  thinking: "Checking your answer",
  blocked: "Microphone blocked",
};

export function VoiceAura({ state, level = 0, size = 220, className, label }: VoiceAuraProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const clamped = Math.max(0, Math.min(1, level));
  const coreScale = 1 + clamped * 0.045;
  const auraScale = 1 + clamped * 0.14;
  const bloomRadius = 132 + clamped * 20;

  return (
    <svg
      viewBox="0 0 320 320"
      width={size}
      height={size}
      className={`am-voice-orb am-voice-orb-${state} ${className ?? ""}`}
      role="img"
      aria-label={label ?? STATE_LABEL[state]}
      fill="none"
      style={
        {
          "--am-voice-level": clamped,
          "--am-voice-core-scale": coreScale,
          "--am-voice-aura-scale": auraScale,
        } as CSSProperties
      }
    >
      <defs>
        <radialGradient id={`${id}-base`} cx="35%" cy="23%" r="82%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="19%" stopColor="#e8fbff" />
          <stop offset="45%" stopColor="#90ddff" />
          <stop offset="69%" stopColor="#3b8ff2" />
          <stop offset="88%" stopColor="#3549cf" />
          <stop offset="100%" stopColor="#241681" />
        </radialGradient>
        <linearGradient id={`${id}-cyan`} x1="12%" y1="0%" x2="86%" y2="100%">
          <stop offset="0%" stopColor="#e7fbff" stopOpacity="0.92" />
          <stop offset="48%" stopColor="#69d9ff" stopOpacity="0.76" />
          <stop offset="100%" stopColor="#1d6be5" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`${id}-violet`} x1="100%" y1="10%" x2="10%" y2="90%">
          <stop offset="0%" stopColor="#d9ceff" stopOpacity="0.76" />
          <stop offset="46%" stopColor="#8668ec" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#311c9f" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-blue`} x1="85%" y1="0%" x2="12%" y2="100%">
          <stop offset="0%" stopColor="#7cecff" stopOpacity="0.18" />
          <stop offset="52%" stopColor="#3189f6" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#162dba" stopOpacity="0.96" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#65dfff" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#4d75ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6945e8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-pearl`} cx="50%" cy="45%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="48%" stopColor="#eaffff" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id={`${id}-cloud-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${id}-liquid`} x="-16%" y="-16%" width="132%" height="132%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.018"
            numOctaves="2"
            seed="19"
            result="auraNoise"
          >
            <animate
              attributeName="baseFrequency"
              values="0.008 0.018;0.014 0.012;0.008 0.018"
              dur="8s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="auraNoise"
            scale={10 + clamped * 32}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
        <clipPath id={`${id}-clip`}>
          <circle cx={ORB_CENTER} cy={ORB_CENTER} r={ORB_RADIUS} />
        </clipPath>
      </defs>

      {/* The bloom is deliberately soft and almost invisible at rest. */}
      <circle
        className="am-voice-orb-bloom"
        cx={ORB_CENTER}
        cy={ORB_CENTER}
        r={bloomRadius}
        fill={`url(#${id}-glow)`}
        filter={`url(#${id}-soft-glow)`}
      />
      <circle
        className="am-voice-orb-bloom am-voice-orb-bloom-back"
        cx={ORB_CENTER}
        cy={ORB_CENTER}
        r={bloomRadius + 14}
        fill={`url(#${id}-glow)`}
        filter={`url(#${id}-soft-glow)`}
      />

      {/* One clean base shape gives the animation a stable silhouette. */}
      <circle
        className="am-voice-orb-shell"
        cx={ORB_CENTER}
        cy={ORB_CENTER}
        r={ORB_RADIUS}
        fill={`url(#${id}-base)`}
      />

      {/* These fields are the personality of the orb: soft, asymmetrical,
          and never a recognisable waveform or meter. */}
      <g
        clipPath={`url(#${id}-clip)`}
        className="am-voice-orb-clouds"
        filter={`url(#${id}-liquid)`}
      >
        <ellipse
          className="am-voice-orb-cloud-cyan"
          cx="68"
          cy="226"
          rx="160"
          ry="96"
          fill={`url(#${id}-cyan)`}
        />
        <ellipse
          className="am-voice-orb-cloud-blue"
          cx="92"
          cy="270"
          rx="142"
          ry="94"
          fill={`url(#${id}-blue)`}
        />
        <ellipse
          className="am-voice-orb-cloud-violet"
          cx="236"
          cy="112"
          rx="112"
          ry="105"
          fill={`url(#${id}-violet)`}
        />
        <path
          className="am-voice-orb-cloud-pearl"
          d="M-8 122c38-42 83-57 119-33 28 18 45 46 76 42 34-4 56-45 106-35 27 5 45 25 54 52V30H-8Z"
          fill={`url(#${id}-pearl)`}
        />
        <path
          className="am-voice-orb-cloud-tide"
          d="M-16 186c44-29 75-21 106 1 34 25 61 29 93 8 38-25 85-27 145 17v115H-16Z"
          fill={`url(#${id}-blue)`}
        />
        <ellipse
          className="am-voice-orb-cloud-warm"
          cx="151"
          cy="69"
          rx="55"
          ry="27"
          fill="#fff9d8"
          opacity="0.42"
          filter={`url(#${id}-cloud-blur)`}
        />
      </g>

      {/* A moving pearl highlight keeps the surface dimensional without a
          hard glass shine. */}
      <g clipPath={`url(#${id}-clip)`} className="am-voice-orb-highlight-layer">
        <ellipse
          className="am-voice-orb-highlight"
          cx="104"
          cy="84"
          rx="72"
          ry="42"
          fill="#ffffff"
          opacity="0.26"
        />
        <ellipse
          className="am-voice-orb-highlight-soft"
          cx="84"
          cy="132"
          rx="58"
          ry="84"
          fill="#ffffff"
          opacity="0.13"
        />
      </g>

      <circle className="am-voice-orb-edge" cx={ORB_CENTER} cy={ORB_CENTER} r={ORB_RADIUS - 1} />

      {state === "listening" && (
        <circle
          className="am-voice-orb-reactive-ring"
          cx={ORB_CENTER}
          cy={ORB_CENTER}
          r={ORB_RADIUS + 7 + clamped * 12}
        />
      )}

      {state === "thinking" && (
        <circle
          className="am-voice-orb-thinking-ring"
          cx={ORB_CENTER}
          cy={ORB_CENTER}
          r={ORB_RADIUS + 7}
        />
      )}

      {state === "blocked" && (
        <>
          <circle
            className="am-voice-orb-blocked-wash"
            cx={ORB_CENTER}
            cy={ORB_CENTER}
            r={ORB_RADIUS}
          />
          <path className="am-voice-orb-blocked-line" d="M104 104 216 216" />
        </>
      )}
    </svg>
  );
}

export default VoiceAura;
