"use client";

import { Check, Minus } from "@/components/icons";
import {
  StaggerList,
  useScrollReveal,
} from "../../lib/effects";

type CellState = "yes" | "partial" | "no";

interface ProductDef {
  id: "auramind" | "anki" | "quizlet" | "remnote";
  label: string;
  highlight: boolean;
}

const PRODUCTS: ProductDef[] = [
  { id: "auramind", label: "BonaMind", highlight: true },
  { id: "anki", label: "Anki", highlight: false },
  { id: "quizlet", label: "Quizlet", highlight: false },
  { id: "remnote", label: "RemNote", highlight: false },
];

interface ComparisonRow {
  feature: string;
  detail: string;
  values: Record<ProductDef["id"], CellState>;
}

const ROWS: ComparisonRow[] = [
  {
    feature: "AI deck generation",
    detail: "Paste a topic — get a complete deck in 30 seconds",
    values: { auramind: "yes", anki: "no", quizlet: "partial", remnote: "partial" },
  },
  {
    feature: "FSRS v5 scheduling",
    detail: "Modern memory science, designed to need fewer reviews (Anki users can opt in)",
    values: { auramind: "yes", anki: "partial", quizlet: "no", remnote: "no" },
  },
  {
    feature: "Bring your Anki decks (.apkg)",
    detail: "Import your existing library in one click",
    values: { auramind: "yes", anki: "yes", quizlet: "no", remnote: "no" },
  },
  {
    feature: "Concept map linking",
    detail: "Link cards across decks to see the bigger picture",
    values: { auramind: "yes", anki: "no", quizlet: "no", remnote: "partial" },
  },
  {
    feature: "Native mobile + desktop",
    detail: "Offline study, OS-level notifications, no churn",
    values: { auramind: "yes", anki: "yes", quizlet: "partial", remnote: "partial" },
  },
  {
    feature: "Generous free tier",
    detail: "No card caps to start, no zero-day schedule paywall",
    values: { auramind: "yes", anki: "yes", quizlet: "partial", remnote: "yes" },
  },
];

function Cell({ state, highlight }: { state: CellState; highlight: boolean }) {
  if (state === "yes") {
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
          highlight
            ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/30"
            : "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
        }`}
        aria-label={state}
        role="img"
      >
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "partial") {
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
          highlight
            ? "bg-violet-500/10 text-violet-300/70 ring-1 ring-violet-400/15"
            : "bg-zinc-700/40 text-zinc-400 ring-1 ring-zinc-600/20"
        }`}
        aria-label={state}
        role="img"
      >
        <Minus className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-zinc-700" aria-label={state} role="img">
      <Minus className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

export function ComparisonSection() {
  // anime.js v4 ScrollObserver replaces the framer-motion whileInView
  // wrappers so reveal cadence + easing live in one place. Each
  // `enter` param is an anime.js v4 property animator (the second arg
  // is the from→to for `opacity` and `translateY` from the
  // `ScrollObserver` callback). Once-fired behavior is the lib's default.
  const headerReveal = useScrollReveal<HTMLDivElement>({
    enter: { duration: 600, opacity: [0, 1], translateY: [16, 0] },
  });
  const tableReveal = useScrollReveal<HTMLDivElement>({
    enter: { duration: 500, opacity: [0, 1], translateY: [24, 0] },
  });

  return (
    <section
      id="compare"
      className="relative py-20 px-6 border-t border-[#2A2A3A]/30 overflow-hidden"
    >
      {/* Subtle violet ambient backdrop — no video dependency */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div
          ref={headerReveal.ref}
          className="text-center mb-12"
          style={{ willChange: "opacity, transform" }}
        >
          <span className="text-[#7A7A96] text-[10px] font-medium tracking-[0.2em] uppercase mb-3 block">
            How BonaMind stacks up
          </span>
          <h2 className="text-[#F0EFFE] text-2xl md:text-3xl font-light tracking-tight mb-3">
            Built for people who{" "}
            <span className="font-serif italic text-[#8B5CF6]">actually finish</span>{" "}
            a deck.
          </h2>
          <p className="text-[#7A7A96] text-xs max-w-2xl mx-auto leading-relaxed">
            Other tools either drown you in manual card creation or hand-wave the
            science. BonaMind lives at the intersection — modern algorithms, modern
            UX, built for people who actually want to remember what they study.
          </p>
        </div>

        {/* Comparison table — anime.js v4 ScrollObserver fires once on enter;
            the inner StaggerList cascades the body rows after that. WrapStagger
            uses `display: contents` so the StaggerList wrapper doesn't disturb
            the grid layout of the table. */}
        <div
          ref={tableReveal.ref}
          // Split overflow axes so the absolutely-positioned "THIS ONE"
          // pill at `-top-1` doesn't get clipped by the rounded wrapper.
          // Horizontal still hides so column rounding stays crisp; vertical
          // lets the pill breathe above the column.
          className="rounded-xl bg-[#111118] border border-[#2A2A3A] overflow-x-hidden overflow-y-visible"
          style={{ willChange: "opacity, transform" }}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] border-b border-[#2A2A3A]">
                <div className="p-4 text-[#7A7A96] text-[10px] uppercase tracking-[0.2em] font-medium flex items-center">
                  Feature
                </div>
                {PRODUCTS.map((p) => (
                  <div
                    key={p.id}
                    className={`relative p-4 text-center text-xs font-medium ${
                      p.highlight
                        ? "text-[#F0EFFE] bg-gradient-to-b from-violet-500/[0.10] to-transparent"
                        : "text-[#9090A8]"
                    }`}
                  >
                    {p.highlight && (
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#7C3AED] text-white text-[8px] font-medium rounded-full tracking-[0.1em] shadow-[0_0_12px_rgba(124,58,237,0.4)]">
                        THIS ONE
                      </span>
                    )}
                    {p.label}
                  </div>
                ))}
              </div>

              {/* Body rows — StaggerList replaces the per-row motion.div so all
                  rows share a single anime.js timeline. Each row gets a
                  `data-stagger-item` attr; the inner grid layout stays intact. */}
              <StaggerList
                delayMs={50}
                durationMs={400}
                from="left"
                distance={6}
                className="contents"
              >
                {ROWS.map((row, idx) => (
                  <div
                    key={row.feature}
                    data-row-idx={idx}
                    className={`grid grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] border-b border-[#2A2A3A]/40 last:border-b-0 transition-colors hover:bg-[#16161F]/50 ${
                      idx % 2 === 0 ? "bg-transparent" : "bg-[#0D0D14]/40"
                    }`}
                  >
                    <div className="p-4">
                      <div className="text-[#F0EFFE] text-xs font-medium">
                        {row.feature}
                      </div>
                      <div className="text-[#7A7A96] text-[10px] mt-0.5 leading-relaxed">
                        {row.detail}
                      </div>
                    </div>
                    {PRODUCTS.map((p) => (
                      <div
                        key={p.id}
                        className={`p-4 flex items-center justify-center ${
                          p.highlight
                            ? "bg-gradient-to-b from-violet-500/[0.05] to-transparent"
                            : ""
                        }`}
                      >
                        <Cell state={row.values[p.id]} highlight={p.highlight} />
                      </div>
                    ))}
                  </div>
                ))}
              </StaggerList>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#3A3A4F] text-center mt-6">
          Comparison as of BonaMind v2.0.0 · Aug 2026 · Feature availability may
          vary by competitor plan tier.
        </p>
      </div>
    </section>
  );
}
