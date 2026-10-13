import { useMemo } from 'react';
import type { ChatMode, Message } from '../../hooks/useAIChat';
import { Sparkles, ArrowRight, RotateCcw, Lightbulb, Brain, FlaskConical, ListChecks } from '@/components/icons';

interface Props {
  mode: ChatMode;
  deckName: string;
  currentCardTerm?: string;
  messages?: Message[];
  onSelect: (prompt: string) => void;
}

interface Suggestion {
  label: string;
  prompt: string;
  /** Optional small icon shown next to the label */
  icon: 'sparkles' | 'arrow' | 'retry' | 'bulb' | 'brain' | 'flask' | 'list';
}

/* Mode-only fallback prompts (used when conversation history gives no signal yet).
   Two modes live here, mirroring the ChatMode union in lib/chat-prompts.ts.
   The set of 4 prompts per mode reflects the four shapes Prof. Linnea picks from
   (teach / quiz / generate / coach) so a fresh conversation surfaces the full
   capability space even before the user types anything. */
const FALLBACK: Record<ChatMode, Suggestion[]> = {
  study: [
    { label: 'Explain a concept', prompt: 'Pick the hardest idea in this deck and teach it to me with a real-world analogy.', icon: 'bulb' },
    { label: 'Quiz me', prompt: 'Quiz me on my weakest card. One multiple-choice question, stop after.', icon: 'flask' },
    { label: 'Generate flashcards', prompt: 'Generate 3 new flashcards for this deck. Include mnemonics where they help.', icon: 'sparkles' },
    { label: 'How am I doing?', prompt: 'Look at my FSRS data and tell me what to study in the next 20 minutes.', icon: 'brain' },
  ],
  companion: [
    { label: 'How am I doing?', prompt: 'How am I doing across all my decks this week?', icon: 'brain' },
    { label: 'Motivate me', prompt: 'I\'m struggling to stay focused. Give me a pep talk.', icon: 'bulb' },
    { label: 'Brainstorm', prompt: 'Help me brainstorm what subjects I should tackle next.', icon: 'sparkles' },
    { label: 'Wind down', prompt: 'It\'s been a long day — recap what I learned and tell me what to save.', icon: 'list' },
  ],
};

/**
 * Inspect the last assistant message and classify what it DID so we can
 * propose followups that make sense in the actual flow of conversation.
 */
type Signal =
  | 'saved_card'        // AI proposed saving a flashcard
  | 'showed_quiz'       // AI ran a multiple-choice quiz
  | 'showed_code'       // AI produced a fenced code block
  | 'showed_list'       // AI produced a list / enumeration
  | 'explained_concept' // explanation with headers / analogy
  | 'answered_question' // direct answer to a user question
  | 'unknown';

