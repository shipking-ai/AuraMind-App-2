/**
 * Course-generation prompts, adapted from the website's generateFlashcards
 * and generateDeckFromTopic (the website's services/api/groqService.ts).
 * Both ask for an exact count and a JSON-only reply with question/answer keys.
 */

const CARD_RULES = `- Focus on key concepts, definitions, relationships, and important facts
- Write questions that test understanding, not just memorisation
- Keep answers concise and accurate (one to three sentences)
- Include a mix of easy, medium, and hard cards`;

/**
 * Caps that keep a prompt well inside the proxy's 8,000-character message
 * limit, which truncates silently and would cut off the JSON format rules.
 */
export const MAX_TOPIC_CHARS = 200;
export const MAX_CONTEXT_CHARS = 120;
const MAX_AVOID_CHARS = 3000;
const MAX_AVOID_ITEM_CHARS = 120;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The existing questions to avoid, shortened and capped in total. */
function avoidList(fronts: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const front of fronts) {
    const item = clip(front, MAX_AVOID_ITEM_CHARS);
    if (used + item.length > MAX_AVOID_CHARS) break;
    out.push(item);
    used += item.length + 5;
  }
  return out;
}

export function topicPrompt(rawTopic: string, cards: number, avoid: string[] = []): string {
  const topic = clip(rawTopic.trim(), MAX_TOPIC_CHARS);
  const fronts = avoidList(avoid);
  const avoidBlock = fronts.length
    ? `\n- Do not repeat any of these existing questions:\n${fronts.map((q) => `  - ${q}`).join('\n')}`
    : '';
  return `You are an expert educational content creator. Create a study course about: "${topic}".

## Instructions:
- Write a clear, descriptive title and a one or two sentence description
- Generate exactly ${cards} flashcards covering the most important aspects
${CARD_RULES}${avoidBlock}

## Response format:
Respond with ONLY a valid JSON object. No conversational text, no markdown code blocks.

{"title": "Course title", "description": "What this course covers", "cards": [{"question": "Question text", "answer": "Answer text"}]}`;
}

export function cardsPrompt(piece: string, cards: number, rawContext: string): string {
  const context = clip(rawContext, MAX_CONTEXT_CHARS);
  return `You are an expert study assistant. The text below is part of "${context}". Create exactly ${cards} high-quality flashcards from it.

## Instructions:
${CARD_RULES}
- Use only what the text supports

## Text:
"""
${piece}
"""

## Response format:
Respond with ONLY a valid JSON array. No conversational text, no markdown code blocks.

[{"question": "Question text", "answer": "Answer text"}]`;
}
