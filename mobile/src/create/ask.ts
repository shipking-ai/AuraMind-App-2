import type { AskFn } from '@bonamind/core';
import { authedPost } from './api';

type ChatReply = { choices?: { message?: { content?: string } }[] };

/** One non-streaming call to the AI proxy for course generation. */
export const ask: AskFn = async (prompt, signal) => {
  const reply = await authedPost<ChatReply>(
    '/api/ai/chat',
    { messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 4096 },
    signal,
  );
  return reply.choices?.[0]?.message?.content ?? '';
};
