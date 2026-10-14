// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { ACTIVE_STORAGE_KEY, SESSION_STORAGE_KEY, buildPriorSessionMemory } from '../lib/chatMemory';

function store(sessions: unknown[], active: string | null = null) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  if (active !== null) {
    window.localStorage.setItem(ACTIVE_STORAGE_KEY, active);
  } else {
    window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
  }
}

function msg(role: 'user' | 'assistant', content: string) {
  return {
    id: role + Math.random(),
    role,
    content,
    rawContent: content,
    hasSaveCard: false,
    timestamp: new Date(),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('buildPriorSessionMemory', () => {
  it('returns undefined when nothing is stored', () => {
    store([]);
    expect(buildPriorSessionMemory()).toBeUndefined();
  });

  it('returns undefined when only the active session exists', () => {
    store([{ id: 'cur', updatedAt: 100, messages: [msg('user', 'hi')] }], 'cur');
    expect(buildPriorSessionMemory()).toBeUndefined();
  });

  it('picks the most recent non-active session and summarizes its messages', () => {
    store(
      [
        { id: 'old', updatedAt: 100, title: 'Biology help', messages: [msg('user', 'old question')] },
        { id: 'newer', updatedAt: 200, title: 'Chemistry', messages: [msg('user', 'what is a mole?'), msg('assistant', 'A mole is 6.022e23 particles.')] },
        { id: 'cur', updatedAt: 300, messages: [msg('user', 'current chat')] },
      ],
      'cur',
    );
    const mem = buildPriorSessionMemory();
    expect(mem).toBeDefined();
    expect(mem).toContain('Chemistry');
    expect(mem).toContain('Student: what is a mole?');
    expect(mem).toContain('Linnea: A mole is 6.022e23 particles.');
    expect(mem).not.toContain('old question');
  });

  it('truncates long messages', () => {
    store([
      { id: 'prev', updatedAt: 1, messages: [msg('user', 'x'.repeat(500))] },
    ]);
    const mem = buildPriorSessionMemory();
    expect(mem).toBeDefined();
    expect(mem!.length).toBeLessThan(350);
    expect(mem).toContain('…');
  });

  it('includes deck and mode context when present', () => {
    store([
      { id: 'prev', updatedAt: 1, title: 'Cell Bio', deckName: 'Cell Biology', mode: 'study', messages: [msg('user', 'explain mitosis')] },
    ]);
    const mem = buildPriorSessionMemory();
    expect(mem).toContain('deck: Cell Biology');
    expect(mem).toContain('mode: study');
  });
});
