/**
 * First screen of the iPhone app for a signed-out user, in the style of
 * Apple's own welcome screens: the mark, a large title, three feature rows
 * with coloured symbols, and a single prominent button pinned to the bottom.
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, MessageCircle, Sparkles } from "../icons";
import { iosTap } from "./iosHaptics";

const FEATURES = [
  {
    icon: Sparkles,
    color: "var(--ios-tint)",
    title: "Decks from anything",
    body: "Turn a topic, PDF, video or lecture into cards in seconds.",
  },
  {
    icon: Brain,
    color: "var(--ios-green)",
    title: "Reviews at the right moment",
    body: "AuraMind brings each card back just before you would forget it.",
  },
  {
    icon: MessageCircle,
    color: "var(--ios-teal)",
    title: "A tutor who knows you",
    body: "Prof. Aura explains what you keep missing, out loud if you like.",
  },
];

export default function IOSWelcomeScreen() {
  const navigate = useNavigate();
  return (
    <div className="ios-app" data-testid="ios-welcome">
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding:
            "calc(env(safe-area-inset-top, 0px) + 56px) 32px calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}
      >
        <motion.img
          src="/favicons,logos/icon-192.png"
          alt=""
          width={84}
          height={84}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          style={{
            borderRadius: 20,
            alignSelf: "center",
            boxShadow: "0 12px 40px rgba(139, 92, 246, 0.45)",
          }}
        />
        <motion.h1
          className="ios-large-title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ textAlign: "center", marginTop: 24 }}
        >
          Welcome to AuraMind
        </motion.h1>

        <div style={{ display: "grid", gap: 26, marginTop: 44 }}>
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
            >
              <feature.icon
                style={{ width: 34, height: 34, flexShrink: 0, color: feature.color }}
                aria-hidden
              />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.24 }}>
                  {feature.title}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    lineHeight: "20px",
                    color: "var(--ios-label-2)",
                    letterSpacing: -0.24,
                  }}
                >
                  {feature.body}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ marginTop: "auto", display: "grid", gap: 14 }}>
          <button
            type="button"
            className="ios-button-filled"
            onClick={() => {
              iosTap();
              navigate("/auth?mode=signup");
            }}
          >
            Get Started
          </button>
          <button
            type="button"
            className="ios-bar-button"
            style={{ width: "100%", fontWeight: 600 }}
            onClick={() => navigate("/auth?mode=login")}
          >
            I Already Have an Account
          </button>
        </div>
      </div>
    </div>
  );
}