function detectSignal(lastAssistant: Message | undefined): Signal {
  if (!lastAssistant) return 'unknown';
  const c = lastAssistant.content || '';
  // useAIChat populates saveCardData from SAVE_CARD_REGEX match, so this is enough.
  if (lastAssistant.saveCardData) return 'saved_card';
  if (lastAssistant.quizBlock) return 'showed_quiz';
  if (/```[\w-]*\n[\s\S]+?```/.test(c)) return 'showed_code';
  // Lists: at least 3 consecutive bullet/numbered lines
  const listLines = c.split('\n').filter(l => /^\s*([-*]|\d+\.)\s/.test(l)).length;
  if (listLines >= 3) return 'showed_list';
  // Headers mark structured explanation
  if (/^#{1,3}\s/m.test(c) || /\*\*[^*]+\*\*/.test(c)) return 'explained_concept';
  return 'answered_question';
}

function pickForSignal(signal: Signal, deckName: string, weakFirstTerm?: string): Suggestion[] {
  switch (signal) {
    case 'saved_card':
      return [
        { label: 'Save a related card', prompt: `Generate one more related flashcard for ${deckName} on a similar concept.`, icon: 'list' },
        { label: 'Apply it', prompt: 'Give me a tiny worked example using the term I just saved.', icon: 'arrow' },
        { label: 'Mnemonic', prompt: 'Invent a memorable mnemonic for the term I just saved.', icon: 'sparkles' },
        { label: 'Quiz me on it', prompt: `Quiz me on the card I just saved.`, icon: 'flask' },
      ];
    case 'showed_quiz':
      return [
        { label: 'Why was that right?', prompt: 'Don\'t just tell me the answer — explain why it\'s correct and what I missed.', icon: 'bulb' },
        { label: 'Harder next', prompt: 'Throw a harder follow-up on the same idea.', icon: 'arrow' },
        { label: 'Common traps', prompt: 'What\'s the trap answer here, and how do I learn to avoid it?', icon: 'bulb' },
        { label: 'My weak spot?', prompt: weakFirstTerm
          ? `I keep missing "${weakFirstTerm}" — give me a deeper treatment.`
          : 'Pattern-match my recent misses and tell me my biggest gap.', icon: 'brain' },
      ];
    case 'showed_code':
      return [
        { label: 'Translate it', prompt: 'Rewrite the same code in a different language or style.', icon: 'arrow' },
        { label: 'Walk it through', prompt: 'Trace this code step by step. What happens on line 1, line 2...?', icon: 'list' },
        { label: 'Make it shorter', prompt: 'Refactor this — fewer lines, same behavior.', icon: 'arrow' },
        { label: 'Edge cases', prompt: 'What inputs would break this? Show them.', icon: 'flask' },
      ];
    case 'showed_list':
      return [
        { label: 'Pick the best one', prompt: 'Which of those is most important, and why? Tell me like I have to pick one.', icon: 'arrow' },
        { label: 'Turn into flashcards', prompt: `Convert the list into flashcards I can save to ${deckName}.`, icon: 'list' },
        { label: 'Connect them', prompt: 'How do those items relate to each other? Map it.', icon: 'brain' },
        { label: 'What am I missing?', prompt: 'What\'s NOT in that list but probably should be?', icon: 'bulb' },
      ];
    case 'explained_concept':
      return [
        { label: 'Mnemonic please', prompt: 'Give me a mnemonic I\'ll remember this with forever.', icon: 'sparkles' },
        { label: 'Analog from my life', prompt: 'Map this onto something I already know — cooking, sports, anything.', icon: 'bulb' },
        { label: 'Quiz me', prompt: 'Quiz me on this immediately, before I forget.', icon: 'flask' },
        { label: 'What trips people up?', prompt: 'Where do most learners get confused on this?', icon: 'bulb' },
      ];
    case 'answered_question':
    default:
      return [
        { label: 'Deeper', prompt: 'Go deeper — what\'s underneath your answer?', icon: 'list' },
        { label: 'Counter-example', prompt: 'What would a counter-example to your answer look like?', icon: 'flask' },
        { label: 'Save as card', prompt: 'Turn your last answer into a flashcard I can review.', icon: 'list' },
        { label: 'Related?', prompt: 'What other questions does this answer naturally lead to?', icon: 'arrow' },
      ];
  }
}

const ICON_MAP = {
  sparkles: Sparkles, arrow: ArrowRight, retry: RotateCcw, bulb: Lightbulb,
  brain: Brain, flask: FlaskConical, list: ListChecks,
};

export default function SuggestedPrompts({ mode, deckName, currentCardTerm, messages, onSelect }: Props) {
  const suggestions = useMemo<Suggestion[]>(() => {
    const list = messages ?? [];
    const last = [...list].reverse().find(m => m.role === 'assistant');
    const signal = detectSignal(last);
    if (signal === 'unknown') return FALLBACK[mode];
    return pickForSignal(signal, deckName, currentCardTerm);
  }, [messages, mode, deckName, currentCardTerm]);

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-2">
      {suggestions.map((s, i) => {
        const Icon = ICON_MAP[s.icon] ?? Sparkles;
        return (
          <button
            key={`${s.label}-${i}`}
            onClick={() => onSelect(s.prompt)}
            className="group relative flex-none flex items-center gap-1.5 text-xs text-[#A8A8C0] bg-[#15151D] border border-[#2A2A3A] rounded-full px-3 py-1.5 hover:border-[#7C3AED]/50 hover:text-[#F0EFFE] hover:bg-[#1A1A24] cursor-pointer whitespace-nowrap transition-all duration-150 hover:shadow-[inset_0_0_18px_rgba(124,58,237,0.18)] hover:-translate-y-[1px]"
          >
            <Icon
              size={11}
              className="opacity-60 group-hover:opacity-100 group-hover:text-[#A78BFA] transition-all"
            />
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
