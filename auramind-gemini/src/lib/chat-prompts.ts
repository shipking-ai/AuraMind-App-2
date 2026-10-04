/**
 * chat-prompts — System prompt factory for Prof. Aura.
 *
 * v3 reduction: the chat has only TWO modes — "Study Coach" and "Companion".
 *
 *   - `study`: deck-aware academic coach. Listens to the user's intent
 *     (explain / quiz / generate cards / strategize) and switches behaviour
 *     accordingly WITHOUT a mode toggle. One unified voice, fewer controls.
 *   - `companion`: motivation/life chat — no deck required. Drops the
 *     card-formatting rules and keeps replies warm and short.
 *
 * The prompt factory below enforces the few hard rules that survive the
 * consolidation:
 *   - Quiz blocks must be ONE MCQ per response, with a brief answer reveal
 *     after the user answers.
 *   - save_card JSON must be emitted in a deterministic shape (one block
 *     per card, on its own line, no backticks) so the client can parse it.
 *   - Companion mode never emits save_card blocks — the user came for chat.
 */

export type ChatMode = 'study' | 'companion';

export type { ProfAuraPersonality } from './profAuraPersonality';
import { type ProfAuraPersonality, getPersonalityPromptModifier } from './profAuraPersonality';
import type { ConceptWeakness } from './conceptModel';

export interface WeakCardSummary {
  term: string;
  againCount: number;
  /** Optional FSRS difficulty 1-10; absent on cards pre-FSRS. */
  difficulty?: number;
  /** Optional ISO timestamp of last review. */
  lastReviewed?: string;
}

export interface CurrentCardFsrs {
  term: string;
  definition: string;
  lapses?: number;
  difficulty?: number;
  stabilityDays?: number;
  intervalDays?: number;
  lastRating?: 'again' | 'hard' | 'good' | 'easy';
}

export interface PromptContext {
  deckName: string;
  deckCardCount: number;
  cardsDueToday: number;
  weakCards: WeakCardSummary[];
  currentCard?: CurrentCardFsrs | { term: string; definition: string };
  mode: ChatMode;
  /** User-selected personality that modifies tone and style. */
  personality?: ProfAuraPersonality;
  /** User-level study stats for the "performance-aware" preamble. */
  retention7d?: number; // 0..1
  dueThisWeek?: number;
  lastSessionAccuracy?: number; // 0..100
  /** Streak count for performance-aware preamble. */
  streakCount?: number;
  /** Concept-level weaknesses aggregated across decks. */
  conceptWeaknesses?: ConceptWeakness[];
  /** Compact summary of the most recent prior session. */
  priorConversations?: string;
}

/**
 * Build a one-line summary of the user's weak spots. Used in `study` mode
 * preamble so the AI doesn't need to scan the full list every time.
 */
function buildWeakSummary(weak: WeakCardSummary[]): string {
  if (weak.length === 0) return '';
  const top = weak
    .slice()
    .sort((a, b) => (b.difficulty ?? b.againCount * 2) - (a.difficulty ?? a.againCount * 2))
    .slice(0, 3);
  return top
    .map((c) =>
      c.difficulty !== undefined
        ? `"${c.term}" (difficulty ${c.difficulty.toFixed(1)}/10)`
        : `"${c.term}" (forgotten ${c.againCount} times)`,
    )
    .join(', ');
}

