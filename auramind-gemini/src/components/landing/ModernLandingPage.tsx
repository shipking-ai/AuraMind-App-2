import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useSpring, useTransform, useReducedMotion, type MotionValue } from "framer-motion";
import { Flashcard } from "../auramind/flashcard";
import { MagneticButton } from "../ui/MagneticButton";
import { Marquee } from "../ui/Marquee";
import { ManifestoSection } from "../ui/ManifestoSection";
import { AIGenerationDemoSection } from "../ui/AIGenerationDemoSection";
import { TrustStrip } from "../ui/TrustStrip";
import { VideoBackground } from "../ui/VideoBackground";
import { ComparisonSection } from "./ComparisonSection";
import NeuralBrainSection from "./NeuralBrainSection";
import { TextAnimate } from "../ui/TextAnimate";
import { TextGlitch } from "../ui/TextGlitch";
import { ChromaticAberration } from "../ui/ChromaticAberration";
import { BorderBeam } from "../ui/BorderBeam";
import { ShineBorder } from "../ui/ShineBorder";
import { useSoundDesign } from "@/hooks/useSoundDesign";
import { analyticsService } from "@/services/analytics/analyticsService";
import type { FlashcardData } from "@/lib/auramind/types";
import { TextSplit, TextScramble, ClickSparkles, DrawPath, ParticleField, useScrollReveal } from "@/lib/effects";
import { Headphones, Mic, BrainCircuit, FileText, Check } from "../icons";


const HERO_CARD: FlashcardData = {
  id: "hero-1",
  deckName: "Cell Biology",
  category: "BIOLOGY",
  front: "What powers ATP synthase?",
  back: "The proton gradient across the inner mitochondrial membrane.",
  explanation: "The electron transport chain pumps protons from the matrix into the intermembrane space, building up a gradient. ATP synthase uses that stored pressure to phosphorylate ADP into ATP as protons flow back through.",
  mnemonic: "ETC charges the battery. ATP synthase uses the battery.",
  cardNumber: 4,
  totalCards: 24,
};

const NAV_ITEMS = ["Features", "Pricing", "About"];

const ForgettingCurve = () => (
  <svg viewBox="0 0 400 140" className="w-full h-auto">
    <defs>
      <linearGradient id="curveGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M0 20 Q60 20 80 50 Q100 80 140 90 Q200 100 300 105 Q380 108 400 108"
      fill="none" stroke="#3A3A4F" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
    <path d="M0 20 Q60 18 100 22 Q160 25 220 28 Q300 32 400 35"
      fill="none" stroke="#7C3AED" strokeWidth="2" />
    <path d="M0 140 L0 20 Q60 18 100 22 Q160 25 220 28 Q300 32 400 35 L400 140 Z"
      fill="url(#curveGrad)" opacity="0.15" />
    <text x="320" y="24" fill="#7A7A96" fontSize="9" fontFamily="sans-serif">With AuraMind</text>
    <text x="320" y="98" fill="#3A3A4F" fontSize="9" fontFamily="sans-serif">Without review</text>
  </svg>
);

function FeatureCard({ icon, title, desc, index }: { icon: React.ReactNode; title: string; desc: string; index: number }) {
  const { playHover } = useSoundDesign({ volume: 0.08 });
  return (
    <BorderBeam duration={4 + index * 0.5} colorFrom="#7c3aeld" colorTo="#c4b5fd">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ delay: index * 0.1, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="group relative p-5 rounded-xl bg-[#111118]/80 backdrop-blur-lg border border-[#2A2A3A] hover:border-[#7C3AED]/30 transition-all duration-300 cursor-default overflow-hidden"
        onMouseEnter={playHover}
      >
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: "radial-gradient(600px circle at var(--mx, 50%) var(--my, 50%), rgba(124,58,237,0.08), transparent 60%)" }}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`); e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`); }}
        />
        <motion.div className="text-lg mb-3 group-hover:scale-110 transition-transform duration-300">{icon}</motion.div>
        <h3 className="text-[#F0EFFE] text-sm font-medium mb-1.5">{title}</h3>
        <p className="text-[#7A7A96] text-xs leading-relaxed">{desc}</p>
      </motion.div>
    </BorderBeam>
  );
}

