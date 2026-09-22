/**
 * Prof. Aura on iPhone — not a messenger. Three ways to learn with Aura,
 * switched from the top of the screen and remembered:
 *
 *  - Talk: Aura's orb fills the top of the screen and reacts — breathing at
 *    rest, swirling while it thinks, pulsing while it speaks. Hold the big
 *    button to ask out loud; the answer is spoken and shown as captions.
 *  - Notebook: the conversation is a page of AuraMind's paper notebook. Your
 *    questions are handwritten in the margin, Aura's answers are typeset,
 *    and key terms are highlighted like a marker — tap one to make a card.
 *  - Cards: every answer arrives as a stack of swipeable cards (the idea,
 *    more, check yourself); save any card to the deck with one tap.
 *
 * Presentation only. AIChatPage owns the conversation (context, memory,
 * history, streaming, voice) and renders this inside the iOS shell.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Message } from "../../hooks/useAIChat";
import type { Deck } from "../../types";
import { renderMarkdown } from "../chat/ChatMessage";
import QuizBlock from "../chat/QuizBlock";
import TypingIndicator from "../chat/TypingIndicator";
import ProfAura from "../chat/ProfAura";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Keyboard,
  Mic,
  Plus,
  Square,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "../icons";
import { IOSChoiceList, IOSSegmented, IOSSheet } from "./IOSPrimitives";
import { iosSelection, iosSuccess, iosTap } from "./iosHaptics";
import { useAppPreference } from "../../lib/appPreferences";

export type AuraChatMode = "talk" | "notebook" | "cards";
export const AURA_CHAT_MODE_KEY = "auramind_auraChatMode";

export interface IOSChatStarter {
  icon: LucideIcon;
  label: string;
  prompt: string;
  detail?: string;
}

export interface IOSChatViewProps {
  messages: Message[];
  isStreaming: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onSendPrompt: (prompt: string) => void;
  onAbort: () => void;
  onNewChat: () => void;
  onSaveCard: (messageId: string) => void;
  onAnswerQuiz: (messageId: string, answerIndex: number) => void;
  /** Add a card to the current deck; resolves true when saved. */
  onMakeCard: (front: string, back: string) => Promise<boolean>;
  decks: Deck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  starters: IOSChatStarter[];
  listening: boolean;
  liveTranscript: string;
  onToggleMic: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  speaking: boolean;
  onToggleSpeaking: () => void;
  /** True while Aura's voice is actually playing. */
  voicePlaying: boolean;
  onModeChange?: (mode: AuraChatMode) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*([-*]|\d+\.)\s+/gm, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

interface KnowledgeCard {
  kind: string;
  body: string;
}

/**
 * Splits an answer into a few study-sized cards: the first paragraph is the
 * idea, lists become "Key points", later paragraphs are "More", each kept to
 * a readable size.
 */
export function splitIntoCards(content: string, maxCards = 5): KnowledgeCard[] {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const cards: KnowledgeCard[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer.trim()) return;
    cards.push({ kind: cards.length === 0 ? "The idea" : "More", body: buffer.trim() });
    buffer = "";
  };
  for (const block of blocks) {
    const isList = /^([-*]|\d+\.)\s/m.test(block);
    if (buffer && (buffer.length + block.length > 320 || isList || cards.length === 0)) flush();
    if (isList && cards.length > 0) {
      cards.push({ kind: "Key points", body: block });
      continue;
    }
    buffer = buffer ? `${buffer}\n\n${block}` : block;
  }
  flush();
  if (cards.length > maxCards) {
    const kept = cards.slice(0, maxCards - 1);
    kept.push({
      kind: "More",
      body: cards
        .slice(maxCards - 1)
        .map((c) => c.body)
        .join("\n\n"),
    });
    return kept;
  }
  return cards;
}

/** The final sentences of `text`, at most about `max` characters. */
function lastSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  let out = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = `${sentences[i].trim()} ${out}`.trim();
    if (next.length > max && out) break;
    out = next;
  }
  return out.length > max ? `…${out.slice(-max)}` : out;
}

/** The last paragraph or list item of a markdown answer. */
function lastParagraph(markdown: string): string {
  const parts = markdown
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? markdown;
}

/** The question that led to message `index`, for card fronts. */
function questionBefore(messages: Message[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "user") return plainText(messages[i].content);
  }
  return "";
}