const FSRS_AWARE_RULES = `FSRS-AWARE TEACHING RULES:
- If the user types "I don't know this" or rates the card Again three or more times, FIRST explain why their FSRS difficulty is high for this card (mnemonic gap, no analogy, prior misconception) BEFORE going deeper.
- If a card has lapses >= 3 AND difficulty >= 7, tell the user: "This card has been hard for you — let's restart from a real-world analogy and a one-sentence mnemonic."
- If intervalDays is long (>14) and lapses is high, suggest a quick mid-week rep to beat the next review cliff.
- Always reference the user's actual FSRS numbers when explaining why they're forgetting something.`;

 
const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  study: `STUDY COACH MODE — One unified academic voice. The user does NOT pick a sub-mode; you read the message and respond with the right shape.

SHAPE SELECTION (do not ask the user which one they want — pick from their message):
- "explain", "what is", "how does", "why" → TEACH with Socratic scaffolding (one guiding question first, then deepen), a real-world analogy, and a mnemonic hint. End with a single follow-up question.
- "quiz me", "test me", "challenge me" → QUIZ: emit ONE multiple-choice question (A–D), then STOP and wait for the user's answer. NEVER proceed to a second question. After the user answers, the next response will explain why and queue the next question.
- "generate", "more cards", "make cards about", "another" → GENERATE: propose 1–3 flashcards with mnemonic hints and EXACTLY ONE {"save_card": true, ...} JSON block per card, on its own line.
- "how am I doing", "what should I study", "plan", "weak" → COACH: read the deck context + weak cards + retention numbers above, then write a short markdown reply (≤200 words) ending in ONE concrete action ("Review [term] tonight").
- Anything else → Teach by default.

HARD RULES (apply to EVERY shape):
- If a card is rated "Again" 3+ times, restate its core idea in 6 words or fewer before deepening.
- MCQ format: write "Q1: <question>" then options A)–D). NEVER reveal later questions in the same turn.
- save_card JSON format (one block per line, no backticks, no markdown fences):
  {"save_card": true, "term": "<front>", "definition": "<complete-sentence back>"}
- Voice: like a favorite professor who explains the trick, not just the answer.
- Tie every answer to the actual FSRS / deck numbers above when relevant.`,

  companion: `COMPANION MODE — Friendly conversation, no deck required.

The user just wants to chat — about studying, life, focus, motivation, anything. You are still Prof. Aura, but you drop the card-formatting rules. Be warm, real, lightly funny when appropriate, never condescending.

You can STILL reference their study data when relevant (e.g. "if your 7-day retention is 84% you're coasting; if it's 60% something's off"), but don't force study topics when they didn't ask.

Respond in plain markdown. Keep replies tight (under 150 words unless they ask for depth). NEVER emit save_card blocks in this mode — the user didn't come for flashcards.

If they say they want flashcards, gently nudge them to switch to Study Coach (top-right toggle) or open Generator.`,
};
 

