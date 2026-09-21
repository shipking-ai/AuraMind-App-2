import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Check,
  FlaskConical,
  GraduationCap,
  Heart,
  Loader2,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "@/components/icons";
import { supabase } from "../../services/database/supabase";
import { analyticsService } from "../../services/analytics/analyticsService";
import { createTopicDeck } from "../../services/decks/topicDeckService";
import { hasCompletedOnboarding } from "../../lib/onboardingGate";
import {
  ONBOARDING_ROLES,
  ONBOARDING_ROLE_PROMISE,
  ONBOARDING_ROLE_TOPICS,
  type OnboardingRole,
} from "../../lib/onboardingRoles";
import { FrostGlass } from "../../components/ui/FrostGlass";
import { BorderBeam } from "../../components/ui/BorderBeam";

const ROLE_ICONS: Record<OnboardingRole, LucideIcon> = {
  learner: BookOpen,
  student: GraduationCap,
  teacher: Users,
  doctor: Heart,
  professional: Target,
  researcher: FlaskConical,
};

/** Marks the in-app dashboard tour done so it doesn't double-run. */
const FIRST_RUN_FLAG = "auramind:completedTutorials";

function markFirstRunComplete() {
  try {
    localStorage.setItem(FIRST_RUN_FLAG, JSON.stringify(["onboarding"]));
  } catch {
    /* storage unavailable — the tour can show once, not a blocker */
  }
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<"role" | "topic" | "building">("role");
  const [role, setRole] = useState<OnboardingRole | null>(null);
  const [topic, setTopic] = useState("");
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const completeRef = useRef(false);

  // Guard: route is reachable only for signed-in users who have not finished
  // onboarding. Everyone else bounces to /auth or /dashboard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data?.user) {
        navigate("/auth", { replace: true });
        return;
      }
      if (hasCompletedOnboarding(data.user.user_metadata)) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setUser({ id: data.user.id });
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const finish = useCallback(async () => {
    if (!user || completeRef.current) return;
    completeRef.current = true;

    try {
      // Persist persona + topic so the dashboard can greet them later.
      // user_metadata is display-only here — authorization never reads it.
      const updateMeta = supabase
        ? supabase.auth.updateUser({
            data: {
              role: role ?? "learner",
              onboarding_topic: topic.trim() || null,
              onboarding_completed: true,
            },
          })
        : Promise.resolve();

      // Premade cards on their topic (or the offline starter deck). The deck
      // is created BEFORE the plan step so it already exists when they first
      // open the app — no empty library behind the paywall.
      const buildDeck = user
        ? createTopicDeck(user.id, topic).catch((err) => {
            console.error("[OnboardingFlow] Could not pre-create a deck:", err);
            return null;
          })
        : Promise.resolve(null);

      const [, deckResult] = await Promise.all([updateMeta, buildDeck]);

      if (deckResult) {
        analyticsService.trackFunnel("onboarding_completed", {
          role: role ?? "learner",
          topic: topic.trim() || null,
        });
      }

      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (topic.trim()) params.set("topic", topic.trim());
      const qs = params.toString();

      markFirstRunComplete();
      navigate(`/subscribe${qs ? `?${qs}` : ""}`, { replace: true });
    } catch (err) {
      completeRef.current = false;
      setBuildingError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStep("topic");
    }
  }, [user, role, topic, navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 size={24} className="text-[#8B5CF6] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex relative overflow-hidden">
      {/* Aurora glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <img
          src="/auramind/aurora-glow.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: 0.25 }}
        />
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)", filter: "blur(100px)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[420px] h-[420px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)", filter: "blur(90px)" }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-2xl">
          {/* Progress */}
          <div className="flex items-center justify-center gap-2 mb-10">
            {(["role", "topic", "building"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    step === s
                      ? "w-10 bg-[#8B5CF6]"
                      : (step === "topic" && s === "role") || step === "building"
                        ? "w-6 bg-[#8B5CF6]/60"
                        : "w-6 bg-[#2A2A3A]"
                  }`}
                />
                {i < 2 && <div className="w-1.5 h-1.5 rounded-full bg-[#2A2A3A]" />}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === "role" && (
              <motion.div
                key="role"
                variants={container}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.25, ease: "easeIn" } }}
              >
                <motion.div variants={item} className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-full text-[#8B5CF6] text-[10px] font-semibold uppercase tracking-wider mb-5">
                    <Sparkles size={12} /> Step 1 of 2
                  </div>
                  <h1 className="text-[#F0EFFE] text-3xl font-light tracking-tight mb-2">
                    What brings you here?
                  </h1>
                  <p className="text-[#7A7A96] text-sm">
                    Pick who you are. We'll shape your plan around it.
                  </p>
                </motion.div>

                <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                  {ONBOARDING_ROLES.map((r) => {
                    const Icon = ROLE_ICONS[r.value];
                    const selected = role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        aria-pressed={selected}
                        className={`group relative text-left p-4 rounded-xl border transition-all duration-200 ${
                          selected
                            ? "border-[#8B5CF6] bg-[#8B5CF6]/10 ring-1 ring-[#8B5CF6]/30"
                            : "border-[#2A2A3A] bg-[#111118]/80 hover:border-[#3A3A4F] hover:bg-[#15151E]"
                        }`}
                      >
                        {selected && (
                          <motion.div
                            layoutId="role-check"
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#8B5CF6] flex items-center justify-center"
                          >
                            <Check size={11} className="text-white" />
                          </motion.div>
                        )}
                        <Icon
                          size={18}
                          className={`mb-3 ${selected ? "text-[#A78BFA]" : "text-[#6B6B85] group-hover:text-[#A78BFA]"} transition-colors`}
                        />
                        <div className="text-sm font-medium text-[#F0EFFE]">{r.label}</div>
                        <div className="text-[10px] text-[#7A7A96] mt-0.5 leading-snug">
                          {ONBOARDING_ROLE_PROMISE[r.value]}
                        </div>
                      </button>
                    );
                  })}
                </motion.div>

                <motion.div variants={item} className="mt-8">
                  <button
                    type="button"
                    disabled={!role}
                    onClick={() => setStep("topic")}
                    className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_24px_rgba(124,58,237,0.25)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    Continue
                    <ArrowRight size={14} />
                  </button>
                </motion.div>
              </motion.div>
            )}

            {step === "topic" && (
              <motion.div
                key="topic"
                variants={container}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.25, ease: "easeIn" } }}
              >
                <motion.div variants={item} className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-full text-[#8B5CF6] text-[10px] font-semibold uppercase tracking-wider mb-5">
                    <Sparkles size={12} /> Step 2 of 2
                  </div>
                  <h1 className="text-[#F0EFFE] text-3xl font-light tracking-tight mb-2">
                    What do you want to learn?
                  </h1>
                  <p className="text-[#7A7A96] text-sm">
                    Any topic works — type your own or tap a suggestion. We'll prepare cards for it
                    right now.
                  </p>
                </motion.div>

                <motion.div variants={item}>
                  <BorderBeam duration={5} colorFrom="#7c3aed" colorTo="#3b82f6">
                    <FrostGlass blur="xl" opacity={0.08} className="p-4">
                      <input
                        autoFocus
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && topic.trim()) {
                            e.preventDefault();
                            setStep("building");
                          }
                        }}
                        placeholder={
                          role === "teacher"
                            ? "e.g. Lesson planning for 9th grade biology"
                            : role === "doctor"
                              ? "e.g. Cardiac anatomy"
                              : role === "researcher"
                                ? "e.g. Statistical methods for RCTs"
                                : role === "professional"
                                  ? "e.g. SQL for data analysis"
                                  : "e.g. Spanish basics"
                        }
                        className="w-full bg-transparent outline-none text-[#F0EFFE] text-base placeholder:text-[#5A5A72]"
                      />
                    </FrostGlass>
                  </BorderBeam>
                </motion.div>

                <motion.div variants={item} className="mt-6 mb-8">
                  <p className="text-[10px] text-[#7A7A96] uppercase tracking-wider mb-3">
                    Popular with {role ? ONBOARDING_ROLES.find((r) => r.value === role)?.label : "learners"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ONBOARDING_ROLE_TOPICS[role ?? "learner"].map((suggestion, i) => (
                      <motion.button
                        key={suggestion}
                        type="button"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.06, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        onClick={() => {
                          setTopic(suggestion);
                          setStep("building");
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                          topic === suggestion
                            ? "border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#C4B5FD]"
                            : "border-[#2A2A3A] bg-[#111118]/80 text-[#7A7A96] hover:border-[#3A3A4F] hover:text-[#F0EFFE]"
                        }`}
                      >
                        {suggestion}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {buildingError && (
                  <motion.p variants={item} className="mb-4 text-xs text-red-400 text-center">
                    {buildingError}
                  </motion.p>
                )}

                <motion.div variants={item} className="mt-8">
                  <button
                    type="button"
                    disabled={!topic.trim()}
                    onClick={() => setStep("building")}
                    className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_24px_rgba(124,58,237,0.25)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    Prepare my cards
                    <Sparkles size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("building")}
                    disabled={false}
                    className="w-full mt-2 py-2 text-xs text-[#7A7A96] hover:text-[#F0EFFE] transition-colors"
                  >
                    Skip — use a sample deck instead
                  </button>
                </motion.div>
              </motion.div>
            )}

            {step === "building" && (
              <motion.div
                key="building"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="relative w-20 h-20 mx-auto mb-8">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/30"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-[#8B5CF6] border-l-transparent"
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles size={18} className="text-[#A78BFA]" />
                  </div>
                </div>
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-[#F0EFFE] text-2xl font-light tracking-tight mb-3"
                >
                  {topic.trim() ? "Preparing your cards…" : "Setting up your sample deck…"}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-[#7A7A96] text-sm mb-8 mx-auto max-w-sm"
                >
                  {topic.trim()
                    ? `Building a starter deck on "${topic.trim()}" — almost ready to study.`
                    : "One tap and you're studying."}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mx-auto max-w-xs space-y-2"
                >
                  {["Choosing your plan…", "You're one step from the app."].map((msg, i) => (
                    <div
                      key={msg}
                      className="flex items-center gap-2 text-left text-[#7A7A96] text-xs"
                      style={{ opacity: 1 }}
                    >
                      <Loader2 size={12} className="text-[#8B5CF6] animate-spin shrink-0" />
                      <span className={i === 0 ? "opacity-60" : "opacity-90"}>{msg}</span>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Building step runs completion in an effect so it survives
              re-renders while the deck is generated. */}
          <BuildGate step={step} onFinish={finish} />
        </div>
      </div>
    </div>
  );
}

/**
 * Triggers `finish` exactly once when the "building" step mounts. Kept as a
 * tiny separate component so the effect fires only on the step transition,
 * not on every parent re-render.
 */
function BuildGate({ step, onFinish }: { step: "role" | "topic" | "building"; onFinish: () => void }) {
  useEffect(() => {
    if (step === "building") {
      onFinish();
    }
  }, [step, onFinish]);
  return null;
}