import React, { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon as ArrowRight,
  BookOpenIcon as BookOpen,
  CheckCircle2Icon as CheckCircle2,
  SparklesIcon as Sparkles,
  UserIcon as User,
} from "../icons/CustomIcons";
import {
  BarChart3,
  Brain,
  BrainCircuit,
  Code,
  Dna,
  FlaskConical,
  Languages,
  Music,
  Palette,
  ScrollText,
  ShieldCheck,
  Zap,
} from "../../components/icons";
import {
  PROF_AURA_PERSONALITY_OPTIONS,
  setStoredPersonality,
  type ProfAuraPersonality,
} from "../../lib/profAuraPersonality";

type OnboardingStep = "welcome" | "focus" | "coach";

interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const TOPICS = [
  { icon: Dna, label: "Biology" },
  { icon: Code, label: "Computer science" },
  { icon: BarChart3, label: "Math" },
  { icon: Languages, label: "Languages" },
  { icon: FlaskConical, label: "Chemistry" },
  { icon: ScrollText, label: "History" },
  { icon: ShieldCheck, label: "Law" },
  { icon: Zap, label: "Medicine" },
  { icon: Palette, label: "Design" },
  { icon: Music, label: "Music" },
  { icon: BarChart3, label: "Business" },
  { icon: Brain, label: "Psychology" },
] as const;

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: "welcome", label: "Start" },
  { id: "focus", label: "Focus" },
  { id: "coach", label: "Coach" },
];

const FIRST_RUN_FLAG = "auramind:completedTutorials";

function markOnboardingComplete() {
  try {
    const stored = localStorage.getItem(FIRST_RUN_FLAG);
    const completed = stored ? JSON.parse(stored) : [];
    const next = Array.isArray(completed) ? completed : [];
    if (!next.includes("onboarding")) next.push("onboarding");
    localStorage.setItem(FIRST_RUN_FLAG, JSON.stringify(next));
  } catch {
    // Storage is best effort; the user should still be able to enter the app.
  }
}

