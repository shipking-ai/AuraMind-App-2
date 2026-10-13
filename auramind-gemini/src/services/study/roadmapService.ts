import { Card, CardCitation, CardSourceType, FlashcardData } from '../../types';

const CARD_META_KEY = 'bonamind-card-meta-v1';
const BETA_CHALLENGE_KEY = 'bonamind-beta-challenge-v1';

export interface CardMetadataTemplate {
  citations?: CardCitation[];
  sourceLabel?: string;
  sourceType?: CardSourceType;
  trustScore?: number;
}

export interface ParsedImportDeck {
  title: string;
  description: string;
  cards: FlashcardData[];
  detectedFormat: 'quizlet' | 'anki' | 'qa' | 'paragraphs';
}

export interface BetaChallengeState {
  joinedAt: number;
  targetDays: number;
}

const safeRead = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const truncate = (value: string, limit = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
};

export const createCitation = (
  label: string,
  sourceType: CardSourceType,
  excerpt: string,
  locator?: string
): CardCitation => ({
  id: `${label}-${locator || 'source'}-${excerpt.slice(0, 24)}`.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase(),
  label,
  excerpt: truncate(excerpt),
  locator,
  sourceType,
});

export const createMetadataTemplates = (
  cards: Array<Pick<FlashcardData, 'question' | 'answer' | 'citations' | 'sourceLabel' | 'sourceType'> | { front?: string; back?: string; citations?: any; sourceLabel?: string; sourceType?: CardSourceType }>,
  sourceLabel: string,
  sourceType: CardSourceType
): CardMetadataTemplate[] =>
  cards.map((card, index) => {
    const question = (card as any).front || (card as any).question;
    const answer = (card as any).back || (card as any).answer;
    const citations = card.citations?.length
      ? card.citations
      : [createCitation(card.sourceLabel || sourceLabel, card.sourceType || sourceType, `${question} ${answer}`, `Card ${index + 1}`)];

    return {
      citations,
      sourceLabel: card.sourceLabel || sourceLabel,
      sourceType: card.sourceType || sourceType,
      trustScore: Math.max(72, Math.min(98, 72 + citations.length * 10)),
    };
  });

export const mergeCardMetadata = (cards: Card[], templates: CardMetadataTemplate[]): Card[] =>
  cards.map((card, index) => ({
    ...card,
    ...templates[index],
  }));

export const persistCardMetadata = (cards: Array<Pick<Card, 'id' | 'citations' | 'sourceLabel' | 'sourceType' | 'trustScore'>>) => {
  const existing = safeRead<Record<string, CardMetadataTemplate>>(CARD_META_KEY, {});
  const next = { ...existing };

  cards.forEach((card) => {
    next[card.id] = {
      citations: card.citations,
      sourceLabel: card.sourceLabel,
      sourceType: card.sourceType,
      trustScore: card.trustScore,
    };
  });

  safeWrite(CARD_META_KEY, next);
};

export const enrichCardsWithStoredMetadata = (cards: Card[]): Card[] => {
  const stored = safeRead<Record<string, CardMetadataTemplate>>(CARD_META_KEY, {});
  return cards.map((card) => ({
    ...card,
    ...(stored[card.id] || {}),
  }));
};

export const makeImportedCard = (
  question: string,
  answer: string,
  sourceLabel: string,
  sourceType: CardSourceType,
  locator: string
): FlashcardData => ({
  question: question.trim(),
  answer: answer.trim(),
  sourceLabel,
  sourceType,
  citations: [createCitation(sourceLabel, sourceType, `${question.trim()} ${answer.trim()}`, locator)],
});

