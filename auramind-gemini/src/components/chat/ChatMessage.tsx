import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { User } from '@/components/icons';
import type { Message } from '../../hooks/useAIChat';
import QuizBlock from './QuizBlock';
import TypingIndicator from './TypingIndicator';
import MessageActions from './MessageActions';
import ProfAura from './ProfAura';

interface Props {
  message: Message;
  isStreaming: boolean;
  onSaveCard: (messageId: string, term: string, definition: string) => void;
  onAnswerQuiz: (messageId: string, answerIndex: number) => void;
  /** Optional: regenerate the message (AIChatPage wires this up; panels
   *  leave it undefined to disable the button). */
  onRegenerate?: (messageId: string) => void;
  /** Optional: thumbs-up/thumbs-down telemetry hook. */
  onFeedback?: (messageId: string, kind: 'up' | 'down') => void;
}

/**
 * Lightweight markdown renderer — no dependencies needed.
 * Handles: bold, italic, inline code, code blocks, headers, lists, blockquotes, links.
 */
export function renderMarkdown(text: string): React.ReactNode[] {
  // Step 1: Extract code blocks first to protect them from paragraph splitting
  const codeBlocks: string[] = [];
  const withoutCodeBlocks = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(JSON.stringify({ lang, code: code.trim() }));
    return placeholder;
  });

  // Step 2: Split remaining text into blocks by double newlines or structural markers
  const blocks = withoutCodeBlocks.split(/(\n\n|\n(?=#{1,3}\s)|\n(?=[-*]\s)|\n(?=\d+\.\s)|\n(?=>\s))/g);

  // Step 3: Render each block, restoring code blocks from placeholders
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Restore code blocks from placeholder
    const codeBlockMatch = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
    if (codeBlockMatch) {
      const idx = parseInt(codeBlockMatch[1], 10);
      const { lang, code } = JSON.parse(codeBlocks[idx]);
      return (
        <div key={i} className="my-3 rounded-xl overflow-hidden border border-[#2A2A3A] bg-[#0D0D14]">
          {lang && (
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#2A2A3A] bg-[#111118]">
              <span className="text-[10px] font-medium text-[#7A7A96] uppercase tracking-wider">{lang}</span>
            </div>
          )}
          <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
            <code className="text-[#C4C4D4] font-mono text-[13px]">{code}</code>
          </pre>
        </div>
      );
    }

    // Headers
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
      const size = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
      return (
        <Tag key={i} className={`${size} font-semibold text-[#F0EFFE] mt-4 mb-2`}>
          {renderInline(headerMatch[2])}
        </Tag>
      );
    }

    // Blockquotes
    if (trimmed.startsWith('>')) {
      return (
        <blockquote key={i} className="my-3 pl-4 border-l-2 border-[#7C3AED]/40 text-[#8A8AA3] text-sm italic">
          {renderInline(trimmed.replace(/^>\s?/, ''))}
        </blockquote>
      );
    }

    // Unordered lists
    if (trimmed.match(/^[-*]\s/)) {
      const items = trimmed.split('\n').filter(l => l.match(/^[-*]\s/));
      return (
        <ul key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-[#C4C4D4] flex items-start gap-2">
              <span className="text-[#7C3AED] mt-1.5 text-[6px]">●</span>
              <span>{renderInline(item.replace(/^[-*]\s/, ''))}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Ordered lists
    if (trimmed.match(/^\d+\.\s/)) {
      const items = trimmed.split('\n').filter(l => l.match(/^\d+\.\s/));
      return (
        <ol key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-[#C4C4D4] flex items-start gap-2">
              <span className="text-[#7C3AED] font-medium text-xs mt-0.5 min-w-[16px]">{j + 1}.</span>
              <span>{renderInline(item.replace(/^\d+\.\s/, ''))}</span>
            </li>
          ))}
        </ol>
      );
    }

    // Regular paragraph
    return (
      <p key={i} className="text-sm text-[#C4C4D4] leading-relaxed my-1.5">
        {renderInline(trimmed)}
      </p>
    );
  }).filter(Boolean);
}

/** Render inline markdown: bold, italic, code, links */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Inline code
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded-md bg-[#1A1A24] border border-[#2A2A3A] text-[#EC4899] text-[13px] font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold text-[#F0EFFE]">{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++} className="italic text-[#A8A8C0]">{italicMatch[2]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // No more matches — push rest
    parts.push(<span key={key}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function ChatMessage({
  message,
  isStreaming,
  onSaveCard,
  onAnswerQuiz,
  onRegenerate,
  onFeedback,
}: Props) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (message.saveCardData) {
      onSaveCard(message.id, message.saveCardData.term, message.saveCardData.definition);
      setSaved(true);
    }
  };
  const handleRegenerate = () => onRegenerate?.(message.id);
  const handleFeedback = (kind: 'up' | 'down') => onFeedback?.(message.id, kind);

  const renderedContent = useMemo(() => {
    if (!message.content) return null;
    return renderMarkdown(message.content);
  }, [message.content]);

  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="flex justify-end"
      >
        <div className="flex items-end gap-2.5 max-w-[80%]">
          <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] px-4 py-3 text-sm text-white leading-relaxed shadow-lg shadow-violet-900/20">
            {message.content}
          </div>
          <div className="w-7 h-7 rounded-lg bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center shrink-0">
            <User size={12} className="text-[#7A7A96]" />
          </div>
        </div>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="flex justify-start"
    >
      <div className="flex items-end gap-2.5 max-w-[85%] w-full">
        {/* Prof. Aura avatar — animated SVG */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#06B6D4] flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/15 p-[3px]">
          <ProfAura variant={isStreaming ? 'streaming' : 'badge'} size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="rounded-2xl rounded-bl-md bg-[#111118] border border-[#2A2A3A] px-5 py-4 text-sm leading-relaxed">
            {/* Content */}
            {message.content ? (
              <div>
                {renderedContent}
                {isStreaming && (
                  <span className="inline-block w-[2px] h-4 bg-[#8B5CF6] ml-0.5 align-middle rounded-full animate-pulse" />
                )}
              </div>
            ) : isStreaming && message.role === 'assistant' ? (
              <TypingIndicator />
            ) : null}

            {/* Quiz block */}
            {message.quizBlock && !isStreaming && (
              <QuizBlock
                question={message.quizBlock.question}
                options={message.quizBlock.options}
                correctIndex={message.quizBlock.correctIndex}
                userAnswer={message.quizBlock.userAnswer}
                onAnswer={(idx) => onAnswerQuiz(message.id, idx)}
              />
            )}
          </div>

          {/* Action chips — hover-revealed on desktop, always visible on
              touch. Encapsulated in <MessageActions> so the inline copy,
              save, regenerate, and feedback logic is shared with other
              surfaces (AIChatPanel etc.) instead of copied by hand. */}
          {message.content && !isStreaming && message.role === 'assistant' && (
            <MessageActions
              copyText={message.content}
              hasSaveCard={!!message.hasSaveCard}
              saved={saved}
              onSaveCard={handleSave}
              onRegenerate={onRegenerate ? handleRegenerate : undefined}
              onFeedback={onFeedback ? handleFeedback : undefined}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
