"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { VideoBackground } from "./VideoBackground";

const TOPICS = [
  "The electron transport chain and ATP synthesis",
  "Stoic philosophy and the dichotomy of control",
  "React hooks: useState and useEffect",
  "The French Revolution — causes and phases",
];

const GENERATED_CARDS: Record<number, { term: string; def: string }[]> = {
  0: [
    { term: "Proton-motive force", def: "Stored energy from the proton gradient across the inner membrane." },
    { term: "Complex I", def: "NADH dehydrogenase — first proton pump in the ETC." },
    { term: "Chemiosmosis", def: "Movement of ions across a semipermeable membrane down their gradient." },
    { term: "Oxidative phosphorylation", def: "ATP production driven by electron transfer to oxygen." },
  ],
  1: [
    { term: "Dichotomy of control", def: "Some things are up to us, others are not." },
    { term: "Apatheia", def: "Freedom from destructive passions — not numbness." },
    { term: "Memento mori", def: "Remember you will die — a focus sharpening practice." },
    { term: "Amor fati", def: "Love of one's fate, including its hardship." },
  ],
  2: [
    { term: "useState", def: "Hook that lets a function component hold local state." },
    { term: "useEffect", def: "Hook for syncing with external systems after render." },
    { term: "Dependency array", def: "List that controls when an effect re-runs." },
    { term: "Stale closure", def: "When a hook captures an old value of a variable." },
  ],
  3: [
    { term: "Estates-General", def: "The three-part assembly summoned in 1789." },
    { term: "Bastille", def: "Stormed July 14, 1789 — symbolic start of the Revolution." },
    { term: "Reign of Terror", def: "1793–94 purge period led by Robespierre." },
    { term: "Directory", def: "Five-member executive that ruled 1795–1799." },
  ],
};

function TypewriterDemo({
  topic,
  cards,
  onComplete,
}: {
  topic: string;
  cards: { term: string; def: string }[];
  onComplete: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [generating, setGenerating] = useState(false);
  const [visibleCards, setVisibleCards] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    let i = 0;
    const typeInterval = setInterval(() => {
      i += 1;
      setTyped(topic.slice(0, i));
      if (i >= topic.length) {
        clearInterval(typeInterval);
        timers.push(setTimeout(() => setGenerating(true), 400));
        timers.push(
          setTimeout(() => {
            setGenerating(false);
            let c = 0;
            const cardInterval = setInterval(() => {
              c += 1;
              setVisibleCards(c);
              if (c >= 4) {
                clearInterval(cardInterval);
                timers.push(setTimeout(onComplete, 2200));
              }
            }, 320);
            intervals.push(cardInterval);
          }, 1400),
        );
      }
    }, 28);
    intervals.push(typeInterval);

    return () => {
      intervals.forEach(clearInterval);
      timers.forEach(clearTimeout);
    };
  }, [topic, onComplete]);

  return (
    <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-2xl border border-[#2A2A3A] bg-[#111118] px-6">
      <div className="-mx-6 flex items-center gap-2 border-b border-[#2A2A3A] bg-[#1A1A24] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
        <span className="mx-auto text-xs text-[#7A7A96]">
          BonaMind — AI Deck Generator
        </span>
      </div>

      <div className="pt-6">
        <div className="text-xs uppercase tracking-widest text-[#7A7A96]">
          What do you want to learn?
        </div>
        <div className="mt-2 rounded-xl border border-[#2A2A3A] bg-[#1A1A24] px-4 py-3 text-sm text-[#F0EFFE]">
          {typed}
          <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-violet-400 align-middle animate-pulse" />
        </div>
        <button
          disabled
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-medium text-white"
        >
          {generating ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Generating...
            </>
          ) : (
            "Generate 20 cards"
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 pb-6 pt-4">
        {cards.slice(0, visibleCards).map((c, i) => (
          <motion.div
            key={`${topic.slice(0, 12)}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4"
          >
            <div className="text-sm font-medium text-[#F0EFFE]">{c.term}</div>
            <div className="my-2 border-t border-[#2A2A3A]" />
            <div className="text-xs text-[#9090A8]">{c.def}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function AIGenerationDemoSection() {
  const [topicIdx, setTopicIdx] = useState(0);
  const advance = () => setTopicIdx((t) => (t + 1) % TOPICS.length);

  return (
    <section className="relative border-t border-[#2A2A3A] overflow-hidden py-24">
      <VideoBackground name="ai-gen-reveal" opacity={0.25} blur="lg" lazy />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-4xl font-medium leading-tight">
          Type a topic.
          <br />
          <span className="font-serif italic text-violet-400">Watch the magic.</span>
        </h2>
        <p className="mt-4 text-[#9090A8]">No manual card creation. No copy-pasting notes.</p>
      </div>

      <TypewriterDemo
        key={topicIdx}
        topic={TOPICS[topicIdx]}
        cards={GENERATED_CARDS[topicIdx] ?? []}
        onComplete={advance}
      />
    </section>
  );
}
