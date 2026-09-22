import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Send,
  ArrowLeft,
  Square,
  Mic,
  MicOff,
  ArrowRight,
  Clock,
  MessageCircle,
  Volume2,
  VolumeX,
  Brain,
  Lightbulb,
  Pencil,
  Flame,
  BarChart3,
  EllipsisVertical,
} from "@/components/icons";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import {
  useAIChat,
  type ChatContext,
  type ChatMode,
  type ProfAuraPersonality,
} from "../../hooks/useAIChat";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { useMoodForProfAura } from "../../hooks/useMoodForProfAura";
import { useStudyStats } from "../../hooks/useStudyStats";
import { usesLocalAI } from "../../lib/aiProvider";
import { useMicVolume } from "../../hooks/useMicVolume";
import { useTTS } from "../../hooks/useTTS";
import useSpeechRecognition from "../../hooks/useSpeechRecognition";
import { dbService } from "../../services/database/dbService";
import {
  getStoredPersonality,
  setStoredPersonality,
  PROF_AURA_PERSONALITY_OPTIONS,
} from "../../lib/profAuraPersonality";
import type { Deck, Card } from "../../types";
import ChatMessage from "./ChatMessage";
import SuggestedPrompts from "./SuggestedPrompts";
import ConversationHistory, { type ChatSession } from "./ConversationHistory";
import FileAttachment, { type AttachmentDraft, attachmentsToPrompt } from "./FileAttachment";
import ChatTour from "./ChatTour";
import SessionReplayModal from "../study/SessionReplayModal";
import ReplayEventBridge from "./ReplayEventBridge";
import ProfAuraEmptyState from "../ui/ProfAuraEmptyState";
import ProfAura from "./ProfAura";
import { queueSession } from "../../services/chatSessionService";
import { buildConceptWeaknesses, cardLapses, WEAK_LAPSE_THRESHOLD } from "../../lib/conceptModel";
import { buildPriorSessionMemory } from "../../lib/chatMemory";
import PageShell from "../dashboard/PageShell";
import { motion, AnimatePresence } from "framer-motion";
import { isAndroidApp } from "../../lib/platform";
import { useIOSDesign } from "../ios/iosDesign";
import IOSChatView from "../ios/IOSChatView";
import { useAppPreference } from "../../lib/appPreferences";

const MODE_LABELS: Record<ChatMode, string> = {
  study: "Study Coach",
  companion: "Companion",
};

const MODES: ChatMode[] = ["study", "companion"];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Top 5 most-forgotten cards in a deck, ordered by lapse count (difficulty
 * as tiebreak), enriched with FSRS difficulty + last review for the prompt.
 */
function buildWeakCards(cards: Card[]): ChatContext["weakCards"] {
  return cards
    .filter((c) => cardLapses(c) >= WEAK_LAPSE_THRESHOLD)
    .sort(
      (a, b) =>
        cardLapses(b) - cardLapses(a) ||
        (b.fsrsState?.difficulty ?? 0) - (a.fsrsState?.difficulty ?? 0),
    )
    .slice(0, 5)
    .map((c) => ({
      term: c.front,
      againCount: cardLapses(c),
      difficulty: c.fsrsState?.difficulty,
      lastReviewed: c.lastReviewed != null ? new Date(c.lastReviewed).toISOString() : undefined,
    }));
}

function buildInitialContext(decks: Deck[], cards: Card[]): ChatContext {
  const deck = decks[0];
  const now = Date.now();
  const deckCards = cards.filter((c) => c.deckId === deck?.id);
  const dueCount = deckCards.filter((c) => (c.nextReview ?? 0) <= now).length;
  return {
    deckId: deck?.id || "",
    deckName: deck?.title || "No deck selected",
    deckCardCount: deck?.cardCount || deckCards.length,
    cardsDueToday: dueCount,
    dueThisWeek: cards.filter((c) => (c.nextReview ?? 0) <= now + WEEK_MS).length,
    weakCards: buildWeakCards(deckCards),
  };
}

/**
 * Companion-mode context: no deck required. We fill EVERY ChatContext field
 * with a sensible value (deckId='', deckCardCount=0, etc.) so the prompt
 * factory never interpolates "undefined" into Prof. Aura's preamble. The
 * "Companion" deckName is a sentinel so the prompt branch can recognize
 * companion mode without reading mode (defensive in case mode isn't bridged).
 */
const COMPANION_CONTEXT: ChatContext = {
  deckId: "",
  deckName: "Companion",
  deckCardCount: 0,
  cardsDueToday: 0,
  weakCards: [],
};