// ── Composer (Notebook and Cards) ─────────────────────────────────────────

function Composer({
  input,
  setInput,
  onSend,
  onAbort,
  isStreaming,
  listening,
  onToggleMic,
  placeholder,
  variant,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onAbort: () => void;
  isStreaming: boolean;
  listening: boolean;
  onToggleMic: () => void;
  placeholder: string;
  variant: "glass" | "paper";
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);
  const send = () => {
    if (!input.trim() || isStreaming) return;
    iosTap();
    onSend();
  };
  return (
    <div className={`ios-composer ${variant === "paper" ? "is-paper" : "ios-glass"}`}>
      <textarea
        ref={ref}
        rows={1}
        value={input}
        placeholder={listening ? "Listening…" : placeholder}
        aria-label={placeholder}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      {!input.trim() && !isStreaming && (
        <button
          type="button"
          className={`ios-composer-mic ${listening ? "is-on" : ""}`}
          aria-label={listening ? "Stop dictation" : "Dictate"}
          aria-pressed={listening}
          onClick={() => {
            iosSelection();
            onToggleMic();
          }}
        >
          <Mic aria-hidden />
        </button>
      )}
      {isStreaming ? (
        <button
          type="button"
          className="ios-composer-send"
          aria-label="Stop"
          onClick={() => {
            iosTap();
            onAbort();
          }}
        >
          <Square aria-hidden />
        </button>
      ) : (
        input.trim() && (
          <button type="button" className="ios-composer-send" aria-label="Send" onClick={send}>
            <ArrowUp aria-hidden />
          </button>
        )
      )}
    </div>
  );
}

