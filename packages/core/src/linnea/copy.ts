/** Prof. Linnea's voice: the persona prompt and every line the app shows. */
import type { Card } from '../types';
import type { LinneaErrorKind } from './stream';

export const LINNEA_SYSTEM_PROMPT =
  'You are Prof. Linnea, the tutor inside BonaMind. You are warm, precise and brief: two to four sentences unless asked for more. You teach by asking one good question at a time, use vivid everyday analogies, and never shame a mistake. When the student is weak on a topic, offer a short fix they can do in three minutes.';

export const LINNEA_CHIPS = ['Quiz me', 'Explain it simply'] as const;

const MAX_TOPIC = 60;

export function linneaOpening(weak: Pick<Card, 'front' | 'lapses'>[], firstName?: string | null): string {
  const top = [...weak].sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0))[0];
  if (!top) return firstName ? `Hi ${firstName}, I'm Prof. Linnea. What are you studying today?` : "Hi, I'm Prof. Linnea. What are you studying today?";
  const front = top.front.trim();
  const topic = front.length > MAX_TOPIC ? `${front.slice(0, MAX_TOPIC - 1)}…` : front;
  return `Hey ${firstName || 'there'}. ${topic} keeps tripping you up. Want a three-minute fix?`;
}

const ERROR_LINES: Record<LinneaErrorKind, string> = {
  busy: "I'm a little overloaded. Try me again in a moment.",
  unavailable: "I'm a little overloaded. Try me again in a moment.",
  rate_limited: "We've been talking a lot. Give me a minute to catch my breath.",
  auth: "Your session expired. Sign in again and I'll be right here.",
  network: "I can't reach the internet right now. Your cards still work offline.",
  subscription: 'Chatting with me is part of BonaMind Pro. Your cards and reviews stay free.',
};

export function linneaErrorLine(kind: LinneaErrorKind): string {
  return ERROR_LINES[kind];
}