/** Compact relative-time formatter (e.g. "2h ago", "3d ago") for inline meta. */
function fmtRelShort(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Prof. Aura's suggested starter prompts — deck-aware */
function getStarterPrompts(context: ChatContext) {
  const { deckName, cardsDueToday, weakCards } = context;
  const hasWeak = weakCards.length > 0;

  return [
    {
      icon: Brain,
      label: `Quiz me on ${deckName}`,
      prompt: `Quiz me on my ${deckName} deck. Focus on my weak spots and give me challenging questions.`,
      detail: `${cardsDueToday} cards due`,
    },
    {
      icon: Lightbulb,
      label: "Explain a concept",
      prompt: `I'm studying ${deckName}. Explain the hardest concept in this deck using a real-world analogy.`,
      detail: "Deep dive",
    },
    {
      icon: Pencil,
      label: "Generate flashcards",
      prompt: `Generate 5 new flashcards for ${deckName}. Include mnemonics where possible.`,
      detail: "Auto-save",
    },
    {
      icon: hasWeak ? Flame : BarChart3,
      label: hasWeak ? `Fix my ${weakCards[0]?.term || "weakest"} card` : "Show my weak spots",
      prompt: hasWeak
        ? `I keep forgetting "${weakCards[0]?.term}". Help me understand it better with examples and mnemonics.`
        : `Analyze my review history and tell me which concepts I'm weakest on.`,
      detail: hasWeak ? "Personalized" : "Analysis",
    },
  ];
}

export default function AIChatPage() {
  const navigate = useNavigate();
  const isMobileApp = isAndroidApp();
  const iosDesign = useIOSDesign();
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  // Real study data (streak, 7-day retention, last-session accuracy) fed into
  // the tutor prompt so Aura references what the student actually knows.
  const stats = useStudyStats(userId);
  const [localDecks, setLocalDecks] = useState<Deck[]>([]);
  const [localCards, setLocalCards] = useState<Card[]>([]);

  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [saveChatHistory] = useAppPreference("auramind_saveChatHistory", true);
  const [personality, setPersonalityState] = useState<ProfAuraPersonality>(getStoredPersonality);
  const userMeta = workspace?.user as
    { streakCount?: number; lastStudyAt?: number; accuracy7d?: number } | undefined;
  // Cross-session memory — computed once per page load (reads localStorage).
  const priorMemory = useMemo(
    () => (saveChatHistory ? buildPriorSessionMemory() || "" : ""),
    [saveChatHistory],
  );
  const [context, setContext] = useState<ChatContext>(() => ({
    ...buildInitialContext(workspace?.decks ?? [], workspace?.cards ?? []),
    priorConversations: priorMemory,
  }));
  // useAIChat must be declared BEFORE any useEffect that depends on chat.mode,
  // since hooks must appear in a stable order. The next two useEffects
  // adapt `context` based on deck selection AND chat.mode, so chat lives here.

  const chat = useAIChat(context);
  const { mode: chatMode, updateContext } = chat;

  const decks = workspace?.decks ?? localDecks;
  const cards = workspace?.cards ?? localCards;
  // Concept-level weakness model — aggregated across the current card set.
  const conceptWeaknesses = useMemo(() => buildConceptWeaknesses(cards, decks), [cards, decks]);
  const selectedDeck = decks.find((d) => d.id === selectedDeckId) || decks[0];

  useEffect(() => {
    if (workspace) return;
    if (userId === undefined) return;
    let cancelled = false;
    (async () => {
      if (!userId || cancelled) return;
      const [fetchedDecks, fetchedCards] = await Promise.all([
        dbService.fetchDecks(userId),
        dbService.fetchCards(userId),
      ]);
      if (cancelled) return;
      setLocalDecks(fetchedDecks);
      setLocalCards(fetchedCards);
      if (fetchedDecks.length > 0) {
        setSelectedDeckId(fetchedDecks[0].id);
        setContext(buildInitialContext(fetchedDecks, fetchedCards));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, userId]);

  useEffect(() => {
    if (workspace && workspace.decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(workspace.decks[0].id);
      setContext(buildInitialContext(workspace.decks, workspace.cards));
    }
  }, [workspace, selectedDeckId]);

  // Single source of truth for the tutor prompt context: deck selection,
  // weak cards, and performance stats. Both the local UI state (starter
  // prompts / chips) AND the hook's internal context (which the prompt
  // factory actually reads) are updated together — without updateContext,
  // weakCards and stats would never reach the system prompt.
  useEffect(() => {
    const now = Date.now();

    if (chatMode === "companion") {
      // Companion mode deliberately clears deck context so the prompt
      // branch in lib/chat-prompts.ts (companion mode preamble) takes over.
      // Performance stats are preserved — companion-mode users who ask
      // "how am I doing?" rely on them being in the system prompt.
      const payload: Partial<ChatContext> = {
        ...COMPANION_CONTEXT,
        personality,
        retention7d: stats.retention7d,
        lastSessionAccuracy: stats.lastSessionAccuracy,
        streakCount: stats.streak,
      };
      setContext((prev) => ({ ...prev, ...payload }));
      updateContext(payload);
      return;
    }

    const deckCards = selectedDeck ? cards.filter((c) => c.deckId === selectedDeck.id) : [];
    const payload: Partial<ChatContext> = {
      deckId: selectedDeck?.id ?? "",
      deckName: selectedDeck?.title ?? "No deck selected",
      deckCardCount: selectedDeck?.cardCount ?? deckCards.length,
      cardsDueToday: deckCards.filter((c) => (c.nextReview ?? 0) <= now).length,
      dueThisWeek: cards.filter((c) => (c.nextReview ?? 0) <= now + WEEK_MS).length,
      weakCards: buildWeakCards(deckCards),
      conceptWeaknesses,
      priorConversations: priorMemory,
      personality,
      retention7d: stats.retention7d,
      lastSessionAccuracy: stats.lastSessionAccuracy,
      streakCount: stats.streak,
    };
    setContext((prev) => ({ ...prev, ...payload }));
    updateContext(payload);
  }, [
    selectedDeck,
    cards,
    chatMode,
    personality,
    stats.retention7d,
    stats.lastSessionAccuracy,
    stats.streak,
    conceptWeaknesses,
    priorMemory,
    updateContext,
  ]);

  const [input, setInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [replayOpen, setReplayOpen] = useState(false);
  // Sessions mirror — ConversationHistory owns the localStorage truth; we
  // re-derive the "Continue your last chat" CTA on every change. Only
  // meaningful when the welcome state is showing (chat.messages is empty),
  // which by construction means there's no currently-active session.
  const [allSessions, setAllSessions] = useState<ChatSession[]>([]);
  const lastSessionForResume = useMemo(() => {
    // Most-recent session, gated by recency (<= 30d) so a paused
    // ancient session doesn't masquerade as "Continue where you left
    // off". Pinned sessions always reach the top of allSessions already.
    if (allSessions.length === 0) return null;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return (
      [...allSessions]
        .filter((s) => s.messages.length > 0 && now - s.updatedAt <= THIRTY_DAYS)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    );
  }, [allSessions]);
  // Mic + mood for Prof. Aura — mic starts/stops on user click so we never
  // surprise the user with a permission prompt. Mood is a pure derivation
  // and accepts whatever streak/lastStudyAt data is available today.
  const mic = useMicVolume();
  // Web Speech API transcription into the input. The single mic toggle
  // below coordinates BOTH: stopping always drains the final transcript
  // into the textarea before resetting the recognition state, so we
  // never lose the user's last utterance (per design review A).
  const sr = useSpeechRecognition();
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [showOverflow, setShowOverflow] = useState(false);
  const tts = useTTS();
  const { isEnabled: ttsEnabled, speak: speakTts } = tts;

  const setPersonality = useCallback((p: ProfAuraPersonality) => {
    setPersonalityState(p);
    setStoredPersonality(p);
    setShowOverflow(false);
  }, []);
  const mood = useMoodForProfAura({
    streakCount: userMeta?.streakCount,
    lastActivityAt: userMeta?.lastStudyAt,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // Pre-fill from ?q= param (from ProfessorPage suggestions)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.trim()) {
      setInput(q);
      setSearchParams(
        (prev) => {
          prev.delete("q");
          return prev;
        },
        { replace: true },
      );
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + "px";
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length, chat.isStreaming]);

  // Detect scroll position for "Jump to latest" button
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowJumpToBottom(scrollHeight - scrollTop - clientHeight > 200);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + "px";
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (chat.isStreaming) return;
    // Attachments are flattened onto the prompt body so Prof. Aura sees
    // them inline without a separate schema for "messages with files".
    const attachmentBody = attachmentsToPrompt(attachments);
    const composed = [input.trim(), attachmentBody].filter(Boolean).join("\n\n");
    if (!composed) return;
    chat.sendMessage(composed);
    setInput("");
    setAttachments([]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [chat, input, attachments]);

  /**
   * Mic toggle. Coordinates useMicVolume (audioLevel → ProfAura orbit)
   * with useSpeechRecognition (final transcript → textarea). Stop order
   * is fixed: stopListening FIRST so we capture the final transcript,
   * THEN close the mic hardware so iOS Safari doesn't fight us for it.
   */
  const toggleMic = useCallback(() => {
    if (mic.isActive || sr.isListening) {
      sr.stopListening();
      // Drain the transcript. If a final result landed in the
      // millisecond before stop, we don't want it stranded.
      const drained = sr.transcript.trim();
      if (drained) setInput((prev) => (prev ? `${prev} ${drained}` : drained));
      sr.resetTranscript();
      mic.stop();
    } else {
      // Both start paths need a user gesture to satisfy permission
      // policies. Triggering them together is fine on Chrome/Edge;
      // Safari may surface a separate prompt for speech recognition.
      sr.startListening();
      void mic.start();
    }
  }, [mic, sr]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Persist the active chat session to Supabase on every meaningful change.
  // We piggyback on ConversationHistory's localStorage truth — if the active
  // session id is known, we mirror it to Supabase via the debounced UPSERT
  // inside chatSessionService. This is intentionally a separate effect so an
  // offline user (or one whose Supabase is rate-limited) keeps the local
  // truth unchanged.
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!saveChatHistory || chat.messages.length === 0) return;
    try {
      const id = window.localStorage.getItem("auramind.aurachat.active.v1");
      if (!id || id === activeSessionIdRef.current) return;
      activeSessionIdRef.current = id;
      queueSession({
        id,
        title: chat.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? "New chat",
        pinned: false,
        preview: chat.messages[chat.messages.length - 1]?.content.slice(0, 120) ?? "",
        messages: chat.messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deckName: chat.mode === "companion" ? undefined : context.deckName,
        mode: chat.mode,
      }).catch(() => {
        /* offline or rate-limited; the next change will retry inside the queue */
      });
    } catch {
      /* localStorage unavailable; ignore */
    }
  }, [chat.messages, chat.mode, context.deckName, saveChatHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-speak new assistant messages when TTS is enabled
  const lastSpokenIdRef = useRef<string>("");
  useEffect(() => {
    if (!ttsEnabled || chat.isStreaming) return;
    const lastAssistant = [...chat.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content);
    if (
      lastAssistant &&
      lastAssistant.id !== lastSpokenIdRef.current &&
      lastAssistant.content.length > 5
    ) {
      lastSpokenIdRef.current = lastAssistant.id;
      speakTts(lastAssistant.content);
    }
  }, [chat.messages, chat.isStreaming, speakTts, ttsEnabled]);

  const starterPrompts = getStarterPrompts(context);
  const hasMessages = chat.messages.length > 0;

  if (iosDesign) {
    return (
      <IOSChatView
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onSendPrompt={chat.sendMessage}
        onAbort={chat.abort}
        onNewChat={chat.clearMessages}
        onSaveCard={chat.saveCard}
        onAnswerQuiz={chat.answerQuiz}
        decks={decks}
        selectedDeckId={selectedDeck?.id ?? ""}
        onSelectDeck={setSelectedDeckId}
        starters={starterPrompts}
        listening={mic.isActive || sr.isListening}
        onToggleMic={toggleMic}
        speaking={tts.isEnabled}
        onToggleSpeaking={tts.toggle}
      />
    );
  }

  return (
    <PageShell>
      {/* First-visit tour overlay. localStorage flag is set ONLY on
          user dismissal (per design review G) so React Strict-Mode
          double-mount doesn't burn the flag prematurely. */}
      <ChatTour />
      {/* Session Replay modal — opens from outside via the
          `auramind:open-replay` window event. We mount the modal shell here
          so it can pop into view when triggered without an extra render
          pass. */}
      <SessionReplayModal open={replayOpen} onClose={() => setReplayOpen(false)} />
      {/* Listener for the global open-replay event so ConversationHistory
          (or any embedded surface) can ask us to open the replay modal
          without prop-drilling. Single-shot for the duration of this page. */}
      <ReplayEventBridge onOpen={() => setReplayOpen(true)} />
      <div
        className={`flex flex-col h-full min-h-0 bg-transparent relative overflow-hidden ${isMobileApp ? "android-chat-page" : ""}`}
      >
        {/* Ambient background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-violet-600/[0.04] blur-[120px] rounded-full animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-fuchsia-600/[0.03] blur-[100px] rounded-full" />
        </div>

        {/* Header */}
        <div className="android-chat-header relative z-10 flex items-center justify-between px-6 py-3 border-b border-[#2A2A3A]/50 shrink-0">
          <div className="flex items-center gap-3">
            {!workspace && (
              <button
                onClick={() => navigate("/dashboard")}
                className="w-7 h-7 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#7A7A96] hover:text-[#F0EFFE] transition-colors"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="relative" data-chat-tour="avatar">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#06B6D4] flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <ProfAura
                    variant={chat.isStreaming ? "thinking" : "badge"}
                    size={22}
                    mood={mood}
                    audioLevel={mic.isActive ? mic.level : undefined}
                  />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0A0A0F]">
                  <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
                </div>
              </div>
              <div>
                <h1 className="text-[#F0EFFE] text-sm font-semibold flex items-center gap-1.5">
                  Prof. Aura
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-medium">
                    Online
                  </span>
                </h1>
                <p className="text-[#7A7A96] text-[10px]">AI Study Coach</p>
              </div>
            </div>
          </div>

          {/* min-w-0: this control group is a flex item of the header, so it
              defaults to min-width:auto and refuses to shrink below its
              contents. On a 412px-wide phone that pushed the group (and the
              deck selector inside it) 3px past the viewport, clipping the
              selector's right edge. The header clips rather than scrolls, so
              it showed as a shaved border instead of a scrollbar. */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Overflow menu — folds Voice OUT, the personality picker and
                the on-device AI status into one control, so the header
                reads calm on phones and Android where the native top bar
                already owns the screen's chrome. */}
            <div className="relative" data-testid="chat-overflow-menu">
              <button
                onClick={() => setShowOverflow(!showOverflow)}
                title="More options"
                aria-label="More options"
                aria-expanded={showOverflow}
                className="w-9 h-9 shrink-0 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#8A8AA3] hover:text-[#F0EFFE] hover:border-[#3A3A4F] transition-all"
              >
                <EllipsisVertical size={14} />
              </button>
              {showOverflow && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowOverflow(false)} />
                  <div className="absolute right-0 top-10 z-50 w-72 p-3 rounded-2xl bg-[#111118] border border-[#2A2A3A] shadow-2xl shadow-black/50">
                    {/* Voice OUT */}
                    <button
                      onClick={() => {
                        tts.toggle();
                        setShowOverflow(false);
                      }}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all ${
                        tts.isEnabled
                          ? "bg-[#7C3AED]/10 border border-[#7C3AED]/30"
                          : "border border-transparent hover:bg-[#1A1A24]"
                      }`}
                    >
                      <span className="shrink-0 text-[#A78BFA]">
                        {tts.isEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-[#F0EFFE]">
                          Voice replies
                        </span>
                        <span className="block text-[10px] text-[#7A7A96]">
                          Prof. Aura reads its answers aloud
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          tts.isEnabled
                            ? "bg-[#7C3AED]/20 text-[#C4B5FD]"
                            : "bg-[#1A1A24] text-[#7A7A96]"
                        }`}
                      >
                        {tts.isEnabled ? "ON" : "OFF"}
                      </span>
                    </button>

                    <div className="my-2 h-px bg-[#2A2A3A]" />

                    {/* Personality */}
                    <p className="text-[9px] uppercase tracking-widest text-[#7A7A96] mb-2 px-1">
                      Prof. Aura's Personality
                    </p>
                    <div className="space-y-1">
                      {PROF_AURA_PERSONALITY_OPTIONS.map((opt) => {
                        const OptionIcon = opt.icon;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setPersonality(opt.id)}
                            className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 ${
                              personality === opt.id
                                ? "bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#F0EFFE]"
                                : "border border-transparent hover:bg-[#1A1A24] text-[#9090A8] hover:text-[#F0EFFE]"
                            }`}
                          >
                            <OptionIcon size={16} className="mt-0.5 shrink-0 text-[#A78BFA]" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium">{opt.label}</p>
                              <p className="text-[10px] text-[#7A7A96] leading-snug mt-0.5">
                                {opt.description}
                              </p>
                            </div>
                            {personality === opt.id && (
                              <div className="ml-auto shrink-0 w-4 h-4 rounded-full bg-[#7C3AED] flex items-center justify-center mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Chat history (persisted, slide-in) */}
            <ConversationHistory
              messages={chat.messages}
              deckName={selectedDeck?.title}
              onResume={(sess: ChatSession) => chat.loadMessages(sess.messages)}
              onNewChat={() => chat.clearMessages()}
              onSessionsChange={setAllSessions}
              persistHistory={saveChatHistory}
            />
            {/* Deck selector — hidden in companion mode since chats there
                are decoupled from any specific deck. */}
            {decks.length > 0 && chat.mode !== "companion" && (
              /* min-w-0 matters here: as a flex item this defaults to
                 min-width:auto, so it refused to shrink below the widest
                 option's intrinsic width and pushed ~3px past the viewport on
                 412px-wide phones, clipping its right edge. max-w and truncate
                 cap it; min-w-0 is what actually lets it compress. */
              <select
                value={selectedDeck?.id || ""}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="hidden sm:block bg-[#111118] border border-[#2A2A3A] rounded-lg px-3 py-1.5 text-[#F0EFFE] text-xs outline-none focus:border-[#7C3AED]/50 min-h-[44px] min-w-0 max-w-[170px] truncate"
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}
            {/* Mode switcher — rounded-full pills for a ChatGPT-style
                compact rail; active state has a hairline gradient rather
                than a flat tint so the selected mode reads as the
                "primary action" without shouting. */}
            <div className="hidden md:flex bg-[#111118] border border-[#2A2A3A] rounded-full p-0.5">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => chat.setMode(mode)}
                  title={
                    mode === "companion"
                      ? "Talk with Prof. Aura without a deck — chat, coaching, motivation"
                      : MODE_LABELS[mode]
                  }
                  className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap ${
                    chat.mode === mode
                      ? mode === "companion"
                        ? "bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 text-[#F0ABFC] shadow-[inset_0_0_0_1px_rgba(244,114,182,0.25)]"
                        : "bg-gradient-to-b from-[#7C3AED]/20 to-[#EC4899]/10 text-[#C4B5FD] shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]"
                      : "text-[#7A7A96] hover:text-[#F0EFFE]"
                  }`}
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deck selector, own row on phones.
            In the header it competed with three icon buttons for a fixed
            amount of space, so it could only ever show ~8 characters of a
            deck title however the pixels were divided. A full-width row of
            its own fits the whole name and gives a comfortable target
            without squeezing anything else. The header keeps the compact
            selector from sm: up, where the row has room for it. */}
        {decks.length > 0 && chat.mode !== "companion" && (
          <div className="sm:hidden relative z-10 shrink-0 border-b border-[#2A2A3A]/50 px-6 py-2">
            <label htmlFor="chat-deck-select" className="sr-only">
              Active deck
            </label>
            <select
              id="chat-deck-select"
              value={selectedDeck?.id || ""}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-[#2A2A3A] bg-[#111118] px-3 text-xs text-[#F0EFFE] outline-none focus:border-[#7C3AED]/50"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Messages area */}
        <div
          ref={chatContainerRef}
          className="android-chat-messages flex-1 overflow-y-auto relative z-10 px-6 py-6"
        >
          <div className="max-w-3xl mx-auto">
            {chat.messages.length === 0 && chat.mode === "companion" ? (
              /* ─── Companion-mode welcome ─── */
              <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
                <ProfAuraEmptyState
                  mood={chat.isStreaming ? "curious" : "inviting"}
                  size="lg"
                  eyebrow="COMPANION MODE"
                  title="Talk with me about anything"
                  description="I'm here to think out loud about your studies, life, focus, motivation — anything that helps you do the work. No flashcards in sight unless you say so."
                  audioLevel={mic.isActive ? mic.level : undefined}
                  actions={[
                    {
                      label: "Switch back to Study Coach",
                      icon: ArrowLeft,
                      onClick: () => chat.setMode("study"),
                      primary: true,
                    },
                    {
                      label: "Ask me about my day",
                      icon: MessageCircle,
                      onClick: () => chat.sendMessage("Hey Prof. Aura — how am I doing today?"),
                    },
                  ]}
                />
              </div>
            ) : chat.messages.length === 0 ? (
              /* ─── Empty state: Prof. Aura welcome ─── */
              <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center">
                {/* Avatar + heading pair — the hero intentionally avoids
                    a "brand eyebrow" strip because the route header already
                    surfaces "Prof. Aura · Online" and the heading below
                    shows deck/card counts. Adding a third repetition would
                    erode the premium feel; the avatar's breathing aura ring
                    is the only ambient decoration. */}
                {/* Prof. Aura avatar */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="relative mb-7"
                >
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#06B6D4] flex items-center justify-center shadow-2xl shadow-violet-500/25">
                    <ProfAura
                      variant={chat.isStreaming ? "streaming" : "rest"}
                      size={68}
                      mood={mood}
                      audioLevel={mic.isActive ? mic.level : undefined}
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-[3px] border-[#0A0A0F]">
                    <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />
                  </div>
                  {/* Premium breathing aura ring — slow pulse around the
                      badge. Tuned to feel like ChatGPT's gentle availability
                      pulse, not a notification. Replaces a previous broken
                      single-dot orbit rotation whose transformOrigin math was
                      in the wrong coordinate space.

                      The 4-keyframe shape (rise, sustain, fall, fade) prevents
                      the "blink" stutter that a 3-keyframe linear interp
                      produces when alpha snaps from 0.18 back to 0 in one
                      frame. */}
                  <motion.div
                    className="absolute inset-0 rounded-3xl pointer-events-none"
                    animate={{
                      boxShadow: [
                        "0 0 0 0px rgba(124,58,237,0.0)",
                        "0 0 0 6px rgba(124,58,237,0.18)",
                        "0 0 0 6px rgba(124,58,237,0.18)",
                        "0 0 0 0px rgba(124,58,237,0.0)",
                      ],
                    }}
                    transition={{
                      duration: 3.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.35, 0.65, 1],
                    }}
                  />
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <h2 className="text-3xl sm:text-4xl font-bold text-[#F0EFFE] mb-3 tracking-tight">
                    Hey, I'm{" "}
                    <span className="bg-gradient-to-r from-[#7C3AED] via-[#EC4899] to-[#06B6D4] bg-clip-text text-transparent">
                      Prof. Aura
                    </span>
                  </h2>
                  <p className="text-[#8A8AA3] text-sm sm:text-base max-w-lg leading-relaxed mb-8">
                    Your AI study coach. I can see your{" "}
                    <strong className="text-[#F0EFFE]">
                      {decks.length} {decks.length === 1 ? "deck" : "decks"}
                    </strong>
                    ,{" "}
                    <strong className="text-[#F0EFFE]">
                      {cards.length} {cards.length === 1 ? "card" : "cards"}
                    </strong>
                    , and your FSRS schedule.
                  </p>
                </motion.div>

                {/* Continue last chat CTA — only visible when there's a recent
                    non-empty session and the in-memory chat is empty (welcome
                    state). Lets users 1-click resume a conversation they
                    left off on. Dismissal just hides it for the session. */}
                {lastSessionForResume && (
                  <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.22 }}
                    onClick={() => {
                      chat.loadMessages(lastSessionForResume.messages);
                      // Auto-focus the input so the user can ask a follow-up
                      // immediately after resuming.
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                    className="group w-full max-w-xl text-left p-4 mb-8 rounded-2xl bg-[#111118] border border-[#2A2A3A] hover:border-[#7C3AED]/50 transition-all flex items-center gap-3"
                    title="Resume your last conversation"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#06B6D4]/30 border border-[#7C3AED]/30 flex items-center justify-center shrink-0">
                      <MessageCircle size={15} className="text-[#A78BFA]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-[#A78BFA] mb-0.5">
                        Continue where you left off
                      </p>
                      <p className="text-sm text-[#F0EFFE] font-medium truncate group-hover:text-[#C4B5FD] transition-colors">
                        {lastSessionForResume.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-[#7A7A96]">
                        <Clock size={9} />
                        <span>{fmtRelShort(lastSessionForResume.updatedAt)}</span>
                        <span>·</span>
                        <span>
                          {lastSessionForResume.messages.length} msg
                          {lastSessionForResume.messages.length === 1 ? "" : "s"}
                        </span>
                        {lastSessionForResume.deckName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">
                              {lastSessionForResume.deckName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-[#9090A8] group-hover:text-[#F0EFFE] group-hover:translate-x-0.5 transition-all shrink-0"
                    />
                  </motion.button>
                )}

                {/* Starter prompt cards */}
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl"
                  data-chat-tour="prompts"
                >
                  {starterPrompts.map((s, i) => {
                    const StarterIcon = s.icon;
                    return (
                      <motion.button
                        key={i}
                        whileHover={{ y: -2, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => chat.sendMessage(s.prompt)}
                        className="text-left p-4 rounded-2xl bg-[#111118] border border-[#2A2A3A] hover:border-[#7C3AED]/40 hover:bg-[#15151D] transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <StarterIcon
                            size={20}
                            className="shrink-0 mt-0.5 text-[#9090A8] group-hover:text-[#8B5CF6] transition-colors"
                          />
                          <div className="min-w-0">
                            <p className="text-[#F0EFFE] text-sm font-medium group-hover:text-[#8B5CF6] transition-colors">
                              {s.label}
                            </p>
                            <p className="text-[#7A7A96] text-[10px] mt-0.5">{s.detail}</p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </div>
            ) : (
              /* ─── Messages list ─── */
              <div className="space-y-6 pb-8">
                <AnimatePresence mode="popLayout">
                  {chat.messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onSaveCard={chat.saveCard}
                      isStreaming={chat.isStreaming}
                      onAnswerQuiz={chat.answerQuiz}
                    />
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Jump to latest button */}
        <AnimatePresence>
          {showJumpToBottom && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              onClick={scrollToBottom}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-[#1A1A24] border border-[#2A2A3A] text-[#8A8AA3] text-xs font-medium hover:text-[#F0EFFE] hover:border-[#7C3AED]/40 transition-all shadow-lg backdrop-blur-sm flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>

        {/* Suggested prompts (shown after messages, before input) */}
        {hasMessages && !chat.isStreaming && (
          <div className="relative z-10 px-6 pb-1" data-chat-tour="prompts">
            <SuggestedPrompts
              mode={chat.mode}
              onSelect={chat.sendMessage}
              deckName={context.deckName}
              currentCardTerm={context.currentCard?.term}
              messages={chat.messages}
            />
          </div>
        )}

        {/* Input area */}
        <div className="android-chat-composer relative z-10 p-4 sm:p-6 border-t border-[#2A2A3A]/50 shrink-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F] to-transparent">
          <div className="max-w-3xl mx-auto">
            <div className="relative group/input">
              {/* Glow on focus */}
              <div className="absolute -inset-[1px] bg-gradient-to-r from-[#7C3AED]/20 via-[#EC4899]/10 to-[#06B6D4]/20 rounded-2xl opacity-0 group-focus-within/input:opacity-100 transition-opacity duration-500 blur-sm pointer-events-none" />

              <div className="relative flex items-end bg-[#111118] border border-[#2A2A3A] rounded-2xl overflow-hidden transition-all group-focus-within/input:border-[#3A3A4F]">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mic.isActive ? "Listening — speak or type…" : "Ask Prof. Aura anything..."
                  }
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none px-5 py-3.5 text-sm text-[#F0EFFE] placeholder-[#7A7A96] resize-none max-h-[140px] leading-relaxed"
                  disabled={chat.isStreaming}
                />

                {/* File attachment (paperclip). Drag/drop anywhere on the
                    page also engages via the global drop handler inside
                    FileAttachment itself. */}
                <FileAttachment attachments={attachments} setAttachments={setAttachments} />

                {/* Mic toggle. Idle = violet outline; listening = solid violet.
                    The button coordinates BOTH recognizers (volume + speech). */}
                <button
                  data-chat-tour="mic"
                  onClick={toggleMic}
                  title={
                    mic.isActive || sr.isListening
                      ? "Stop listening"
                      : mic.error || sr.error
                        ? `Mic/speech unavailable: ${(mic.error || sr.error || "").slice(0, 60)}`
                        : "Speak your question"
                  }
                  aria-pressed={mic.isActive || sr.isListening}
                  className={`m-2 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    mic.isActive || sr.isListening
                      ? "bg-[#7C3AED] text-white shadow-[0_0_15px_rgba(124,58,237,0.4)]"
                      : "bg-[#1A1A24] border border-[#2A2A3A] text-[#A8A8C0] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40"
                  }`}
                >
                  {mic.isActive || sr.isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>

                {/* Send / Stop button */}
                {chat.isStreaming ? (
                  <button
                    onClick={() => chat.abort()}
                    className="m-2 w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all shrink-0 animate-[pulse_2.4s_ease-in-out_infinite] shadow-[0_0_14px_rgba(239,68,68,0.18)]"
                    title="Stop generating"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={`m-2 w-11 h-11 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                      input.trim()
                        ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9] shadow-[0_0_15px_rgba(124,58,237,0.3)]"
                        : "bg-[#1A1A24] text-[#3A3A4F] border border-[#2A2A3A]"
                    }`}
                  >
                    <Send size={14} />
                  </button>
                )}
              </div>

              {/* On-device AI chip — the only thing the composer shows
                  under itself now; the kbd hints / "Ready" filler are gone. */}
              {usesLocalAI() && (
                <div className="mt-2 px-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 text-[9px] text-[#34D399]"
                    title="AI runs on this device — no data leaves it, works offline"
                  >
                    <span className="w-1 h-1 rounded-full bg-[#34D399]" />
                    On-device AI · Private
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
