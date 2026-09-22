/**
 * A study session on iPhone: one card, full screen, nothing else competing
 * for attention.
 *
 * - Tap the card to flip it (3D, with a Taptic tick from the page).
 * - Once it shows the answer, swipe right for Good, left for Again, up for
 *   Easy — or tap one of the four grade buttons, each labelled with when the
 *   card will come back.
 * - Two card looks, chosen in Settings › Card style: AuraMind's paper index
 *   card (default) or a dark glass card lit in the deck's colour.
 *
 * Presentation only: StudyModePage owns the queue, grading, scheduling and
 * saving, and renders this on iPhone.
 */
import React from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Rating, type Card } from "../../types";
import { formatInterval } from "../../services/study/srs";

// The grade labels share the web app's wording, so "comes back in…" reads the
// same on every platform.
export { formatInterval };
import { useAppPreference } from "../../lib/appPreferences";
import { Mic, X } from "../icons";
import { ActivityRings, deckGradient } from "./IOSPrimitives";
import { iosSelection } from "./iosHaptics";

export type IOSCardStyle = "paper" | "glass";
export const IOS_CARD_STYLE_KEY = "auramind_iosCardStyle";

const GRADES: Array<{ rating: Rating; label: string; color: string }> = [
  { rating: Rating.AGAIN, label: "Again", color: "var(--ios-red)" },
  { rating: Rating.HARD, label: "Hard", color: "var(--ios-orange)" },
  { rating: Rating.GOOD, label: "Good", color: "var(--ios-green)" },
  { rating: Rating.EASY, label: "Easy", color: "var(--ios-blue)" },
];

const SWIPE = 110;

/** "10m", "3d", "2mo", "1.2y" — when the card comes back after a grade. */

function CardFace({
  side,
  style,
  card,
  deckTitle,
  deckId,
}: {
  side: "front" | "back";
  style: IOSCardStyle;
  card: Card;
  deckTitle: string;
  deckId: string;
}) {
  const front = card.front || card.question || "";
  const back = card.back || card.answer || "";
  if (style === "paper") {
    return (
      <div className={`ios-card-face ios-card-paper flashcard-paper is-${side}`}>
        <div className="ios-card-margin" aria-hidden />
        {side === "front" ? (
          <>
            <div className="ios-card-paper-deck">{deckTitle}</div>
            <div className="ios-card-paper-question">{front}</div>
          </>
        ) : (
          <>
            <div className="ios-card-paper-recall">{front}</div>
            <div className="ios-card-paper-label">Answer</div>
            <div className="ios-card-paper-answer">{back}</div>
          </>
        )}
      </div>
    );
  }
  return (
    <div className={`ios-card-face ios-card-glass is-${side}`}>
      <div
        className="ios-card-glass-glow"
        style={{ background: deckGradient(deckId) }}
        aria-hidden
      />
      <div className="ios-card-glass-label">{side === "front" ? "Question" : "Answer"}</div>
      {side === "front" ? (
        <div className="ios-card-glass-question">{front}</div>
      ) : (
        <>
          <div className="ios-card-glass-recall">{front}</div>
          <div className="ios-card-glass-answer">{back}</div>
        </>
      )}
    </div>
  );
}