function Starters({
  starters,
  onSendPrompt,
  variant,
}: {
  starters: IOSChatStarter[];
  onSendPrompt: (p: string) => void;
  variant: "glass" | "paper";
}) {
  return (
    <div className={`ios-chat-starters ${variant === "paper" ? "is-paper" : ""}`}>
      {starters.map((starter) => (
        <button
          key={starter.label}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            iosTap();
            onSendPrompt(starter.prompt);
          }}
        >
          <starter.icon aria-hidden />
          <span>
            <span className="ios-chat-starter-label">{starter.label}</span>
            {starter.detail && <span className="ios-chat-starter-detail">{starter.detail}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Talk ──────────────────────────────────────────────────────────────────

function TalkMode({
  messages,
  isStreaming,
  listening,
  liveTranscript,
  voicePlaying,
  onHoldStart,
  onHoldEnd,
  onType,
  starters,
  onSendPrompt,
}: {
  messages: Message[];
  isStreaming: boolean;
  listening: boolean;
  liveTranscript: string;
  voicePlaying: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onType: () => void;
  starters: IOSChatStarter[];
  onSendPrompt: (p: string) => void;
}) {
  const last = messages[messages.length - 1];
  const thinking = isStreaming && (!last || last.role === "user" || !last.content);
  const state = listening
    ? "listening"
    : thinking
      ? "thinking"
      : voicePlaying || isStreaming
        ? "speaking"
        : "idle";
  const [pulse, setPulse] = useState(0);
  // A lively level for the orb while it listens or speaks (the recogniser's
  // own loudness is not exposed here; this keeps the orb visibly alive).
  useEffect(() => {
    if (state !== "listening" && state !== "speaking") {
      setPulse(0);
      return;
    }
    const t = window.setInterval(() => setPulse(0.35 + Math.random() * 0.65), 140);
    return () => window.clearInterval(t);
  }, [state]);

  const lastAura = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
  // Captions show what is being said now: the live transcript while
  // listening, else the last sentence or two of Aura's latest answer.
  const caption = listening
    ? liveTranscript || "I'm listening…"
    : lastAura
      ? lastSentences(plainText(lastParagraph(lastAura.content)), 150)
      : "Hold the button and ask me anything about what you're studying.";
  const status = {
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    idle: messages.length ? "Your turn" : "Prof. Aura",
  }[state];
  const holding = useRef(false);
  const start = () => {
    if (holding.current || isStreaming) return;
    holding.current = true;
    iosTap();
    onHoldStart();
  };
  const end = () => {
    if (!holding.current) return;
    holding.current = false;
    iosSelection();
    onHoldEnd();
  };

  return (
    <div className="ios-talk">
      <div className={`ios-talk-orb is-${state}`}>
        <span className="ios-talk-ring" aria-hidden />
        <span className="ios-talk-ring is-2" aria-hidden />
        <ProfAura
          variant={state === "thinking" ? "thinking" : state === "speaking" ? "streaming" : "rest"}
          size={168}
          mood={state === "listening" ? "focused" : "default"}
          audioLevel={pulse}
        />
      </div>
      <div className="ios-talk-status">{status}</div>
      <div className="ios-talk-caption" aria-live="polite">
        {caption}
      </div>

      {messages.length === 0 && (
        <div className="ios-talk-starters">
          {starters.slice(0, 3).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                iosTap();
                onSendPrompt(s.prompt);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="ios-talk-controls">
        <button
          type="button"
          className="ios-talk-side ios-glass"
          aria-label="Type instead"
          onClick={onType}
        >
          <Keyboard aria-hidden />
        </button>
        <button
          type="button"
          className={`ios-talk-hold ${listening ? "is-on" : ""}`}
          aria-label="Hold to talk"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            start();
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Mic aria-hidden />
        </button>
        <span className="ios-talk-side-spacer" aria-hidden />
      </div>
      <div className="ios-talk-hint">{listening ? "Release to send" : "Hold to talk"}</div>
    </div>
  );
}

// ── Notebook ──────────────────────────────────────────────────────────────

function NotebookMode({
  messages,
  isStreaming,
  deckTitle,
  onAnswerQuiz,
  onSaveCard,
  onMakeCard,
  starters,
  onSendPrompt,
}: {
  messages: Message[];
  isStreaming: boolean;
  deckTitle: string;
  onAnswerQuiz: (id: string, i: number) => void;
  onSaveCard: (id: string) => void;
  onMakeCard: (front: string, back: string) => Promise<boolean>;
  starters: IOSChatStarter[];
  onSendPrompt: (p: string) => void;
}) {
  const [made, setMade] = useState<string[]>([]);
  const date = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });

  // Tap a highlighted term (Aura's **bold**) to turn it into a card whose
  // back is the sentence it appeared in.
  const onPageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest("strong");
    if (!el) return;
    const term = el.textContent?.trim();
    if (!term || made.includes(term)) return;
    const block = el.closest("p, li")?.textContent?.trim() ?? term;
    iosTap();
    if (await onMakeCard(`What is ${term}?`, block)) {
      iosSuccess();
      el.classList.add("is-carded");
      setMade((m) => [...m, term]);
    }
  };

  return (
    <div className="ios-notebook" onClick={onPageClick}>
      <div className="ios-notebook-margin" aria-hidden />
      <div className="ios-notebook-head">
        <span>{deckTitle || "Notes"}</span>
        <span>{date}</span>
      </div>
      {messages.length === 0 ? (
        <div className="ios-notebook-empty">
          <p className="ios-note-hand">Ask a question in the margin ✎</p>
          <p className="ios-note-small">
            Aura answers on the page. Tap a highlighted term to turn it into a flashcard.
          </p>
          <Starters starters={starters} onSendPrompt={onSendPrompt} variant="paper" />
        </div>
      ) : (
        messages.map((m, i) =>
          m.role === "user" ? (
            <p key={m.id} className="ios-note-hand ios-note-q">
              {m.content}
            </p>
          ) : (
            <div key={m.id} className="ios-note-a">
              {m.content ? (
                <div className="ios-note-typeset">{renderMarkdown(m.content)}</div>
              ) : isStreaming && i === messages.length - 1 ? (
                <p className="ios-note-writing">Aura is writing…</p>
              ) : null}
              {m.quizBlock && !(isStreaming && i === messages.length - 1) && (
                <QuizBlock
                  question={m.quizBlock.question}
                  options={m.quizBlock.options}
                  correctIndex={m.quizBlock.correctIndex}
                  userAnswer={m.quizBlock.userAnswer}
                  onAnswer={(idx) => onAnswerQuiz(m.id, idx)}
                />
              )}
              {m.hasSaveCard && m.content && (
                <button
                  type="button"
                  className="ios-note-save"
                  onClick={(e) => {
                    e.stopPropagation();
                    iosTap();
                    onSaveCard(m.id);
                  }}
                >
                  <Plus aria-hidden /> Save Aura&rsquo;s card
                </button>
              )}
            </div>
          ),
        )
      )}
      {made.length > 0 && (
        <div className="ios-note-made">
          <Check aria-hidden /> {made.length} {made.length === 1 ? "card" : "cards"} made from this
          page
        </div>
      )}
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────

function CardStack({
  message,
  question,
  streaming,
  onAnswerQuiz,
  onMakeCard,
}: {
  message: Message;
  question: string;
  streaming: boolean;
  onAnswerQuiz: (id: string, i: number) => void;
  onMakeCard: (front: string, back: string) => Promise<boolean>;
}) {
  const cards = useMemo(() => splitIntoCards(message.content), [message.content]);
  const total = cards.length + (message.quizBlock ? 1 : 0);
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<number[]>([]);

  if (!message.content && streaming) {
    return (
      <div className="ios-kcard is-loading">
        <TypingIndicator />
      </div>
    );
  }

  return (
    <div className="ios-kstack">
      <div
        className="ios-krail"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth * 0.86));
          if (i !== active) {
            setActive(i);
            iosSelection();
          }
        }}
      >
        {cards.map((card, i) => (
          <article key={i} className="ios-kcard">
            <header>
              <span className="ios-kcard-kind">{card.kind}</span>
              <span className="ios-kcard-index">
                {i + 1}/{total}
              </span>
            </header>
            <div className="ios-kcard-body">{renderMarkdown(card.body)}</div>
            {!streaming && (
              <button
                type="button"
                className={`ios-kcard-save ${saved.includes(i) ? "is-saved" : ""}`}
                disabled={saved.includes(i)}
                onClick={async () => {
                  iosTap();
                  const front = question || plainText(card.body).slice(0, 80);
                  if (await onMakeCard(front, plainText(card.body).slice(0, 400))) {
                    iosSuccess();
                    setSaved((s) => [...s, i]);
                  }
                }}
              >
                {saved.includes(i) ? <Check aria-hidden /> : <Plus aria-hidden />}
                {saved.includes(i) ? "Saved" : "Save card"}
              </button>
            )}
          </article>
        ))}
        {message.quizBlock && !streaming && (
          <article className="ios-kcard is-quiz">
            <header>
              <span className="ios-kcard-kind">Check yourself</span>
              <span className="ios-kcard-index">
                {total}/{total}
              </span>
            </header>
            <QuizBlock
              question={message.quizBlock.question}
              options={message.quizBlock.options}
              correctIndex={message.quizBlock.correctIndex}
              userAnswer={message.quizBlock.userAnswer}
              onAnswer={(idx) => onAnswerQuiz(message.id, idx)}
            />
          </article>
        )}
      </div>
      {total > 1 && (
        <div className="ios-kdots" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i === active ? "is-on" : ""} />
          ))}
          <span className="ios-kdots-hint">{active < total - 1 ? "swipe for more" : ""}</span>
        </div>
      )}
    </div>
  );
}

