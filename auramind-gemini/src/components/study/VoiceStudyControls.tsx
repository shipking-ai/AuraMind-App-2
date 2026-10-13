/**
 * VoiceStudyControls — hands‑free study toolbar for the StudyModePage.
 *
 * Drop into any study surface:
 *   - "Hands-Free" toggle: AI speaks each question, listens for the
 *     student's answer, then evaluates it aloud.
 *   - "Speak Question": TTS the current prompt.
 *   - "Answer Aloud": manual mic capture of the spoken answer.
 *
 * The component is presentational + self-contained: all Web Speech API
 * interactions live inside useVoiceStudy, and answer grading lives in
 * voiceEvaluationService. No coupling to the StudyModePage's state.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Mic, MicOff, Headphones } from "@/components/icons";
import { useVoiceStudy } from "../../hooks/useVoiceStudy";
import { VoiceAura, MicBlockedArt, VerdictMark, type VoiceOrbState } from "../graphics";
import {
  evaluateSpokenAnswer,
  type VoiceVerdict,
} from "../../services/study/voiceEvaluationService";
import { useAppPreference } from "../../lib/appPreferences";

interface VoiceStudyControlsProps {
  question: string;
  answer: string;
  /** Called with (correct, spokenAnswer) when the student finishes an answer */
  onAnswerEvaluated?: (correct: boolean, spoken: string, verdict: VoiceVerdict) => void;
  /** When true, "Hands-Free" can trigger the next card via this callback */
  onRequestNextCard?: () => void;
}