export function IOSStudySession({
  deckTitle,
  deckId,
  card,
  index,
  total,
  flipped,
  onFlip,
  onRate,
  onExit,
  intervals,
  voiceMode,
  onToggleVoice,
  voicePanel,
}: {
  deckTitle: string;
  deckId: string;
  card: Card;
  index: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onExit: () => void;
  intervals: Partial<Record<Rating, number>>;
  voiceMode: boolean;
  onToggleVoice: () => void;
  voicePanel?: React.ReactNode;
}) {
  const [cardStyle] = useAppPreference<IOSCardStyle>(IOS_CARD_STYLE_KEY, "paper");
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const goodOpacity = useTransform(x, [30, SWIPE], [0, 1]);
  const againOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const easyOpacity = useTransform(y, [-SWIPE, -30], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { x: dx, y: dy } = info.offset;
    if (dy < -SWIPE && Math.abs(dy) > Math.abs(dx)) onRate(Rating.EASY);
    else if (dx > SWIPE) onRate(Rating.GOOD);
    else if (dx < -SWIPE) onRate(Rating.AGAIN);
  };

  return (
    <div className="ios-app ios-study">
      <div className="ios-study-glow" style={{ background: deckGradient(deckId) }} aria-hidden />

      <header className="ios-study-header">
        <button
          type="button"
          className="ios-study-round ios-glass"
          aria-label="End session"
          onClick={onExit}
        >
          <X aria-hidden />
        </button>
        <div className="ios-study-title">
          <div className="ios-study-deck">{deckTitle}</div>
          <div className="ios-study-count">
            {index + 1} of {total}
          </div>
        </div>
        <button
          type="button"
          className={`ios-study-round ios-glass ${voiceMode ? "is-on" : ""}`}
          aria-label={voiceMode ? "Turn off voice study" : "Voice study"}
          aria-pressed={voiceMode}
          onClick={() => {
            iosSelection();
            onToggleVoice();
          }}
        >
          <Mic aria-hidden />
        </button>
      </header>
      <div className="ios-study-progress" aria-hidden>
        <motion.div
          className="ios-study-progress-fill"
          animate={{ width: `${(index / Math.max(1, total)) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>

      <div className="ios-study-stage">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={card.id}
            className="ios-card-wrap"
            style={{ x, y, rotate }}
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
            drag={flipped}
            dragSnapToOrigin
            dragElastic={0.9}
            onDragEnd={onDragEnd}
            onTap={() => {
              if (!flipped) onFlip();
            }}
          >
            <motion.div
              className="ios-card-3d"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <CardFace
                side="front"
                style={cardStyle}
                card={card}
                deckTitle={deckTitle}
                deckId={deckId}
              />
              <CardFace
                side="back"
                style={cardStyle}
                card={card}
                deckTitle={deckTitle}
                deckId={deckId}
              />
            </motion.div>
            {flipped && (
              <>
                <motion.div
                  className="ios-swipe-stamp is-good"
                  style={{ opacity: goodOpacity }}
                  aria-hidden
                >
                  Good
                </motion.div>
                <motion.div
                  className="ios-swipe-stamp is-again"
                  style={{ opacity: againOpacity }}
                  aria-hidden
                >
                  Again
                </motion.div>
                <motion.div
                  className="ios-swipe-stamp is-easy"
                  style={{ opacity: easyOpacity }}
                  aria-hidden
                >
                  Easy
                </motion.div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {voicePanel && <div className="ios-study-voice">{voicePanel}</div>}

      <footer className="ios-study-footer">
        <AnimatePresence mode="wait" initial={false}>
          {flipped ? (
            <motion.div
              key="grades"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            >
              <div className="ios-grades">
                {GRADES.map((grade) => (
                  <button
                    key={grade.label}
                    type="button"
                    className="ios-grade ios-glass"
                    style={{ "--grade": grade.color } as React.CSSProperties}
                    onClick={() => onRate(grade.rating)}
                  >
                    <span className="ios-grade-label">{grade.label}</span>
                    {intervals[grade.rating] !== undefined && (
                      <span className="ios-grade-when">
                        {formatInterval(intervals[grade.rating]!)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="ios-study-hint">
                Swipe right if you knew it, left if you didn&rsquo;t
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              className="ios-study-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Tap the card to see the answer
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}

export function IOSStudyComplete({
  deckTitle,
  deckId,
  reviewed,
  correct,
  elapsedMs,
  onRestart,
  onDone,
}: {
  deckTitle: string;
  deckId: string;
  reviewed: number;
  correct: number;
  elapsedMs: number;
  onRestart: () => void;
  onDone: () => void;
}) {
  const accuracy = reviewed ? correct / reviewed : 0;
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  return (
    <div className="ios-app ios-study">
      <div className="ios-study-glow" style={{ background: deckGradient(deckId) }} aria-hidden />
      <div className="ios-complete">
        <ActivityRings
          size={160}
          stroke={22}
          rings={[{ label: "Accuracy", progress: accuracy, color: "var(--ios-ring-exercise)" }]}
        />
        <h1 className="ios-large-title" style={{ marginTop: 22 }}>
          Session Complete
        </h1>
        <p className="ios-complete-sub">{deckTitle}</p>
        <div className="ios-section" style={{ margin: "26px 0 0", width: "100%" }}>
          <div className="ios-list">
            <div className="ios-row" style={{ "--ios-sep-inset": "16px" } as React.CSSProperties}>
              <div className="ios-row-body">
                <div className="ios-row-title">Cards reviewed</div>
              </div>
              <span className="ios-row-value">{reviewed}</span>
            </div>
            <div className="ios-row" style={{ "--ios-sep-inset": "16px" } as React.CSSProperties}>
              <div className="ios-row-body">
                <div className="ios-row-title">Accuracy</div>
              </div>
              <span className="ios-row-value">{Math.round(accuracy * 100)}%</span>
            </div>
            <div className="ios-row" style={{ "--ios-sep-inset": "16px" } as React.CSSProperties}>
              <div className="ios-row-body">
                <div className="ios-row-title">Time</div>
              </div>
              <span className="ios-row-value">
                {minutes}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
        <div className="ios-complete-actions">
          <button type="button" className="ios-button-filled" onClick={onDone}>
            Done
          </button>
          <button
            type="button"
            className="ios-bar-button"
            style={{ width: "100%", fontWeight: 600 }}
            onClick={onRestart}
          >
            Study Again
          </button>
        </div>
      </div>
    </div>
  );
}
