/**
 * Prof. Aura chat for the iPhone app, in the style of Messages: violet
 * bubbles for the student, grey for Aura, a floating glass composer above
 * the tab bar with a mic and a round send button, suggestion chips, and the
 * deck picked from a sheet in the navigation bar.
 *
 * Presentation only. AIChatPage owns the conversation (context, memory,
 * history, streaming) and renders this view on iPhone.
 */
import React, { useEffect, useRef, useState } from "react";
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
  Copy,
  Mic,
  Plus,
  Square,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "../icons";
import { IOSChoiceList, IOSSheet } from "./IOSPrimitives";
import { iosSelection, iosTap } from "./iosHaptics";

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
  decks: Deck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  starters: IOSChatStarter[];
  listening: boolean;
  onToggleMic: () => void;
  speaking: boolean;
  onToggleSpeaking: () => void;
}

function Bubble({
  message,
  streaming,
  onSaveCard,
  onAnswerQuiz,
}: {
  message: Message;
  streaming: boolean;
  onSaveCard: (id: string) => void;
  onAnswerQuiz: (id: string, index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const mine = message.role === "user";
  return (
    <motion.div
      className={`ios-chat-row ${mine ? "is-mine" : ""}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 36 }}
    >
      <div className={`ios-bubble ${mine ? "ios-bubble-mine" : "ios-bubble-aura"}`}>
        {mine ? (
          message.content
        ) : message.content ? (
          <div className="ios-bubble-markdown">{renderMarkdown(message.content)}</div>
        ) : streaming ? (
          <TypingIndicator />
        ) : null}
        {!mine && message.quizBlock && !streaming && (
          <QuizBlock
            question={message.quizBlock.question}
            options={message.quizBlock.options}
            correctIndex={message.quizBlock.correctIndex}
            userAnswer={message.quizBlock.userAnswer}
            onAnswer={(idx) => onAnswerQuiz(message.id, idx)}
          />
        )}
      </div>
      {!mine && message.content && !streaming && (
        <div className="ios-bubble-actions">
          <button
            type="button"
            onClick={() => {
              iosTap();
              void navigator.clipboard?.writeText(message.content).then(() => setCopied(true));
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
          {message.hasSaveCard && (
            <button
              type="button"
              disabled={saved}
              onClick={() => {
                iosTap();
                onSaveCard(message.id);
                setSaved(true);
              }}
            >
              {saved ? <Check aria-hidden /> : <Plus aria-hidden />}
              {saved ? "Saved to deck" : "Save as card"}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

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
    decks,
    selectedDeckId,
    onSelectDeck,
    starters,
    listening,
    onToggleMic,
    speaking,
    onToggleSpeaking,
  } = props;
  const [deckSheet, setDeckSheet] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const deck = decks.find((d) => d.id === selectedDeckId) ?? decks[0];
  const hasMessages = messages.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming]);

  // Grow the field with its text, up to five lines, like Messages.
  useEffect(() => {
    const el = fieldRef.current;
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
    <div className="ios-chat">
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
                {isStreaming ? "typing…" : deck ? deck.title : "Your study coach"}
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
      </header>

      <div className="ios-chat-scroll">
        {!hasMessages ? (
          <div className="ios-chat-empty">
            <div className="ios-chat-orb" aria-hidden>
              <ProfAura variant="badge" size={64} />
            </div>
            <h2>Ask Prof. Aura</h2>
            <p>
              Your tutor sees what you&rsquo;re studying and what you keep missing. Ask anything, or
              start here:
            </p>
            <div className="ios-chat-starters">
              {starters.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => {
                    iosTap();
                    onSendPrompt(starter.prompt);
                  }}
                >
                  <starter.icon aria-hidden />
                  <span>
                    <span className="ios-chat-starter-label">{starter.label}</span>
                    {starter.detail && (
                      <span className="ios-chat-starter-detail">{starter.detail}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ios-chat-list">
            <AnimatePresence initial={false}>
              {messages.map((message, i) => (
                <Bubble
                  key={message.id}
                  message={message}
                  streaming={isStreaming && i === messages.length - 1}
                  onSaveCard={onSaveCard}
                  onAnswerQuiz={onAnswerQuiz}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ios-composer ios-glass">
        <textarea
          ref={fieldRef}
          rows={1}
          value={input}
          placeholder={listening ? "Listening…" : "Message Prof. Aura"}
          aria-label="Message Prof. Aura"
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
