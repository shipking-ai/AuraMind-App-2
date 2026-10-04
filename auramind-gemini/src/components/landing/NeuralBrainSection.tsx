import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check } from "../icons";

/**
 * NeuralBrainSection — "THE NEURAL CORE".
 *
 * A CSS-only procedural brain visual: layered radial gradients for the
 * hemispheres, animated particle dots for neurons, and pulsing synapse
 * lines — all rendered with pure CSS animations. No WebGL, no three.js,
 * no competing IntersectionObservers.
 */

interface BrainCopyProps {
  className?: string;
}

function BrainCopy({ className = "" }: BrainCopyProps) {
  return (
    <div className={className}>
      <span className="text-[#7A7A96] text-[10px] font-medium tracking-[0.2em] uppercase mb-3 block">
        The neural core
      </span>
      <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight mb-3">
        Your memory,{" "}
        <span className="font-serif italic text-[#8B5CF6]">mapped</span>
      </h2>
      <p className="text-[#7A7A96] text-xs leading-relaxed mb-5 max-w-md">
        Every review feeds the map. BonaMind models the strength of each
        memory in your brain — thousands of cards, each with its own decay
        curve — and shows up at the exact moment a connection is about to
        fade.
      </p>
      <ul className="space-y-2 mb-6">
        {[
          "Per-card memory strength, not a flat queue",
          "Reviews scheduled at the point of near-forgetting",
          "The tutor anchors on your weakest connections",
        ].map((point, i) => (
          <li key={i} className="text-[#9090A8] text-xs flex items-start gap-2">
            <Check size={14} className="shrink-0 mt-0.5 text-[#7C3AED]" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Deterministic particle positions for the brain visual
const PARTICLES = Array.from({ length: 48 }, (_, i) => {
  const seed = i * 137.508;
  const angle = (seed % 360) * (Math.PI / 180);
  const radius = 30 + (seed % 70);
  const x = 50 + Math.cos(angle) * radius * 0.45;
  const y = 50 + Math.sin(angle) * radius * 0.38;
  const size = 1.5 + (i % 4) * 0.8;
  const delay = (i * 0.12) % 3;
  const hue = i % 3 === 0 ? "196" : i % 3 === 1 ? "258" : "262";
  return { x, y, size, delay, hue };
});

const SYNAPSE_LINES = [
  { x1: 35, y1: 30, x2: 55, y2: 35, delay: 0 },
  { x1: 40, y1: 50, x2: 60, y2: 45, delay: 0.4 },
  { x1: 45, y1: 65, x2: 58, y2: 60, delay: 0.8 },
  { x1: 30, y1: 45, x2: 50, y2: 50, delay: 1.2 },
  { x1: 55, y1: 30, x2: 65, y2: 40, delay: 0.2 },
  { x1: 38, y1: 55, x2: 52, y2: 70, delay: 0.6 },
  { x1: 42, y1: 35, x2: 58, y2: 55, delay: 1.0 },
  { x1: 48, y1: 40, x2: 62, y2: 50, delay: 1.4 },
];

export default function NeuralBrainSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section ref={sectionRef} className="relative py-20 px-6 border-t border-[#2A2A3A]/30 overflow-hidden">
      {/* Ambient glow behind the brain */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-[8%] top-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)", filter: "blur(90px)" }}
        />
      </div>

      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center relative z-10">
        {/* CSS brain visual */}
        <div className="relative aspect-square max-w-[480px] w-full mx-auto" aria-hidden="true">
          {/* Base brain shape — two hemisphere glows */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0"
          >
            {/* Left hemisphere */}
            <div
              className="absolute left-[12%] top-[18%] w-[42%] h-[64%] rounded-full"
              style={{
                background: "radial-gradient(ellipse at 60% 50%, rgba(124,58,237,0.35) 0%, rgba(99,102,241,0.2) 40%, rgba(30,10,60,0.08) 70%, transparent 100%)",
                filter: "blur(2px)",
                animation: "brain-pulse 4s ease-in-out infinite",
              }}
            />
            {/* Right hemisphere */}
            <div
              className="absolute right-[12%] top-[18%] w-[42%] h-[64%] rounded-full"
              style={{
                background: "radial-gradient(ellipse at 40% 50%, rgba(124,58,237,0.35) 0%, rgba(99,102,241,0.2) 40%, rgba(30,10,60,0.08) 70%, transparent 100%)",
                filter: "blur(2px)",
                animation: "brain-pulse 4s ease-in-out infinite 0.5s",
              }}
            />
            {/* Central fissure glow */}
            <div
              className="absolute left-1/2 top-[22%] -translate-x-1/2 w-[8%] h-[56%] rounded-full opacity-40"
              style={{
                background: "linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.5) 30%, rgba(139,92,246,0.5) 70%, transparent 100%)",
                filter: "blur(4px)",
              }}
            />
          </motion.div>

          {/* Synapse lines — SVG overlay */}
          <motion.svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            {SYNAPSE_LINES.map((line, i) => (
              <line
                key={i}
                x1={`${line.x1}%`}
                y1={`${line.y1}%`}
                x2={`${line.x2}%`}
                y2={`${line.y2}%`}
                stroke="rgba(124,58,237,0.25)"
                strokeWidth="0.4"
                strokeLinecap="round"
                style={{
                  animation: `synapse-pulse 3s ease-in-out infinite ${line.delay}s`,
                }}
              />
            ))}
          </motion.svg>

          {/* Neuron particles */}
          {PARTICLES.map((p, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: `hsla(${p.hue}, 70%, 65%, 0.7)`,
                boxShadow: `0 0 ${p.size * 2}px hsla(${p.hue}, 70%, 65%, 0.4)`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.8 + p.delay * 0.3,
                ease: [0.23, 1, 0.32, 1],
              }}
            />
          ))}

          {/* Outer ring pulse */}
          <motion.div
            className="absolute inset-[8%] rounded-full border border-[#7C3AED]/10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 1.5, delay: 0.4 }}
            style={{ animation: "ring-rotate 20s linear infinite" }}
          />
          <motion.div
            className="absolute inset-[15%] rounded-full border border-[#6366F1]/8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 1.5, delay: 0.6 }}
            style={{ animation: "ring-rotate 28s linear infinite reverse" }}
          />

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[#3A3A4F] text-[10px] tracking-wider uppercase whitespace-nowrap">
            every card has a decay curve
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          <BrainCopy />
        </motion.div>
      </div>
    </section>
  );
}
