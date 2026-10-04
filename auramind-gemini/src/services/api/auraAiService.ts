// Aura AI Service
// AI provider service with Groq and local inference

import { logger } from '../../lib/logger';
import { localInference } from './localInferenceService';
import { GroqUnavailableError } from './groqClient';
import { requireSupabase } from '../database/supabase';
import { usesLocalAI } from '../../lib/aiProvider';
import { readClientEnv } from '../../lib/env';
// Re-export so callers that imported the typed error from this barrel
// (the legacy location) keep working without an import-path rewrite.
export { GroqUnavailableError } from './groqClient';

// All AI calls in this module route through groqChat() / groqChatStream()
// which already throw GroqUnavailableError on 401 / 403 / 429 / 5xx.
// The legacy `chatCompletion` method below is kept for the AskAuraToolbar
// + audioOverview paths that pre-date the GroqClient refactor; it now
// uses GroqUnavailableError too so the fallback chain can branch on the
// typed error rather than substring-matching `error.message`.

// Simple in-memory cache for AI responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Generate cache key from request parameters
const getCacheKey = (model: string, messages: Message[], temperature: number): string => {
  return `${model}:${temperature}:${JSON.stringify(messages)}`;
};

// Get cached response if available and not expired
const getCachedResponse = (key: string): any | null => {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.debug('Using cached AI response');
    return cached.data;
  }
  return null;
};

// Store response in cache
const setCachedResponse = (key: string, data: any): void => {
  responseCache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (responseCache.size > 100) {
    const oldestKey = Array.from(responseCache.keys())[0];
    responseCache.delete(oldestKey);
  }
};