const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedPersonality, setSelectedPersonality] = useState<ProfAuraPersonality>("default");

  const stepIndex = STEPS.findIndex((step) => step.id === currentStep);
  const isLastStep = stepIndex === STEPS.length - 1;

  const finish = useCallback(() => {
    markOnboardingComplete();
    try {
      if (selectedTopic) localStorage.setItem("auramind:studyTopic", selectedTopic);
      setStoredPersonality(selectedPersonality);
    } catch {
      // Best effort only.
    }
    onComplete?.();
    onClose();
  }, [onClose, onComplete, selectedPersonality, selectedTopic]);

  const skip = useCallback(() => {
    markOnboardingComplete();
    onClose();
  }, [onClose]);

  const next = () => {
    if (isLastStep) {
      finish();
      return;
    }
    setCurrentStep(STEPS[stepIndex + 1].id);
  };

  const previous = () => {
    if (stepIndex > 0) setCurrentStep(STEPS[stepIndex - 1].id);
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-[#07101f]/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        aria-hidden="true"
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <motion.div
          className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-[#273653] bg-[#0d1629] shadow-[0_24px_80px_rgba(2,6,23,0.5)]"
          initial={{ y: 18, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          <div className="relative p-6 sm:p-8">
            <header className="flex items-start justify-between gap-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/80">
                  FIRST SESSION
                </p>
                <div className="mt-3 flex items-center gap-2" aria-label="Onboarding progress">
                  {STEPS.map((step, index) => (
                    <span
                      key={step.id}
                      className={`h-1.5 rounded-full transition-all ${
                        index <= stepIndex ? "w-12 bg-cyan-300" : "w-7 bg-[#263653]"
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-[10px] font-bold text-[#8290ad]">
                    {stepIndex + 1} of {STEPS.length}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={skip}
                className="min-h-10 rounded-xl px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8290ad] transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Skip for now
              </button>
            </header>

            <div className="mt-8 min-h-[330px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentStep === "welcome" && (
                    <section className="space-y-7">
                      <div className="max-w-md">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                          <Sparkles size={25} className="text-cyan-200" />
                        </div>
                        <h2
                          id="onboarding-title"
                          className="text-2xl font-black tracking-tight text-white"
                        >
                          Make your first session easy to start.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-[#9aa8c4]">
                          Choose a small target, make a few cards, and come back when your queue
                          says it is time. Everything else can wait.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          {
                            icon: BookOpen,
                            title: "Bring material",
                            detail: "Topic, file, or voice memo",
                          },
                          { icon: BrainCircuit, title: "Recall", detail: "Answer before you peek" },
                          {
                            icon: CheckCircle2,
                            title: "Return",
                            detail: "Short reviews, better timing",
                          },
                        ].map(({ icon: Icon, title, detail }) => (
                          <div
                            key={title}
                            className="rounded-2xl border border-[#263653] bg-[#111d33] p-4"
                          >
                            <Icon size={18} className="text-[#b9adff]" />
                            <p className="mt-4 text-xs font-bold text-white">{title}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[#8290ad]">{detail}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {currentStep === "focus" && (
                    <section>
                      <div className="max-w-md">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-300/10">
                          <Brain size={25} className="text-violet-200" />
                        </div>
                        <h2 className="text-2xl font-black tracking-tight text-white">
                          What do you want to work on first?
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-[#9aa8c4]">
                          This only sets a helpful starting point. You can change direction whenever
                          you want.
                        </p>
                      </div>
                      <div className="mt-6 grid grid-cols-3 gap-2">
                        {TOPICS.map(({ icon: Icon, label }) => {
                          const selected = selectedTopic === label;
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setSelectedTopic(selected ? "" : label)}
                              aria-pressed={selected}
                              className={`rounded-2xl border p-3 text-left transition-colors ${
                                selected
                                  ? "border-cyan-300/60 bg-cyan-300/10"
                                  : "border-[#263653] bg-[#111d33] hover:border-[#566b91]"
                              }`}
                            >
                              <Icon
                                size={17}
                                className={selected ? "text-cyan-200" : "text-[#9aa8c4]"}
                              />
                              <span className="mt-2 block text-[10px] font-bold text-white">
                                {label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-4 text-[10px] text-[#8290ad]">
                        Optional — continue without choosing a topic.
                      </p>
                    </section>
                  )}

                  {currentStep === "coach" && (
                    <section>
                      <div className="max-w-md">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-300/10">
                          <User size={25} className="text-pink-200" />
                        </div>
                        <h2 className="text-2xl font-black tracking-tight text-white">
                          Choose how Prof. Aura sounds.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-[#9aa8c4]">
                          Pick a tone for explanations and nudges. This is always available in your
                          profile settings.
                        </p>
                      </div>
                      <div className="mt-6 grid gap-2">
                        {PROF_AURA_PERSONALITY_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const selected = selectedPersonality === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSelectedPersonality(option.id)}
                              aria-pressed={selected}
                              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                                selected
                                  ? "border-cyan-300/60 bg-cyan-300/10"
                                  : "border-[#263653] bg-[#111d33] hover:border-[#566b91]"
                              }`}
                            >
                              <Icon size={18} className="shrink-0 text-[#b9adff]" />
                              <span className="min-w-0 flex-1">
                                <strong className="block text-xs text-white">{option.label}</strong>
                                <small className="mt-1 block text-[10px] leading-4 text-[#8290ad]">
                                  {option.description}
                                </small>
                              </span>
                              {selected && <CheckCircle2 size={17} className="text-cyan-200" />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="mt-8 flex items-center justify-between border-t border-[#263653] pt-5">
              <button
                type="button"
                onClick={previous}
                disabled={stepIndex === 0}
                className="min-h-11 rounded-xl px-3 text-xs font-bold text-[#8290ad] transition-colors hover:bg-white/[0.05] hover:text-white disabled:invisible"
              >
                Back
              </button>
              <button
                type="button"
                onClick={next}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d8d2ff] px-5 text-xs font-black text-[#17132d] transition-colors hover:bg-white"
              >
                {isLastStep ? "Open BonaMind" : "Continue"}
                <ArrowRight size={15} />
              </button>
            </footer>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
};

export default OnboardingTutorial;
