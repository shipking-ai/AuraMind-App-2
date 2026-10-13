/**
 * chatMemory — cross-session memory for Prof. Linnea.
 *
 * Conversations already persist to localStorage under the same key
 * ConversationHistory uses (`bonamind.aurachat.sessions.v1`, with the active
 * session id under `.active.v1`). This module reads the most recent *other*
 * session and renders a compact, prompt-safe summary so Linnea can reference
 * what the student worked on before — without claiming memory it doesn't have.
 */
import type { Message } from '../hooks/useAIChat';

export const SESSION_STORAGE_KEY = 'bonamind.aurachat.sessions.v1';
export const ACTIVE_STORAGE_KEY = 'bonamind.aurachat.active.v1';

/** Max messages pulled from the previous session. */
const MAX_MESSAGES = 4;
/** Max characters per message excerpt. */
const MAX_EXCERPT = 200;

interface StoredChatSession {
  id: string;
  title?: string;
  deckName?: string;
  mode?: string;
  updatedAt?: number;
  messages?: Message[];
}

function readStoredSessions(): StoredChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredChatSession[]) : [];
  } catch {
    return [];
  }
}

function readActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function excerpt(content: string, max = MAX_EXCERPT): string {
  const single = content.replace(/\s+/g, ' ').trim();
  return single.length > max ? single.slice(0, max) + '…' : single;
}

/**
 * Build the PRIOR CONVERSATION MEMORY block from the most recent session
 * that isn't the currently active one. Returns undefined when there is no
 * usable prior session (first visit, or only the current session exists).
 */
export function buildPriorSessionMemory(): string | undefined {
  const sessions = readStoredSessions();
  if (sessions.length === 0) return undefined;

  const activeId = readActiveId();
  const prior = sessions
    .filter((s) => s.id !== activeId && (s.messages ?? []).some((m) => m.content))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

  if (!prior) return undefined;

  const msgs = (prior.messages ?? [])
    .filter((m) => m.content)
    .slice(-MAX_MESSAGES);

  const header = prior.title ? `Previous session: "${prior.title}"` : 'Previous session';
  const contextBits = [header];
  if (prior.deckName) contextBits.push(`deck: ${prior.deckName}`);
  if (prior.mode) contextBits.push(`mode: ${prior.mode}`);
  const lines = [contextBits.join(' · ')];

  for (const m of msgs) {
    const speaker = m.role === 'assistant' ? 'Linnea' : 'Student';
    lines.push(`${speaker}: ${excerpt(m.rawContent || m.content)}`);
  }

  return lines.join('\n');
}