export const parseImportText = (input: string, fallbackTitle = 'Imported deck'): ParsedImportDeck => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Paste Quizlet, Anki, or Q/A content before importing.');
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.every((line) => line.includes('\t'))) {
    const cards = lines
      .map((line, index) => {
        const [question, ...rest] = line.split('\t');
        return makeImportedCard(question || '', rest.join(' ').trim(), 'Quizlet import', 'import', `Row ${index + 1}`);
      })
      .filter((card) => card.question && card.answer);

    return {
      title: fallbackTitle,
      description: 'Imported from a Quizlet-style tab separated export.',
      cards,
      detectedFormat: 'quizlet',
    };
  }

  const ankiCards = lines
    .map((line, index) => {
      const separator = line.includes('::') ? '::' : line.includes('|') ? '|' : '';
      if (!separator) return null;
      const [question, ...rest] = line.split(separator);
      const answer = rest.join(separator).trim();
      if (!question?.trim() || !answer) return null;
      return makeImportedCard(question, answer, 'Anki-style import', 'import', `Card ${index + 1}`);
    })
    .filter((card): card is FlashcardData => Boolean(card));

  if (ankiCards.length >= 3) {
    return {
      title: fallbackTitle,
      description: 'Imported from a one-line Anki style front/back export.',
      cards: ankiCards,
      detectedFormat: 'anki',
    };
  }

  const qaBlocks = trimmed
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const linesInBlock = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const questionLine = linesInBlock.find((line) => /^q[:-]/i.test(line));
      const answerLine = linesInBlock.find((line) => /^a[:-]/i.test(line));

      if (questionLine && answerLine) {
        return makeImportedCard(
          questionLine.replace(/^q[:-]\s*/i, ''),
          answerLine.replace(/^a[:-]\s*/i, ''),
          'Q/A import',
          'import',
          `Block ${index + 1}`
        );
      }

      if (linesInBlock.length >= 2) {
        return makeImportedCard(linesInBlock[0], linesInBlock.slice(1).join(' '), 'Pasted study notes', 'notes', `Block ${index + 1}`);
      }

      return null;
    })
    .filter((card): card is FlashcardData => Boolean(card));

  if (qaBlocks.length) {
    return {
      title: fallbackTitle,
      description: 'Imported from pasted question and answer blocks.',
      cards: qaBlocks,
      detectedFormat: qaBlocks.some((card) => card.sourceLabel === 'Q/A import') ? 'qa' : 'paragraphs',
    };
  }

  throw new Error('Could not detect a supported import format. Use tab-separated lines, `front::back`, or Q:/A: blocks.');
};

const stripMarkdown = (value: string) =>
  value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseMarkdownSections = (
  markdown: string,
  fallbackTitle: string,
  sourceLabel: string,
  sourceType: CardSourceType = 'notes'
): ParsedImportDeck => {
  const cleaned = markdown.trim();
  if (!cleaned) {
    throw new Error('Paste Markdown content before importing.');
  }

  const headingMatches = Array.from(cleaned.matchAll(/^(#{1,3})\s+(.+)$/gm));
  if (!headingMatches.length) {
    return parseImportText(cleaned, fallbackTitle);
  }

  const cards: FlashcardData[] = headingMatches
    .map((match, index) => {
      const title = stripMarkdown(match[2] || '');
      const start = (match.index || 0) + match[0].length;
      const end = headingMatches[index + 1]?.index ?? cleaned.length;
      const section = cleaned.slice(start, end).trim();
      const body = stripMarkdown(section);
      if (!title || body.length < 20) return null;
      return makeImportedCard(
        `What should I remember about ${title}?`,
        body,
        sourceLabel,
        sourceType,
        title
      );
    })
    .filter((card): card is FlashcardData => Boolean(card));

  if (!cards.length) {
    return parseImportText(cleaned, fallbackTitle);
  }

  return {
    title: fallbackTitle,
    description: `Imported from ${sourceLabel} Markdown sections.`,
    cards,
    detectedFormat: 'paragraphs',
  };
};

export const parseNotionImportText = (input: string, fallbackTitle = 'Notion import'): ParsedImportDeck => {
  const normalized = input
    .replace(/\[\[toc\]\]/gi, '')
    .replace(/^\s*-\s\[( |x)\]\s+/gim, '- ')
    .trim();
  return parseMarkdownSections(normalized, fallbackTitle, 'Notion import', 'notes');
};

export const parseObsidianMarkdownImport = (input: string, fallbackTitle = 'Obsidian import'): ParsedImportDeck => {
  const normalized = input
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/%%[\s\S]*?%%/g, '')
    .trim();
  return parseMarkdownSections(normalized, fallbackTitle, 'Obsidian import', 'notes');
};


export const getBetaChallenge = (userId: string): BetaChallengeState | null => {
  const state = safeRead<Record<string, BetaChallengeState>>(BETA_CHALLENGE_KEY, {});
  return state[userId] || null;
};

export const enrollInBetaChallenge = (userId: string, targetDays = 7): BetaChallengeState => {
  const state = safeRead<Record<string, BetaChallengeState>>(BETA_CHALLENGE_KEY, {});
  const next = {
    joinedAt: Date.now(),
    targetDays,
  };

  safeWrite(BETA_CHALLENGE_KEY, {
    ...state,
    [userId]: next,
  });

  return next;
};

export const getChallengeProgress = (challenge: BetaChallengeState | null, streak: number) => {
  if (!challenge) {
    return {
      active: false,
      targetDays: 7,
      completedDays: 0,
      remainingDays: 7,
    };
  }

  const completedDays = Math.min(challenge.targetDays, streak || 0);
  return {
    active: true,
    targetDays: challenge.targetDays,
    completedDays,
    remainingDays: Math.max(0, challenge.targetDays - completedDays),
  };
};