/**
 * Depth-parallax wrapper for the hero mesh blobs. The hero scrolls on the
 * window, so depth maps off `scrollYProgress` (0→1 over the whole page; the
 * hero occupies roughly its first fifth). Mirrors the dashboard shell's
 * ParallaxLayer: framer owns the wrapper's y, the blob inside keeps its CSS
 * aurora-drift animation — two elements, no transform property fight. With
 * `hue`, the layer also hue-drifts as the page scrolls (the one accent).
 * Reduced motion: static, matching the rest of the page's behavior.
 */
function HeroBlobParallax({
  scrollYProgress,
  depth,
  hue,
  reduced,
  children,
}: {
  scrollYProgress: MotionValue<number>;
  depth: number;
  hue?: boolean;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const smooth = useSpring(scrollYProgress, { stiffness: 60, damping: 20, mass: 0.8 });
  // 0→1 progress × ~1200px page ≈ up to ~210px of travel at depth 0.18.
  const y = useTransform(smooth, (v) => v * depth * 1200);
  const filter = useTransform(smooth, (v) => (hue ? `hue-rotate(${(v * 30).toFixed(2)}deg)` : "none"));
  if (reduced) return <>{children}</>;
  return <motion.div className="absolute inset-0 will-change-transform" style={{ y, filter }}>{children}</motion.div>;
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] origin-left"
      style={{ scaleX, background: "linear-gradient(90deg, #7C3AED, #3B82F6)" }}
    >
      <div className="absolute inset-0 blur-[4px]" style={{ background: "inherit" }} />
    </motion.div>
  );
}

function Spotlight() {
  const [pos, setPos] = useState({ x: -500, y: -500 });
  const handleMouse = useCallback((e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY }), []);
  useEffect(() => { window.addEventListener("mousemove", handleMouse); return () => window.removeEventListener("mousemove", handleMouse); }, [handleMouse]);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[55]"
      style={{
        background: `radial-gradient(400px circle at ${pos.x}px ${pos.y}px, rgba(124,58,237,0.07), transparent 60%)`,
        transition: "background 0.1s ease-out",
      }}
    />
  );
}

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-[#2A2A3A]/50" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[#F0EFFE] text-sm font-medium tracking-tight font-script">
          <div className="w-5 h-5 rounded flex items-center justify-center">
            <img src="/favicons,logos/favicon-32.png" alt="AuraMind" className="h-full w-full object-contain" />
          </div>
          AuraMind
        </span>
        <div className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors"
            >
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/auth?mode=login")}
            className="text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors"
          >
            Sign in
          </button>
          <MagneticButton
            onClick={() => {
              analyticsService.trackFunnel("landing_cta_click", { location: "navbar" });
              navigate("/auth?mode=signup");
            }}
            className="px-4 py-1.5 min-h-[44px] bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-colors"
          >
            Start for free
          </MagneticButton>
        </div>
      </div>
    </nav>
  );
};

