import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { deviceName } from "../../lib/platform";

export default function AndroidWelcomeScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const isPreview = location.pathname.includes("__e2e");
  const [phase, setPhase] = useState<"welcome" | "out">("welcome");

  useEffect(() => {
    if (isPreview) {
      const interval = setInterval(() => {
        setPhase((p) => (p === "welcome" ? "out" : "welcome"));
      }, 1900);
      const outTimeout = setTimeout(() => setPhase("out"), 1900);
      return () => {
        clearInterval(interval);
        clearTimeout(outTimeout);
      };
    }
    const t1 = setTimeout(() => setPhase("out"), 1900);
    const t2 = setTimeout(() => navigate("/auth"), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [navigate, isPreview]);

  return (
    <main
      className="android-welcome-screen relative overflow-hidden bg-[#0a0a0a] min-h-screen flex flex-col"
      data-testid="android-welcome-screen"
      onClick={() => navigate("/auth")}
    >
      {/* Warm expressive blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full opacity-[0.18]" style={{ background: "radial-gradient(circle, #6750A4 0%, transparent 70%)", filter: "blur(48px)" }} />
        <div className="absolute -bottom-32 -right-24 h-[520px] w-[520px] rounded-full opacity-[0.12]" style={{ background: "radial-gradient(circle, #7C62B8 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #E8DEF8 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      <AnimatePresence>
        {phase === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="relative flex flex-1 flex-col items-center justify-center px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.85, rotate: -4, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.85, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-[28px] bg-[#6750A4] blur-[22px] opacity-30" />
              <div className="relative grid h-[88px] w-[88px] place-items-center rounded-[26px] bg-[#6750A4] shadow-[0_10px_32px_rgba(103,80,164,0.4)]">
                <img src="/favicons,logos/favicon.svg" alt="" className="h-11 w-11" />
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.5 }}
              className="mt-8 text-[12px] font-bold tracking-[0.22em] text-[#E8DEF8]/60 uppercase"
              style={{ fontFamily: "'Google Sans', Inter, sans-serif" }}
            >
              Welcome to
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 16, letterSpacing: "0.06em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "-0.01em" }}
              transition={{ delay: 0.45, duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
              className="mt-1 text-[42px] font-bold leading-none tracking-tight text-white"
              style={{ fontFamily: "'Google Sans', Inter, sans-serif" }}
            >
              AuraMind
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.78, duration: 0.5 }}
              className="mt-3 max-w-[300px] text-[14px] leading-5 text-white/45"
            >
              A quiet place to recall — expressive, focused, yours.
            </motion.p>

            {/* Material tonal divider — pill */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.08, duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
              className="mt-8 h-1 w-20 origin-center rounded-full bg-[#6750A4]"
            />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25, duration: 0.4 }}
              className="mt-3 text-[11px] font-medium tracking-wide text-white/25"
            >
              Tap to continue →
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "out" ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        className="pointer-events-none absolute inset-0 bg-[#0a0a0a]"
      />

      <div className="relative pb-[max(14px,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] tracking-wide text-white/20">AuraMind for {deviceName()}</div>
    </main>
  );
}
