/**
 * Course-generation prompts, adapted from the website's generateFlashcards
 * and generateDeckFromTopic (auramind-gemini/src/services/api/groqService.ts).
 * Both ask for an exact count and a JSON-only reply with question/answer keys.
 */

const CARD_RULES = `- Focus on key concepts, definitions, relationships, and important facts
- Write questions that test understanding, not just memorisation
- Keep answers concise and accurate (one to three sentences)
- Include a mix of easy, medium, and hard cards`;

export function topicPrompt(topic: string, cards: number, avoid: string[] = []): string {
  const avoidBlock = avoid.length
    ? `\n- Do not repeat any of these existing questions:\n${avoid.map((q) => `  - ${q}`).join('\n')}`
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

export function cardsPrompt(piece: string, cards: number, context: string): string {
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