// Study Agent System Prompt
export const STUDY_AGENT_SYSTEM_PROMPT = `You are Aura, the AI study companion of **BonaMind** — a full-stack learning platform. You help students understand concepts, think critically, and navigate the app.

## About BonaMind
BonaMind is a complete study application with these features and pages:

- **Dashboard** (/dashboard) — Study stats, XP, streaks, recent activity, retention charts, and quick-access to decks and quizzes.
- **Generator** (/dashboard/generator) — The dedicated tool for creating flashcards, quizzes, and study decks from topics, URLs, YouTube videos, or uploaded documents. Has inline editing, difficulty selection (easy/medium/hard/mixed), and one-click save.
- **Cards** (/dashboard/cards) — Browse, search, filter, and manage all flashcard decks. Study mode with spaced repetition scheduling.
- **Chat** (/dashboard/chat) — The AI chat you are in right now. Study help, concept explanation, and Q&A via the Socratic method. Also supports source-grounded answers from uploaded documents.
- **Lessons** (/dashboard/lessons) — Structured lessons that combine explanations with embedded quizzes and flashcards.
- **Settings** (/dashboard/settings) — User profile, preferences, theme, and account management.
- **Landing page** (/) — Public homepage about BonaMind's features and signup.

Users can upload documents (PDF, DOCX, TXT, images) to ground study content. XP, levels, streaks, and leaderboards track progress.

## Teaching Philosophy: Socratic Method First
When a student asks for help understanding a concept, DO NOT simply give them the answer. Instead:
1. Ask guiding questions that lead them to discover the answer themselves
2. Break complex topics into smaller, manageable steps
3. Use analogies and real-world examples relevant to their level
4. Encourage them to explain their reasoning
5. Provide hints before answers — only give direct answers after they've attempted
6. Praise correct reasoning and gently correct misconceptions

Research shows self-explanation improves learning by 2-3x compared to just reading answers.

## Your Capabilities — What You Can Do
When a user requests one of these actions, output ONLY the JSON structure for that tool. No conversational filler, markdown explanations, or backticks around JSON unless asked for code examples.

### 1. explain_concept (For deep dives / Socratic teaching)
{
  "tool": "explain_concept",
  "data": {
    "concept": "Concept",
    "explanation": "Markdown detailed text",
    "examples": ["Ex 1", "Ex 2"],
    "keyPoints": ["Point 1", "Point 2"]
  }
}

### 2. app_action (Navigate the app — ALWAYS require user confirmation first)
Use only for navigating between sections. Output ONLY JSON. Never execute silently. The UI will show a Run button.
{
  "tool": "app_action",
  "data": {
    "action": "go_to_section",
    "args": { "section": "generator|cards|chat|lessons|dashboard|settings" }
  }
}

## What You CANNOT Do — Redirect to Generator
You do NOT have the ability to create flashcards, quizzes, decks, or study content. If a user asks you to:
- "Make me flashcards about..."
- "Create a quiz on..."
- "Build a deck for..."
- "Generate study cards about..."

You MUST politely tell them to use the **Generator page** at /dashboard/generator, which has dedicated AI-powered tools for creating flashcards, quizzes, and full decks with inline editing, difficulty choices, and one-click save. Explain that your role in this chat is teaching and explanation, not content generation.

## Core Rules
1. If a tool is requested (explanation, navigation), output ONLY the raw JSON structure. No conversational text, preamble ("Sure", "I have generated"), or postscript.
2. If the user asks a general question NOT covered by tools, provide a friendly, academic text response.
3. Always respond as Aura, the BonaMind AI. Be accurate, concise, and academic.
4. Never mention "DeepSeek", "Groq", "Model", "OpenAI", or internal technical details in the output.
5. Ensure all JSON output is valid and properly formatted.
6. Never propose destructive actions (delete data, change billing, etc.).
7. When a student is struggling, break the problem into smaller steps and ask them to attempt each step before moving on.
8. When a student answers correctly, ask them to explain their reasoning to deepen understanding.
9. Adapt your explanations to the student's level — use simpler language for beginners, more technical depth for advanced learners.
10. If asked about your own identity, you are Aura, built for BonaMind. Do not mention any underlying model or provider.`;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCompletionOptions {
  model?: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Create and export a singleton instance

// Read env lazily at construction time, not at module scope, so that
// vi.stubEnv / test-time overrides take effect before the singleton
// reads them.
const localBaseUrl = '/local-ai/v1';
// Absolute when VITE_API_BASE_URL is set, same-origin when it is not.
//
// On the web the app is served from the same origin as /api, so an empty
// base is correct. Inside the Capacitor webview the origin is
// https://localhost, so a bare '/api/ai' resolves to the device itself and
// every AI request fails — the app looks fine and simply never answers.
// .env.mobile sets VITE_API_BASE_URL for exactly this reason.
const PROXY_BASE_URL = `${readClientEnv('VITE_API_BASE_URL') ?? ''}/api/ai`;

export class AuraAiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly apiKeySource: string;
  private readonly useLocalAI: boolean;

  constructor(apiKey?: string, baseUrl?: string, model?: string) {
    // The client holds no Groq key — VITE_GROQ_API_KEY is not in CLIENT_ENV
    // (see lib/env.ts), because Vite publishes VITE_ vars to the browser.
    // Callers route through the /api/ai proxy, which holds GROQ_API_KEY
    // server-side. An explicit apiKey argument is still honoured, which is
    // how tests and any future BYOK flow supply one.
    const groqKey = apiKey || '';
    this.useLocalAI = usesLocalAI();

    if (this.useLocalAI) {
      this.apiKey = 'not-needed';
      this.baseUrl = localBaseUrl;
      this.defaultModel = model || 'local-model';
      this.apiKeySource = 'local';
    } else {
      this.apiKey = groqKey;
      // Direct Groq base — used only as a no-session dev/test fallback.
      // Signed-in callers route through the server proxy (/api/ai) so the
      // key never ships in the client bundle.
      this.baseUrl = baseUrl || 'https://api.groq.com/openai/v1';
      this.defaultModel = model || 'openai/gpt-oss-120b';
      this.apiKeySource = 'groq';
    }
  }

  private checkApiKey() {
    if (!this.apiKey && !this.baseUrl.includes('local-ai')) {
      throw new Error(
        'No AI key on this client. Sign in so requests are proxied through ' +
        '/api/ai (server-side GROQ_API_KEY), or set VITE_USE_LOCAL_AI=true.',
      );
    }
    
    if (this.apiKey && (this.apiKey.includes('your_') || this.apiKey.includes('placeholder'))) {
      throw new Error(
        'Invalid AI key: a placeholder value was supplied to AuraAiService.',
      );
    }
  }

  /** Supabase session token, or null when there's no signed-in session (or the
   *  Supabase client isn't configured — e.g. in isolated unit tests). */
  private async getAuthToken(): Promise<string | null> {
    try {
      const { data } = await requireSupabase().auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async chatCompletion(options: ChatCompletionOptions & Record<string, any>, useCache: boolean = true): Promise<ChatCompletionResponse> {
    const {
      model = this.defaultModel,
      messages,
      temperature = 0.7,
      max_tokens = 2000,
      ...extraOptions
    } = options;

    // If on-device AI is enabled, use WebLLM in-browser inference
    if (this.useLocalAI) {
      return localInference.chatCompletion({ messages, temperature, max_tokens, ...extraOptions });
    }

    // Offline → don't waste 3 retries on a doomed fetch. Either the user
    // opted into on-device AI (handled above) or we surface a clear next
    // step instead of a cryptic network failure.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new GroqUnavailableError(
        "You're offline. Turn on the on-device AI engine (Settings → AI engine → On-device) to keep studying without a connection.",
        { status: 0, groqMessage: 'offline', isAuthFailure: false, isQuotaExhausted: false },
      );
    }

    // Signed-in → route through the server proxy so the Groq key never ships
    // in the client bundle. No session (dev/tests) → direct Groq fallback.
    const token = await this.getAuthToken();
    const proxyMode = !!token;
    const endpoint = proxyMode ? `${PROXY_BASE_URL}/chat` : `${this.baseUrl}/chat/completions`;
    const authValue = proxyMode ? (token as string) : this.apiKey || 'not-needed';

    if (!proxyMode) {
      this.checkApiKey();
    }

    // Check cache first
    const cacheKey = getCacheKey(model, messages, temperature);
    if (useCache) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }

    logger.debug('API Debug Info:', {
      baseUrl: this.baseUrl,
      model: this.defaultModel,
      apiKeySource: this.apiKeySource,
      hasApiKey: !!this.apiKey,
      messagesCount: messages.length,
    });

    // Retry logic for transient failures
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authValue}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : 'https://bonamind.app',
            'X-Title': typeof document !== 'undefined' ? (document.title || 'BonaMind') : 'BonaMind App',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens,
            ...extraOptions,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to fetch from AI API';
          
          logger.error('API Error Details:', {
            status: response.status,
            statusText: response.statusText,
            errorText,
            baseUrl: this.baseUrl,
            apiKeySource: this.apiKeySource,
          });
          
          try {
            const jsonError = JSON.parse(errorText);
            errorMessage = jsonError.error?.message || jsonError.message || errorMessage;
            logger.error('Parsed API error:', jsonError);
          } catch (_e) {
            errorMessage = `API Error (${response.status}): ${errorText || response.statusText}`;
            logger.error('Raw error message:', errorMessage);
          }

          if (this.baseUrl.includes('local-ai')) {
            errorMessage = `Local AI Connection Failed: Please ensure your local model server (e.g. LM Studio) is running on ${this.baseUrl.replace('/local-ai', 'localhost')}. Detail: ${errorMessage}`;
          }

          // On 429 (rate limit), fall back to local inference
          if (response.status === 429) {
            logger.info('Rate limited by cloud API, falling back to local inference...');
            try {
              const localResult = await localInference.chatCompletion({ messages, temperature, max_tokens });
              if (useCache) {
                setCachedResponse(cacheKey, localResult);
              }
              return localResult;
            } catch (localErr) {
              logger.error('Local inference also failed:', localErr);
              throw new Error('Rate limited and local inference unavailable. Please wait or enable a local model.', { cause: localErr });
            }
          }

          // Don't retry on other client errors (4xx). 401/403 = auth, surface as
          // GroqUnavailableError with isAuthFailure=true so the typed chain
          // (Groq → Puter → offline template) can short-circuit instead of
          // retrying a permanently-broken key. These are HTTP-error wrappers
          // (no caught exception in scope), so there's no `.cause` to chain —
          // the original Groq message is preserved in `.groqMessage`.
          if (response.status === 401 || response.status === 403) {
            throw new GroqUnavailableError(
              `Groq rejected the API key (HTTP ${response.status}): ${errorMessage}`,
              { status: response.status, groqMessage: errorMessage, isAuthFailure: true },
            );
          }
          if (response.status >= 400 && response.status < 500) {
            throw new GroqUnavailableError(
              `Groq client error (HTTP ${response.status}): ${errorMessage}`,
              { status: response.status, groqMessage: errorMessage },
            );
          }

          // Retry on server errors (5xx) or network issues
          lastError = new Error(errorMessage);
          if (attempt < maxRetries - 1) {
            logger.debug(`Retrying... (${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
            continue;
          }
          throw new GroqUnavailableError(
            `Groq API error (HTTP ${response.status}): ${errorMessage}`,
            { status: response.status, groqMessage: errorMessage },
          );
        }

        const data = await response.json();
        
        // Cache successful response
        if (useCache) {
          setCachedResponse(cacheKey, data);
        }
        
        return data;
      } catch (error) {
        logger.error(`Error in AI API call (attempt ${attempt + 1}/${maxRetries}):`, error);
        lastError = error as Error;
        // Promote typed Groq errors so the fallback chain doesn't retry
        // a permanently-broken auth/quota condition. Mirror the
        // GroqClient.retryable-check inline so legacy callers don't need
        // to reimplement the heuristic.
        if (error instanceof GroqUnavailableError) {
          if (error.isAuthFailure || error.isQuotaExhausted) {
            throw error;
          }
        }

        if (attempt < maxRetries - 1) {
          logger.debug(`Retrying... (${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new GroqUnavailableError('Failed to complete AI API call (unknown)');
  }

  // Fallback method for when API keys are invalid
  private getFallbackResponse(userMessage: string): ChatCompletionResponse {
    const lastUserMessage = userMessage.toLowerCase();
    let responseContent = "I'm Aura, your AI study companion! I'm currently in demo mode because the API keys need to be configured. Here's what I can help you with:\n\n";
    
    if (lastUserMessage.includes('quiz') || lastUserMessage.includes('test')) {
      responseContent += JSON.stringify({
        tool: "generate_quiz",
        data: {
          title: "Demo Quiz",
          topic: "General Knowledge",
          difficulty: "easy",
          questions: [
            {
              id: "1",
              question: "What is the capital of France?",
              options: ["London", "Paris", "Berlin", "Madrid"],
              correctAnswer: 1,
              explanation: "Paris is the capital and largest city of France."
            }
          ]
        }
      }, null, 2);
    } else if (lastUserMessage.includes('flashcard') || lastUserMessage.includes('card')) {
      responseContent += JSON.stringify({
        tool: "generate_flashcards",
        data: {
          cards: [
            { question: "What is React?", answer: "A JavaScript library for building user interfaces", topic: "Programming", difficulty: "Easy" }
          ]
        }
      }, null, 2);
    } else if (lastUserMessage.includes('explain') || lastUserMessage.includes('concept')) {
      responseContent += JSON.stringify({
        tool: "explain_concept",
        data: {
          concept: "Demo Concept",
          explanation: "This is a demonstration of the explain_concept tool. In production, this would provide detailed explanations of academic concepts.",
          examples: ["Example 1", "Example 2"],
          keyPoints: ["Key point 1", "Key point 2"]
        }
      }, null, 2);
    } else {
      responseContent += "To get real AI responses, please configure a valid API key in your .env file:\n";
      responseContent += "- Get a free Groq API key from https://groq.com/\n";
      responseContent += "- Or enable local AI with VITE_USE_LOCAL_AI=true\n\n";
      responseContent += "Try asking me to create a quiz, flashcards, or explain a concept to see the demo features!";
    }

    return {
      id: 'demo-response-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.defaultModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300
      }
    };
  }

  // Helper method for simple user messages
  async ask(question: string, systemPrompt?: string): Promise<string> {
    const messages: Message[] = [];

    // Always use Study Agent system prompt unless overridden
    const finalSystemPrompt = systemPrompt || STUDY_AGENT_SYSTEM_PROMPT;
    messages.push({ role: 'system', content: finalSystemPrompt });

    messages.push({ role: 'user', content: question });

    try {
      const response = await this.chatCompletion({
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      return response.choices[0]?.message?.content || 'No response from model';
    } catch (error) {
      logger.warn('API call failed, using fallback response:', error);
      const fallbackResponse = this.getFallbackResponse(question);
      return fallbackResponse.choices[0]?.message?.content || 'No response available';
    }
  }

  // Method specifically for Study Agent interactions
  async studyAgentAsk(question: string): Promise<string> {
    // Use the comprehensive global prompt which includes tool definitions
    return this.ask(question, STUDY_AGENT_SYSTEM_PROMPT);
  }

  // Method for streaming responses (if needed for real-time chat)
  async *streamChatCompletion(options: ChatCompletionOptions & { signal?: AbortSignal }): AsyncGenerator<string> {
    const {
      model = this.defaultModel,
      messages,
      temperature = 0.7,
      max_tokens = 2000,
      signal,
    } = options;

    const token = await this.getAuthToken();
    const proxyMode = !this.useLocalAI && !!token;
    const endpoint = this.useLocalAI
      ? `${this.baseUrl}/chat/completions`
      : proxyMode
        ? `${PROXY_BASE_URL}/chat/stream`
        : `${this.baseUrl}/chat/completions`;
    const authValue = this.useLocalAI
      ? 'not-needed'
      : proxyMode
        ? (token as string)
        : this.apiKey || 'not-needed';

    if (!this.useLocalAI && !proxyMode) {
      this.checkApiKey();
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authValue}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : 'https://bonamind.app',
          'X-Title': typeof window !== 'undefined' ? (document.title || 'BonaMind') : 'BonaMind App',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to fetch from AI API';
        try {
          const jsonError = JSON.parse(errorText);
          errorMessage = jsonError.error?.message || jsonError.message || errorMessage;
        } catch (_e) {
          errorMessage = `API Error (${response.status}): ${errorText || response.statusText}`;
        }

        if (this.baseUrl.includes('local-ai')) {
          errorMessage = `Local AI Connection Failed: Please ensure your local model server (e.g. LM Studio) is running. Detail: ${errorMessage}`;
        }

        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) yield content;
            } catch (_e) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in streaming AI API call:', error);
      throw error;
    }
  }
}

export const auraAiClient = new AuraAiClient();

// Export types for use in other components
export type { Message, ChatCompletionOptions, ChatCompletionResponse };



