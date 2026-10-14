/**
 * ChatTour — first-visit overlay that walks new users through the Prof. Linnea
 * surfaces in four steps: the live profile, contextual prompts, voice input,
 * and conversation history.
 *
 * The spotlight is measured from the real control marked with
 * `data-chat-tour`. It must never rely on a guessed viewport coordinate: the
 * header, composer, and empty state all move between desktop, mobile, and
 * Android layouts.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Mic, History, ArrowRight } from "@/components/icons";
import ProfLinnea from "./ProfLinnea";
import {
  CHAT_TOUR_TARGETS,
  chatTourSelector,
  type ChatTourTarget,
} from "../../lib/chatTutorialAnchors";

interface Step {
  key: string;
  icon: ReactNode;
  title: string;
  body: string;
  target: ChatTourTarget;
}

const STEPS: Step[] = [
  {
    key: "avatar",
    icon: <ProfLinnea variant="rest" size={32} />,
    title: "Meet Prof. Linnea",
    body: "This live status mark is Prof. Linnea. It responds to your activity and voice, so you can tell when the coach is ready or listening.",
    target: CHAT_TOUR_TARGETS.avatar,
  },
  {
    key: "prompts",
    icon: <Sparkles size={22} />,
    title: "Start with a prompt",
    body: "These suggestions are a quick way to ask for a quiz, an explanation, or a new card. They change after each reply to stay relevant.",
    target: CHAT_TOUR_TARGETS.prompts,
  },
  {
    key: "mic",
    icon: <Mic size={22} />,
    title: "Speak your question",
    body: "Use this microphone to dictate a question. Tap it again to stop; your transcript stays in the composer so you can edit it before sending.",
    target: CHAT_TOUR_TARGETS.mic,
  },
  {
    key: "history",
    icon: <History size={22} />,
    title: "Pick up where you left off",
    body: "Chat history lives here. Open it to resume, rename, pin, search, export, or delete a conversation.",
    target: CHAT_TOUR_TARGETS.history,
  },
];

interface Props {
  /** Force-show (e.g. "?" menu). When true, overrides localStorage flag. */
  force?: boolean;
}

function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return Boolean(
    a && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height,
  );
}

/** Keep the spotlight attached while the page scrolls, resizes, or reflows. */
function useChatTourRect(target: ChatTourTarget, open: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    let animationFrame = 0;
    let observedElement: Element | null = null;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;

    const measure = () => {
      const element = document.querySelector(chatTourSelector(target));
      if (!element) {
        setRect(null);
        return;
      }

      if (element !== observedElement) {
        if (observedElement) resizeObserver?.unobserve(observedElement);
        observedElement = element;
        resizeObserver?.observe(element);
      }

      const nextRect = element.getBoundingClientRect();
      setRect((previous) => (sameRect(previous, nextRect) ? previous : nextRect));
    };

    function schedule() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    }

    measure();
    schedule();
    const retryTimer = window.setInterval(measure, 250);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    resizeObserver?.observe(document.body);

    const mutationObserver =
      typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.clearInterval(retryTimer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [open, target]);

  return rect;
}

export default function ChatTour({ force = false }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const anchorRect = useChatTourRect(current.target, open);

  /** Write completion only when the user actually dismisses or finishes. */
  const close = useCallback((completed = true) => {
    if (completed) {
      try {
        window.localStorage.setItem("bonamind.aurachat.tourComplete.v1", "1");
      } catch {
        // Storage is best effort.
      }
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    try {
      if (force) {
        setStep(0);
        setOpen(true);
        return;
      }
      if (!window.localStorage.getItem("bonamind.aurachat.tourComplete.v1")) {
        setStep(0);
        setOpen(true);
      }
    } catch {
      // A blocked storage area should not prevent the tour from appearing.
      setStep(0);
      setOpen(true);
    }
  }, [force]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const advance = () => {
    if (step >= STEPS.length - 1) close(true);
    else setStep((currentStep) => currentStep + 1);
  };

  if (!open || !current) return null;

  return (
    <>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Prof. Linnea"
        onClick={() => close(true)}
      />

      {anchorRect && (
        <SpotlightRing rect={anchorRect} index={step} total={STEPS.length} label={current.title} />
      )}

      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="fixed left-1/2 top-1/2 z-[1001] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#2A2A3A] bg-[#0E0E15] p-6 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.7)]"
        role="document"
      >
        {/* Header row */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7C3AED]/30 bg-gradient-to-br from-[#7C3AED]/30 to-[#06B6D4]/30">
              {current.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#A78BFA]">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 className="text-base font-semibold text-[#F0EFFE]">{current.title}</h2>
            </div>
          </div>
          <button
            onClick={() => close(true)}
            aria-label="Close tour"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7A7A96] hover:bg-[#1A1A24] hover:text-[#F0EFFE]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed text-[#C4C4D4]">{current.body}</p>

        {/* Step dots */}
        <div className="mb-5 mt-5 flex items-center justify-center gap-1.5">
          {STEPS.map((tourStep, index) => (
            <span
              key={tourStep.key}
              className={`h-1.5 rounded-full transition-all ${
                index === step ? "w-4 bg-[#7C3AED]" : "w-1.5 bg-[#3A3A4F]"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => close(true)}
            className="text-[11px] text-[#7A7A96] transition-colors hover:text-[#9090A8]"
          >
            Skip tour
          </button>
          <button
            onClick={advance}
            className="flex items-center gap-1.5 rounded-xl bg-[#7C3AED] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#6D28D9]"
          >
            {step === STEPS.length - 1 ? "Got it" : "Next"}
            <ArrowRight size={12} />
          </button>
        </div>
      </motion.div>
    </>
  );
}

/** Draw a compact rectangle around the exact control, not a guessed viewport circle. */
function SpotlightRing({
  rect,
  index,
  total,
  label,
}: {
  rect: DOMRect;
  index: number;
  total: number;
  label: string;
}) {
  const inset = 8;
  const left = Math.max(4, rect.left - inset);
  const top = Math.max(4, rect.top - inset);
  const width = Math.max(44, rect.width + inset * 2);
  const height = Math.max(44, rect.height + inset * 2);

  return (
    <motion.div
      key={`${index}-${rect.left}-${rect.top}-${rect.width}-${rect.height}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      data-testid="chat-tour-spotlight"
      className="pointer-events-none fixed z-[1001] rounded-[14px] border-2 border-[#C4B5FD]"
      style={{
        left,
        top,
        width,
        height,
        boxShadow:
          "0 0 0 4px rgba(124,58,237,0.18), 0 0 0 9999px rgba(0,0,0,0.08), 0 0 28px rgba(167,139,250,0.38)",
      }}
      aria-hidden="true"
    >
      <span className="absolute -right-2 -top-3 rounded-full border border-[#A78BFA]/60 bg-[#171322] px-1.5 py-0.5 text-[9px] font-mono text-[#C4B5FD] shadow-lg">
        {index + 1}/{total}
      </span>
      <span className="sr-only">{label}</span>
    </motion.div>
  );
}