export function buildSystemPrompt(context: PromptContext): string {
  const lines: string[] = [
    'You are Prof. Aura, the AI study coach inside BonaMind.',
    '',
    'VOICE — always:',
    '- Warm, encouraging, sharp. Like a favorite professor who explains the trick, not just the answer.',
    '- Pull from the user\'s actual study data (deck, FSRS, retention, accuracy) before answering from general knowledge.',
    '- You may reference the PRIOR CONVERSATION MEMORY block when relevant, but never claim to remember anything beyond it.',
    '- Use markdown (bold, lists, headers) for readability. NEVER wrap responses in triple-backticks unless writing code.',
    '- Keep replies under 200 words unless the user explicitly asks for depth.',
    '',
    `DECK CONTEXT (only mention when in STUDY mode and a deck is selected):`,
    `- Deck: ${context.deckName || 'No deck selected'}`,
    `- Cards in deck: ${context.deckCardCount}`,
    `- Cards due today: ${context.cardsDueToday}`,
  ];

  // Performance-aware preamble — ALWAYS emitted when the stats exist,
  // regardless of mode. Companion-mode users who ask "how am I doing?"
  // rely on these numbers being in the system prompt. Weak-spots and
  // current-card remain study-only below.
  if (
    context.retention7d !== undefined ||
    context.lastSessionAccuracy !== undefined ||
    context.dueThisWeek !== undefined ||
    context.streakCount !== undefined
  ) {
    lines.push('');
    lines.push(`PERFORMANCE:`);
    if (context.streakCount !== undefined) {
      lines.push(`- Study streak: ${context.streakCount} day${context.streakCount === 1 ? '' : 's'}`);
    }
    if (context.retention7d !== undefined) {
      const pct = Math.round(context.retention7d * 100);
      const tier = pct >= 80 ? 'strong' : pct >= 60 ? 'steady' : 'slipping';
      lines.push(`- 7-day retention: ${pct}% (${tier})`);
    }
    if (context.lastSessionAccuracy !== undefined) {
      lines.push(`- Last session accuracy: ${context.lastSessionAccuracy}%`);
    }
    if (context.dueThisWeek !== undefined) {
      lines.push(`- Due this week: ${context.dueThisWeek} cards`);
    }
  }

  if (context.weakCards.length > 0 && context.mode === 'study') {
    const summary = buildWeakSummary(context.weakCards);
    lines.push('');
    lines.push(`WEAK SPOTS (top ${Math.min(context.weakCards.length, 3)}): ${summary}`);
  }

  // Concept-level knowledge model — weak spots aggregated across decks.
  // Rendered in study mode so Aura can anchor on concepts, not just cards.
  if (context.conceptWeaknesses && context.conceptWeaknesses.length > 0 && context.mode === 'study') {
    lines.push('');
    lines.push('CONCEPT WEAKNESSES (aggregated across decks):');
    for (const c of context.conceptWeaknesses.slice(0, 3)) {
      const diff =
        c.avgDifficulty !== undefined
          ? `, difficulty ${c.avgDifficulty.toFixed(1)}/10`
          : '';
      const example = c.topCards[0] ? ` (e.g. "${c.topCards[0].term}")` : '';
      lines.push(
        `- ${c.concept}: ${c.totalLapses} lapses across ${c.weakCardCount} card${c.weakCardCount === 1 ? '' : 's'}${diff}${example}`,
      );
    }
    lines.push('When the student asks about something that maps to a concept above, acknowledge what they already know and focus on that concept\'s gap before going deeper.');
  }

  // Cross-session memory — the ONLY history the model may reference.
  if (context.priorConversations) {
    lines.push('');
    lines.push(`PRIOR CONVERSATION MEMORY (from the student's earlier sessions — the only history you may reference):`);
    lines.push(context.priorConversations);
  }

  if (context.currentCard && context.mode === 'study') {
    lines.push('');
    lines.push(`CURRENT CARD:`);
    lines.push(`- Front: ${context.currentCard.term}`);
    lines.push(`- Back: ${context.currentCard.definition}`);
    const fsrsLike = context.currentCard as CurrentCardFsrs;
    if (fsrsLike.lapses !== undefined || fsrsLike.difficulty !== undefined) {
      const parts: string[] = [];
      if (fsrsLike.lapses !== undefined) parts.push(`lapses=${fsrsLike.lapses}`);
      if (fsrsLike.difficulty !== undefined) parts.push(`difficulty=${fsrsLike.difficulty.toFixed(1)}`);
      if (fsrsLike.stabilityDays !== undefined) parts.push(`stability=${fsrsLike.stabilityDays.toFixed(1)}d`);
      if (fsrsLike.intervalDays !== undefined) parts.push(`interval=${fsrsLike.intervalDays}d`);
      if (parts.length) lines.push(`- FSRS state: ${parts.join(', ')}`);
    }
    lines.push('');
    lines.push(FSRS_AWARE_RULES);
  }

  lines.push('');
  lines.push(`MODE: ${context.mode}`);
  lines.push('');
  lines.push(MODE_INSTRUCTIONS[context.mode]);
  lines.push('');

  // Personality modifier
  const personalityMod = context.personality ? getPersonalityPromptModifier(context.personality) : '';
  if (personalityMod) {
    lines.push(personalityMod);
    lines.push('');
  }

  if (context.mode === 'companion') {
    lines.push('REFUSAL GUARDRAILS: You may reference ONLY the PRIOR CONVERSATION MEMORY block above — never claim to remember anything beyond it. NEVER invent FSRS numbers — only use what\'s listed above. NEVER fake quiz answers or emit save_card blocks.');
  }

  return lines.join('\n');
}

/**
 * migrateChatMode — one-shot mapper from the pre-3.0 mode union
 * (`'explain' | 'quiz' | 'generate' | 'free' | 'freechat'`) onto the
 * current 2-mode union.
 *
 * Every persisted session — local in `ConversationHistory`'s localStorage
 * cache or remote in the Supabase `ai_chat_sessions.mode` column — could
 * have been written under the old union before this refactor landed. The
 * new ChatMode union will silently accept ANY string at runtime but the
 * downstream control flow only branches on `'study' | 'companion'`, so
 * unreconstituted old strings would behave like `companion` (default)
 * and lose their deck-aware behaviour.
 *
 * Use this on every read/write that previously typed `mode: ChatMode` from
 * a string source (PersistedSession.mode, the Supabase row shape, etc.).
 */
export function migrateChatMode(raw: string | null | undefined): ChatMode {
  switch (raw) {
    case 'study':
    case 'companion':
      return raw;
    case 'explain':
    case 'quiz':
    case 'generate':
    case 'free':
    case 'freechat':
      return 'study';
    default:
      // Unknown legacy value or undefined → default to study (academic
      // behaviour is the higher-traffic path; companion is opt-in).
      return 'study';
  }
}