function CardsMode({
  messages,
  isStreaming,
  onAnswerQuiz,
  onMakeCard,
  starters,
  onSendPrompt,
}: {
  messages: Message[];
  isStreaming: boolean;
  onAnswerQuiz: (id: string, i: number) => void;
  onMakeCard: (front: string, back: string) => Promise<boolean>;
  starters: IOSChatStarter[];
  onSendPrompt: (p: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="ios-chat-empty">
        <div className="ios-kcard-demo" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <h2>Answers you can keep</h2>
        <p>Aura replies in cards you can swipe through and save to your deck.</p>
        <Starters starters={starters} onSendPrompt={onSendPrompt} variant="glass" />
      </div>
    );
  }
  return (
    <div className="ios-kthread">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={m.id} className="ios-kask">
            {m.content}
          </div>
        ) : (
          <CardStack
            key={m.id}
            message={m}
            question={questionBefore(messages, i)}
            streaming={isStreaming && i === messages.length - 1}
            onAnswerQuiz={onAnswerQuiz}
            onMakeCard={onMakeCard}
          />
        ),
      )}
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

export function IOSChatView(props: IOSChatViewProps) {
  const {
    messages,
    isStreaming,
    input,
    setInput,
    onSend,
    onSendPrompt,
    onAbort,
    onNewChat,
    onSaveCard,
    onAnswerQuiz,
    onMakeCard,
    decks,
    selectedDeckId,
    onSelectDeck,
    starters,
    listening,
    liveTranscript,
    onToggleMic,
    onHoldStart,
    onHoldEnd,
    speaking,
    onToggleSpeaking,
    voicePlaying,
    onModeChange,
  } = props;
  const [mode, setMode] = useAppPreference<AuraChatMode>(AURA_CHAT_MODE_KEY, "notebook");
  const [deckSheet, setDeckSheet] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const deck = decks.find((d) => d.id === selectedDeckId) ?? decks[0];
  const hasMessages = messages.length > 0;

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    if (mode !== "talk") endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming, mode]);

  return (
    <div className={`ios-chat is-${mode}`}>
      <header className="ios-chat-header ios-navbar is-collapsed">
        <div className="ios-navbar-row">
          <div className="ios-navbar-side">
            <button
              type="button"
              className="ios-bar-button"
              aria-label="New chat"
              disabled={!hasMessages}
              onClick={() => {
                iosTap();
                onNewChat();
              }}
            >
              <Plus className="h-[22px] w-[22px]" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="ios-chat-title"
            onClick={() => {
              iosSelection();
              setDeckSheet(true);
            }}
            disabled={decks.length === 0}
          >
            <span className="ios-chat-avatar" aria-hidden>
              <ProfAura variant={isStreaming ? "thinking" : "badge"} size={22} />
            </span>
            <span>
              <span className="ios-chat-name">Prof. Aura</span>
              <span className="ios-chat-sub">
                {isStreaming ? "thinking…" : deck ? deck.title : "Your study coach"}
                {decks.length > 0 && <ChevronDown aria-hidden />}
              </span>
            </span>
          </button>
          <div className="ios-navbar-side is-trailing">
            <button
              type="button"
              className="ios-bar-button"
              aria-label={speaking ? "Stop reading replies aloud" : "Read replies aloud"}
              aria-pressed={speaking}
              onClick={() => {
                iosSelection();
                onToggleSpeaking();
              }}
            >
              {speaking ? (
                <Volume2 className="h-[22px] w-[22px]" aria-hidden />
              ) : (
                <VolumeX className="h-[22px] w-[22px]" aria-hidden />
              )}
            </button>
          </div>
        </div>
        <div className="ios-chat-modes">
          <IOSSegmented
            label="How to talk with Aura"
            value={mode}
            onChange={setMode}
            options={[
              { value: "talk", label: "Talk" },
              { value: "notebook", label: "Notebook" },
              { value: "cards", label: "Cards" },
            ]}
          />
        </div>
      </header>

      <div className="ios-chat-scroll">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {mode === "talk" ? (
              <TalkMode
                messages={messages}
                isStreaming={isStreaming}
                listening={listening}
                liveTranscript={liveTranscript}
                voicePlaying={voicePlaying}
                onHoldStart={onHoldStart}
                onHoldEnd={onHoldEnd}
                onType={() => setMode("notebook")}
                starters={starters}
                onSendPrompt={onSendPrompt}
              />
            ) : mode === "notebook" ? (
              <NotebookMode
                messages={messages}
                isStreaming={isStreaming}
                deckTitle={deck?.title ?? ""}
                onAnswerQuiz={onAnswerQuiz}
                onSaveCard={onSaveCard}
                onMakeCard={onMakeCard}
                starters={starters}
                onSendPrompt={onSendPrompt}
              />
            ) : (
              <CardsMode
                messages={messages}
                isStreaming={isStreaming}
                onAnswerQuiz={onAnswerQuiz}
                onMakeCard={onMakeCard}
                starters={starters}
                onSendPrompt={onSendPrompt}
              />
            )}
          </motion.div>
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {mode !== "talk" && (
        <Composer
          input={input}
          setInput={setInput}
          onSend={onSend}
          onAbort={onAbort}
          isStreaming={isStreaming}
          listening={listening}
          onToggleMic={onToggleMic}
          placeholder={mode === "notebook" ? "Ask in the margin…" : "Ask Prof. Aura…"}
          variant={mode === "notebook" ? "paper" : "glass"}
        />
      )}

      <IOSSheet open={deckSheet} title="Chat About" onClose={() => setDeckSheet(false)}>
        <IOSChoiceList
          options={decks.map((d) => ({ value: d.id, label: d.title }))}
          value={deck?.id ?? ""}
          onChange={(id) => {
            onSelectDeck(id);
            setDeckSheet(false);
          }}
        />
      </IOSSheet>
    </div>
  );
}

export default IOSChatView;
