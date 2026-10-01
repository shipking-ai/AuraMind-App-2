"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "@/components/icons";
import { useState } from "react";
import type { FlashcardData } from "@/lib/auramind/types";

interface FlashcardProps {
  card: FlashcardData;
  showStack?: boolean;
  float?: boolean;
  compact?: boolean;
  flippable?: boolean;
  flipped?: boolean;
  onFlip?: () => void;
  className?: string;
}

export function Flashcard({
  card,
  showStack = true,
  float = false,
  compact = false,
  flippable = true,
  flipped,
  onFlip,
  className = "",
}: FlashcardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = flipped ?? internalFlipped;
  const handleFlip = () => {
    if (!flippable) return;
    if (onFlip) onFlip();
    else setInternalFlipped((f) => !f);
  };

  // The card is a div, so Enter/Space have to be wired by hand. Space also
  // scrolls the page by default, which would fight the flip.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      handleFlip();
    }
  };

  const rotate = -1.5;

  return (
    <div className={`relative ${className}`} style={{ "--rotate": `${rotate}deg` } as React.CSSProperties}>
      {showStack && (
        <>
          <div
            className="flashcard-paper absolute inset-0 rounded-[8px]"
            style={{
              transform: "rotate(-3deg) translateY(14px)",
              opacity: 0.6,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          />
          <div
            className="flashcard-paper absolute inset-0 rounded-[8px]"
            style={{
              transform: "rotate(2.5deg) translateY(7px)",
              opacity: 0.8,
              boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
            }}
          />
        </>
      )}

      <motion.div
        className={`flashcard-paper relative rounded-[8px] ${
          float ? "float-bob" : ""
        }`}
        style={{
          transform: `rotate(${rotate}deg)`,
          cursor: flippable ? "pointer" : undefined,
          boxShadow:
            "0 1px 0 0 #E8E4CC, 0 2px 0 0 #F5F0D8, 0 3px 0 0 #EDE8C8, 0 4px 6px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.35), 0 0 50px rgba(124,58,237,0.08)",
        }}
        onClick={handleFlip}
        onKeyDown={handleKeyDown}
        role={flippable ? "button" : undefined}
        tabIndex={flippable ? 0 : undefined}
      >
        {/* Red margin line */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0"
          style={{ left: "44px", width: "1px", background: "rgba(239, 68, 68, 0.28)" }}
        />

        <div className={compact ? "px-5 py-4" : "px-6 pt-5 pb-6"}>
          {/* Top strip */}
          <div className="flex items-start justify-between">
            <div className="text-[10px] uppercase font-medium text-[#8A8570] tracking-[0.15em] border-b border-[#D4CFA8] pb-1">
              {card.category}
            </div>
            <div className="text-[10px] text-[#B8B09A]">
              {card.cardNumber} / {card.totalCards}
            </div>
          </div>

          {/* Content area with ruled lines */}
          <div
            className="relative mt-4"
            aria-live="polite"
            style={{
              backgroundImage:
                "repeating-linear-gradient(transparent, transparent 31px, #E8E3CC 31px, #E8E3CC 32px)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!isFlipped ? (
                <motion.div
                  key="front"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="px-1"
                >
                  <div
                    className={`text-[#1A1828] font-medium text-center ${
                      compact ? "text-xl" : "text-2xl"
                    }`}
                    style={{
                      lineHeight: "32px",
                      minHeight: compact ? "96px" : "128px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {card.front}
                  </div>
                  {!compact && (
                    <div className="mt-2 flex flex-col items-center gap-0.5 text-[#B8B09A]">
                      <span className="text-xs">Tap to reveal</span>
                      <ChevronDown className="h-3 w-3" />
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="back"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                  className="px-1"
                >
                  <div className="text-sm text-[#6B6550] border-b border-dashed border-[#D4CFA8] pb-1">
                    {card.front}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-widest text-[#8A8570]">
                    Answer
                  </div>
                  <div className="mt-1 text-base font-medium text-[#1A1828] leading-snug">
                    {card.back}
                  </div>
                  {card.explanation && (
                    <div className="mt-3 text-xs text-[#6B6550] leading-relaxed">
                      <span className="font-semibold text-[#1A1828]">Why it matters — </span>
                      {card.explanation}
                    </div>
                  )}
                  {card.mnemonic && (
                    <div className="mt-2 rounded border border-[#D4CFA8] bg-[#FFF8E7] px-2 py-1 text-xs italic text-[#6B6550]">
                      {card.mnemonic}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