export function VoiceStudyControls({
  question,
  answer,
  onAnswerEvaluated,
  onRequestNextCard,
}: VoiceStudyControlsProps) {
  const [handsFree, setHandsFree] = useState(false);
  const [textToSpeech] = useAppPreference("bonamind_textToSpeech", false);
  const [autoPlayAudio] = useAppPreference("bonamind_autoPlayAudio", false);
  const [verdict, setVerdict] = useState<VoiceVerdict | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  // Written in an effect, not during render — assigning to a ref in the
  // render body is a side effect and breaks under concurrent rendering.
  const answerRef = useRef(answer);
  const nextRef = useRef(onRequestNextCard);
  useEffect(() => {
    answerRef.current = answer;
    nextRef.current = onRequestNextCard;
  }, [answer, onRequestNextCard]);

  const handleTranscript = useCallback(
    async (spoken: string) => {
      if (!spoken.trim()) return;
      setEvaluating(true);
      try {
        const v = await evaluateSpokenAnswer(question, answerRef.current, spoken);
        setVerdict(v);
        onAnswerEvaluated?.(v.correct, spoken, v);
        if (handsFree) {
          // Hands-free can still listen when spoken output is disabled.
          const advance = () => nextRef.current?.();
          if (textToSpeech) {
            voice.speak(v.correct ? "Correct!" : "Not quite.", advance);
          } else {
            advance();
          }
        }
      } finally {
        setEvaluating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, handsFree, onAnswerEvaluated, textToSpeech],
  );

  const voice = useVoiceStudy({
    onTranscript: handleTranscript,
    rate: 1,
  });
  const { speak, cancelSpeech } = voice;

  useEffect(() => {
    if (!autoPlayAudio || !textToSpeech || !question.trim()) return;
    speak(question);
    return () => cancelSpeech();
  }, [autoPlayAudio, cancelSpeech, question, speak, textToSpeech]);

  // The orb is a readout of the engine, so state is derived rather than
  // stored — it can never drift from what the hook is actually doing.
  const orbState: VoiceOrbState = voice.error?.needsPermission
    ? "blocked"
    : voice.listening
      ? "listening"
      : voice.speaking
        ? "speaking"
        : evaluating
          ? "thinking"
          : "idle";

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    if (next) {
      // Kick off: optionally speak the question, then listen.
      if (textToSpeech) {
        voice.speak(question, () => voice.startListening());
      } else {
        voice.startListening();
      }
    } else {
      voice.cancelSpeech();
      voice.stopListening();
    }
  };

  const speakQuestion = () => {
    if (!textToSpeech) return;
    voice.cancelSpeech();
    voice.speak(question);
  };

  const toggleListen = () => {
    if (voice.listening) {
      voice.stopListening();
    } else {
      setVerdict(null);
      voice.startListening();
    }
  };

  // The mark is rendered as an icon rather than a ✓/✗ glyph: those code
  // points fall back to a different face on every OS, and inside a
  // coloured status line the mismatch is obvious.
  const answeredText = verdict
    ? verdict.correct
      ? `Correct — ${verdict.feedback}`
      : verdict.feedback
    : "";

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <VoiceAura
        state={orbState}
        level={voice.level}
        size={220}
        className={
          orbState === "blocked"
            ? "text-red-400/80"
            : orbState === "idle"
              ? "text-[#7A7A96]"
              : "text-[#8B5CF6]"
        }
      />

      <div className="flex items-center gap-2">
        {/* Hands-Free Mode */}
        <button
          onClick={toggleHandsFree}
          title="Hands-free: AI speaks each question, listens to your answer, then advances"
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-colors ${
            handsFree
              ? "bg-[#7C3AED]/20 border-[#7C3AED]/40 text-[#8B5CF6]"
              : "bg-[#111118] border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40"
          }`}
        >
          <Headphones size={13} className={handsFree ? "animate-pulse" : ""} />
          {handsFree ? "Hands-Free On" : "Hands-Free"}
        </button>

        {/* Speak Question */}
        <button
          onClick={speakQuestion}
          disabled={voice.speaking || !textToSpeech}
          title={textToSpeech ? "Read the question aloud" : "Turn on Read cards aloud in Settings"}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#2A2A3A] bg-[#111118] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40 transition-colors text-[11px] font-medium disabled:opacity-40"
        >
          <Volume2 size={13} className={voice.speaking ? "animate-pulse text-[#8B5CF6]" : ""} />
          {voice.speaking ? "Speaking…" : "Speak Question"}
        </button>

        {/* Answer Aloud */}
        <button
          onClick={toggleListen}
          title="Answer aloud — your speech will be transcribed and graded"
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-colors ${
            voice.listening
              ? "bg-red-500/15 border-red-500/40 text-red-400"
              : "bg-[#111118] border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40"
          }`}
        >
          {voice.listening ? <MicOff size={13} className="animate-pulse" /> : <Mic size={13} />}
          {voice.listening ? "Listening…" : evaluating ? "Grading…" : "Answer Aloud"}
        </button>
      </div>

      {/* Transcript + verdict */}
      {(voice.listening || voice.interimTranscript || voice.transcript || verdict) && (
        <div className="w-full max-w-md rounded-lg border border-[#2A2A3A] bg-[#0D0D14]/80 backdrop-blur-sm px-4 py-3 text-center">
          {/* No status dot here — the orb above already carries the
              listening state, and two indicators for one state read as
              two different things happening. */}
          {voice.listening && (
            <div className="text-[11px] text-[#8B5CF6] mb-1">Listening — answer aloud</div>
          )}
          {(voice.interimTranscript || voice.transcript) && (
            <p className="text-xs text-[#F0EFFE] italic">
              “{voice.interimTranscript || voice.transcript}”
            </p>
          )}
          {!voice.listening && verdict && (
            <p
              className={`text-xs font-medium inline-flex items-center gap-1.5 ${
                verdict.correct ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <VerdictMark correct={verdict.correct} size={16} className="shrink-0" />
              {answeredText}
            </p>
          )}
        </div>
      )}

      {/* One place for every failure. Permission problems get the
          address-bar illustration because the fix is a click the user has
          to find; everything else gets a line and a retry. */}
      {voice.error && (
        <div
          role="status"
          className="w-full max-w-md rounded-lg border border-[#2A2A3A] bg-[#0D0D14]/80 px-4 py-3 text-center"
        >
          {voice.error.needsPermission && (
            <MicBlockedArt size={132} className="mx-auto mb-2 text-red-400/70" />
          )}
          <p className="text-xs text-[#F0EFFE]">{voice.error.message}</p>
          {voice.error.recoverable && (
            <button
              onClick={() => {
                voice.clearError();
                voice.startListening();
              }}
              className="mt-2 h-7 px-3 rounded-md border border-[#2A2A3A] text-[11px] text-[#8B5CF6] hover:border-[#7C3AED]/40 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!voice.sttSupported && !voice.error && (
        <p className="text-[10px] text-[#7A7A96]">
          Spoken answers need Chrome or Edge. You can still play questions aloud here.
        </p>
      )}
    </div>
  );
}