export default function ModernLandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const { playClick, playSuccess } = useSoundDesign({ volume: 0.1 });

  // Signup funnel — fire-and-forget; analytics must never block navigation.
  // All landing CTAs except the navbar "Sign in" start a new account, so the
  // helper always routes to signup mode.
  const goToAuth = (location: string) => {
    analyticsService.trackFunnel("landing_cta_click", { location });
    navigate("/auth?mode=signup");
  };

  // anime.js v4 ScrollObserver hooks for sections that should reveal as the
  // user scrolls into them. The `once: true` param (set in the lib defaults)
  // fires each only on first intersection, so users don't see the slide-in
  // re-trigger when they scroll back to the top.
  const studyModeReveal = useScrollReveal<HTMLDivElement>({
    enter: { duration: 600, opacity: [0, 1], translateY: [16, 0] },
  });
  const pricingReveal = useScrollReveal<HTMLDivElement>({
    enter: { duration: 700, opacity: [0, 1], translateY: [24, 0] },
  });
  const featuresGridReveal = useScrollReveal<HTMLDivElement>({
    enter: { duration: 600, opacity: [0, 1], translateY: [20, 0] },
  });
  const reducedMotion = useReducedMotion() ?? false;
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, 40]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0.6]);
  const cardRotateX = useTransform(scrollYProgress, [0, 0.1], [0, 8]);
  const cardRotateY = useTransform(scrollYProgress, [0, 0.1], [0, -5]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <Spotlight />
      <ScrollProgress />
      <Navbar />

      {/* Hero */}
      <section ref={heroRef} className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Hero video — layered behind mesh gradients */}
        <VideoBackground name="hero-neural" opacity={0.5} />

        {/* Animejs-style decorative SVG circuit drawing — scroll-synced like animejs.com hero */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]">
          <DrawPath selector="svg path" autoplay="scroll" draw={['0 0', '0 1', '1 1']} ease="inOut(3)" className="opacity-[0.04]">
            <svg viewBox="0 0 800 600" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
              <path d="M100 500 Q200 100 400 300 T700 200" fill="none" stroke="#7C3AED" strokeWidth="2" />
              <path d="M50 400 Q150 200 300 250 T500 100 T750 400" fill="none" stroke="#8B5CF6" strokeWidth="1.5" />
              <path d="M200 550 Q300 350 500 400 T650 150" fill="none" stroke="#7C3AED" strokeWidth="1" />
              <path d="M0 300 Q100 50 250 150 T450 50 T800 300" fill="none" stroke="#3B82F6" strokeWidth="1" />
            </svg>
          </DrawPath>
          {/* Second scroll-synced drawable — a glowing accent line that traces on scroll */}
          <DrawPath selector="svg path" autoplay="scroll" draw={['0 0', '0 0.5', '1 1']} ease="inOut(3)" className="opacity-[0.08]">
            <svg viewBox="0 0 800 600" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
              <path d="M700 500 Q600 200 400 300 T100 100" fill="none" stroke="#EC4899" strokeWidth="3" />
              <path d="M750 100 Q550 400 300 150 T50 450" fill="none" stroke="#06B6D4" strokeWidth="2" />
            </svg>
          </DrawPath>
        </div>

        {/* Ambient particle field — subtle floating particles */}
        <ParticleField density={0.15} color="rgba(124, 58, 237, 0.25)" className="z-[1]" />

        {/* Mesh gradient hero — 4-blob depth stack: each blob drifts on an 18s
            loop inside a scroll-parallax wrapper (framer owns the wrapper
            transform, CSS owns the blob's; no property fight), with the front
            blob hue-drifting violet→indigo as the page scrolls. */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" data-hero-mesh>
          <HeroBlobParallax scrollYProgress={scrollYProgress} depth={0.18} reduced={reducedMotion}>
            <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.08]"
              style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)", filter: "blur(80px)", animation: reducedMotion ? undefined : "aurora-drift 18s ease-in-out infinite" }}
            />
          </HeroBlobParallax>
          <HeroBlobParallax scrollYProgress={scrollYProgress} depth={0.1} reduced={reducedMotion}>
            <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.06]"
              style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)", filter: "blur(80px)", animation: reducedMotion ? undefined : "aurora-drift 18s ease-in-out infinite 4.5s" }}
            />
          </HeroBlobParallax>
          <HeroBlobParallax scrollYProgress={scrollYProgress} depth={0.04} reduced={reducedMotion} hue>
            <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full opacity-[0.05]"
              style={{ background: "radial-gradient(circle, #4F46E5 0%, transparent 70%)", filter: "blur(80px)", animation: reducedMotion ? undefined : "aurora-drift 18s ease-in-out infinite 9s" }}
            />
          </HeroBlobParallax>
          <HeroBlobParallax scrollYProgress={scrollYProgress} depth={-0.05} reduced={reducedMotion}>
            <div className="absolute top-1/2 right-1/3 w-[350px] h-[350px] rounded-full opacity-[0.04]"
              style={{ background: "radial-gradient(circle, #8B5CF6 0%, transparent 70%)", filter: "blur(80px)", animation: reducedMotion ? undefined : "aurora-drift 18s ease-in-out infinite 13.5s" }}
            />
          </HeroBlobParallax>
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
          <motion.div style={{ y: heroY, opacity: heroOpacity }}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C3AED]/8 border border-[#7C3AED]/15 text-[#8B5CF6] text-[11px] font-medium mb-6"
            >
              <span className="relative w-1.5 h-1.5 rounded-full bg-[#8B5CF6]">
                <span className="absolute inset-0 rounded-full bg-[#8B5CF6] animate-ping opacity-75" />
              </span>
              The AI learning system that remembers what you know
            </motion.div>

            {/*
              The headline is split into per-word inline-block spans for the
              stagger, which leaves no whitespace text nodes between them —
              the accessible name and any copy/paste would otherwise come out
              as "Actuallyrememberit." aria-label restores the real sentence
              for screen readers and search engines; the visual spacing comes
              from mr-[0.3em] on each word.
            */}
            <h1
              aria-label="Learn anything. Actually remember it."
              className="text-[#F0EFFE] text-4xl md:text-5xl lg:text-6xl font-light leading-[1.1] tracking-tight mb-4 overflow-hidden"
            >
              <ChromaticAberration intensity={2}>
                <TextAnimate
                  text="Learn anything."
                  as="span"
                  className="inline"
                  triggerOnView
                  speed={25}
                />
              </ChromaticAberration>
              <br />
              {[
                { text: "Actually", cls: "font-serif italic bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 bg-[length:200%_auto] text-transparent bg-clip-text animate-[gradient-shift_6s_ease_infinite]" },
                { text: "remember", cls: "" },
                { text: "it.", cls: "" },
              ].map((word, i) => (
                <motion.span
                  key={word.text}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className={`inline-block mr-[0.3em] ${word.cls}`}
                >
                  {word.text}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-[#7A7A96] text-sm leading-relaxed mb-8 max-w-md"
            >
              <TextScramble duration={1800} autoplay>
                Drop in a PDF, a video, or a topic. Aura builds your course — then quizzes you, schedules your reviews, and remembers exactly what you struggle with.
              </TextScramble>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <ClickSparkles count={8} color={['#7C3AED', '#8B5CF6', '#3B82F6', '#A78BFA']}>
                  <MagneticButton
                    onClick={() => { playClick(); goToAuth("hero"); }}
                    className="group relative px-6 py-2.5 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_30px_rgba(124,58,237,0.3)] overflow-hidden"
                  >
                    <span className="relative z-10">Start for free →</span>
                    <span
                      className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                        transform: "skewX(-15deg)",
                      }}
                    />
                  </MagneticButton>
                </ClickSparkles>
                <MagneticButton className="px-6 py-2.5 border border-[#2A2A3A] text-[#9090A8] text-sm rounded-lg hover:border-[#3A3A4F] hover:text-[#F0EFFE] transition-all">
                  See how it works
                </MagneticButton>
              </div>

              {/*
                Was an avatar stack of four i.pravatar.cc stock portraits
                beside "Join 1,248 learners building knowledge daily" — the
                same invented figure that ran in TrustStrip, next to photos of
                people who are not users.

                Pre-launch, the honest version of this slot is the offer, not
                a crowd — a checkable claim beats borrowed credibility.

                An earlier version of this slot claimed signup took no
                payment details. That was untrue: the checkout session sets
                payment_method_collection: 'always' alongside
                trial_period_days: 7, so Stripe does take a card up front. The
                claim below states the trial that actually exists, and
                pricingConsistency.test.ts pins it to the Stripe config.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 border-t border-[#2A2A3A]/30">
                <span className="inline-flex items-center gap-2 text-[#7A7A96] text-xs">
                  <Check size={13} className="shrink-0 text-[#7C3AED]" />
                  7 days free — cancel anytime
                </span>
                {/* Both claims are checkable: the trial length is set by
                    trial_period_days in the Stripe checkout session, and
                    offline review queueing is implemented in StudyModePage +
                    offlineStudyService with tests. Do not add a third bullet
                    here unless it is equally verifiable — Anki export, for
                    instance, has a service but no UI yet. */}
                <span className="inline-flex items-center gap-2 text-[#7A7A96] text-xs">
                  <Check size={13} className="shrink-0 text-[#7C3AED]" />
                  Works offline — reviews sync later
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* Hero Card with parallax */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative hidden md:flex justify-center"
            style={{ perspective: "1000px" }}
          >
            <motion.div
              className="relative"
              style={{ rotateX: cardRotateX, rotateY: cardRotateY }}
            >
              <div className="w-[340px]">
                <Flashcard card={HERO_CARD} showStack float compact={false} />
              </div>
              <div className="absolute -bottom-3 -right-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <Check size={12} className="shrink-0" />
                  Reviewed — see you in 3 days
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Strip */}
      <TrustStrip />

      {/* Marquee */}
      <section className="border-y border-[#2A2A3A] bg-[#0A0A0F] py-6">
        <Marquee
          items={[
            "TURN ANYTHING INTO A COURSE",
            "A TUTOR THAT REMEMBERS YOU",
            "FSRS v5 SCHEDULING",
            "PERSONAL LEARNING PATHS",
            "SPACED REPETITION",
            "MEMORY SCIENCE",
          ]}
          duration={32}
          className="text-2xl font-medium tracking-tight text-[#9090A8] md:text-3xl"
        />
      </section>

      {/* Manifesto */}
      <ManifestoSection />

      {/* Forgetting Curve — 2-column */}
      <section className="py-20 px-6 border-t border-[#2A2A3A]/30">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <ForgettingCurve />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-[#7A7A96] text-[10px] font-medium tracking-[0.2em] uppercase mb-3 block">THE SCIENCE</span>
            <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight mb-3">
              Your brain forgets on a <TextGlitch text="schedule" as="span" className="font-serif italic text-[#8B5CF6]" glitchOnHover autoGlitch autoGlitchInterval={8000} />
            </h2>
            <p className="text-[#7A7A96] text-xs leading-relaxed mb-4">
              AuraMind schedules each card right before you would forget it. You retain more in less time.
            </p>
            <a
              href="https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#8B5CF6] hover:text-[#7C3AED] text-xs font-medium transition-colors"
            >
              Based on the FSRS algorithm paper →
            </a>
          </motion.div>
        </div>
      </section>

      {/* Neural Core — interactive 3D brain */}
      <NeuralBrainSection />

      {/* AI Generation Demo */}
      <AIGenerationDemoSection />

      {/* Features */}
      <section id="features" className="py-20 px-6 border-t border-[#2A2A3A]/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight mb-2">
              Everything you need to actually <TextGlitch text="learn" as="span" className="font-serif italic text-[#8B5CF6]" glitchOnHover autoGlitch autoGlitchInterval={6000} autoGlitchDuration={150} />
            </h2>
            <p className="text-[#7A7A96] text-xs">No fluff. Just the tools that move the needle.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <FeatureCard index={0} icon={<FileText className="w-5 h-5" />} title="Anything → a course" desc="Drop in a PDF, a YouTube video, or a topic. Aura builds the cards, lessons, and quizzes around it." />
            <FeatureCard index={1} icon={<BrainCircuit className="w-5 h-5" />} title="A tutor that remembers you" desc="Aura tracks every review and anchors explanations on what you actually forget — not generic textbook advice." />
            <FeatureCard index={2} icon={<Headphones className="w-5 h-5" />} title="Study hands-free" desc="Aura speaks each question aloud, listens to your answer, and grades it. Perfect for commutes and chores." />
            <FeatureCard index={3} icon={<Mic className="w-5 h-5" />} title="Lectures → flashcards" desc="Record a lecture or upload audio. Aura transcribes it and builds your deck in seconds." />
          </div>
        </div>
      </section>

      {/* Study Mode Preview — horizontal strip */}
      <section className="py-20 px-6 border-t border-[#2A2A3A]/30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div
            ref={studyModeReveal.ref}
            // anime.js ScrollObserver tweens opacity + translateY into the
            // final state; we leave the element naturally opaque at rest so
            // SSR / no-JS users see the headline.
            style={{ willChange: 'opacity, transform' }}
            className="text-center md:text-left"
          >
            <span className="text-[#7A7A96] text-[10px] font-medium tracking-[0.2em] uppercase mb-3 block">THE STUDY SESSION</span>
            <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight">
              <TextSplit as="words" wrapperTag="span" stagger={45} duration={420}>
                Space to flip.
              </TextSplit>
              {" "}
              <kbd className="px-2 py-0.5 rounded bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-sm font-mono">1</kbd> again,{" "}
              <kbd className="px-2 py-0.5 rounded bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-sm font-mono">2</kbd> hard,{" "}
              <kbd className="px-2 py-0.5 rounded bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-sm font-mono">3</kbd> good,{" "}
              <kbd className="px-2 py-0.5 rounded bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-sm font-mono">4</kbd> easy.
            </h2>
            <p className="text-[#7A7A96] text-xs mt-3">Full keyboard control. Never touch your mouse during a study session.</p>
          </div>
          <div
            className="shrink-0"
          >
            <MagneticButton
              onClick={() => goToAuth("study-session")}
              className="px-5 py-2.5 bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-all shadow-[0_0_20px_rgba(124,58,237,0.2)]"
            >
              Try a study session →
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* Comparison: AuraMind vs Anki vs Quizlet vs RemNote */}
      <ComparisonSection />

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 border-t border-[#2A2A3A]/30">
        <div ref={pricingReveal.ref} className="max-w-6xl mx-auto" style={{ willChange: 'opacity, transform' }}>
          <div
            className="text-center mb-12"
          >
            <span className="text-[#7A7A96] text-[10px] font-medium tracking-[0.2em] uppercase mb-3 block">Pricing</span>
            <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight">
              <TextGlitch text="One" as="span" className="font-serif italic text-[#8B5CF6]" glitchOnHover autoGlitch autoGlitchInterval={7000} /> plan
            </h2>
          </div>

          <div
            ref={featuresGridReveal.ref}
            className="grid gap-4 max-w-xs mx-auto"
            style={{ willChange: 'opacity, transform' }}
          >
            {/* Pro */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
              className="relative"
            >
              <ShineBorder shineColor="rgba(124, 58, 237, 0.6)" duration={3}>
                <div className="p-6">
                  <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-[0.12]"
                    style={{ background: "radial-gradient(circle, #7C3AED 0%, #3B82F6 50%, transparent 70%)", filter: "blur(40px)" }}
                  />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#7C3AED] text-white text-[10px] font-medium rounded-full animate-pulse">
                    Most Popular
                  </div>
                  <h3 className="text-[#F0EFFE] text-sm font-medium mb-1">Pro</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-semibold text-[#F0EFFE]">$7.99</span>
                    <span className="text-[#7A7A96] text-xs">/month</span>
                  </div>
                  <p className="text-[10px] text-[#7A7A96] mb-1">or $3.99/mo billed annually ($47.88/yr)</p>
                  <p className="text-[10px] text-[#9090A8] mb-4">7 days free, then billed. Cancel anytime.</p>
                  <ul className="space-y-2 mb-6">
                    {["Unlimited decks & cards", "AI deck generation", "Advanced FSRS v5", "Priority support"].map((f, i) => (
                      <li key={i} className="text-[#9090A8] text-xs flex items-center gap-2">
                        <Check size={14} className="shrink-0 text-[#7C3AED]" /> {f}
                      </li>
                    ))}
                  </ul>
                  <MagneticButton
                    onClick={() => { playSuccess(); goToAuth("pricing-pro"); }}
                    className="w-full py-2.5 min-h-[44px] rounded-lg bg-[#7C3AED] text-white text-xs font-medium hover:bg-[#6D28D9] transition-all shadow-[0_0_20px_rgba(124,58,237,0.2)] relative z-10"
                  >
                    Start Free Trial
                  </MagneticButton>
                </div>
              </ShineBorder>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2A2A3A]/30 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center">
              <img src="/favicons,logos/favicon-32.png" alt="AuraMind" className="h-full w-full object-contain" />
            </div>
            <span className="text-[#F0EFFE] text-xs font-medium font-script">AuraMind</span>
          </div>
          <p className="text-[#3A3A4F] text-xs">Built by one person. Powered by real science.</p>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors">Privacy</a>
            <a href="/terms" className="text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors">Terms</a>
            <a href="/status" className="text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
