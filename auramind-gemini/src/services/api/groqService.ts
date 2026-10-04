import { groqChat, GroqUnavailableError } from './groqClient';
import { Quiz } from "../../types";
import { buildOfflineDeck, OFFLINE_SOURCE } from './templateDeckGenerator';
import { puterChat, PuterUnavailableError } from './puterProvider';

// Simple in-memory cache for AI responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Generate cache key
const getCacheKey = (prefix: string, params: any): string => {
    return `${prefix}:${JSON.stringify(params)}`;
};

// Get cached response
const getCachedResponse = (key: string): any | null => {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        // Cache hit — skip API call
        return cached.data;
    }
    return null;
};

// Store response in cache
const setCachedResponse = (key: string, data: any): void => {
    responseCache.set(key, { data, timestamp: Date.now() });
    if (responseCache.size > 100) {
        const oldestKey = Array.from(responseCache.keys())[0];
        responseCache.delete(oldestKey);
    }
};

// Delegate to the shared groqClient (services/api/groqClient.ts) — same
// env model resolution, same local-AI routing, same max_tokens=4000 default
// that Nexus + study-time clients used to drift on. Keeping this thin facade
// preserves the legacy `getDeepSeekClient().chat(messages, model?)` shape
// so all existing callers (generateFlashcards, generateDeckFromTopic,
// generateQuizFromContent, etc.) compile untouched.
// The "no key" validation lives in groqChat() (per-call env reads) so
// vitest's vi.stubEnv can flip VITE_GROQ_API_KEY AFTER import and exercise
// the no-key path. The legacy throw here was module-load and would have
// frozen at the empty env value captured at parse time.
export const getDeepSeekClient = () => {
    return {
        chat: async (messages: any[], model?: string) => {
            const { raw } = await groqChat({ messages, model });
            return raw;
        }
    };
};

export interface GeneratedCard {
    question: string;
    answer: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    explanation?: string;
    /**
     * Provenance tag (e.g. 'offline-template') set by the offline fallback
     * generator so analytics can attribute auto-generated cards separately
     * from AI-generated ones. Optional because AI responses do NOT set it.
     */
    source?: string;
}

export interface FlashcardGenerationOptions {
    cardStyle?: 'definition' | 'conceptual' | 'multiple_choice';
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    includeExplanations?: boolean;
    useThinking?: boolean;
    userContext?: string;
}

export interface StudyBuddyResponse {
    response: string;
    followUpQuestions: string[];
    flashcards?: GeneratedCard[];
}

export interface ResearchPack {
    summary: string;
    keyConcepts: string[];
    importantFacts: string[];
    misconceptions: string[];
    flashcards: GeneratedCard[];
    quiz: Quiz;
}

/**
 * Generates flashcards from provided text content using DeepSeek.
 */
export const generateFlashcards = async (
    content: string,
    options: FlashcardGenerationOptions = {}
): Promise<GeneratedCard[]> => {
    const cacheKey = getCacheKey('flashcards', { content, options });
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;

    const client = getDeepSeekClient();
    const {
        cardStyle = 'conceptual',
        difficulty = 'medium',
        includeExplanations = false,
        userContext = '',
    } = options;

    const diffPrompt = difficulty === 'mixed'
      ? '- Include a balanced mix of easy, medium, and hard difficulty flashcards'
      : `- Target difficulty: ${difficulty}`;

    const prompt = `You are an expert study assistant specializing in creating effective flashcards for learning.
Analyze the following text and create high-quality flashcards (Question and Answer pairs).

## Instructions:
- Focus on key concepts, definitions, relationships, and important facts
- Create questions that test understanding, not just memorization
- Use this flashcard style: ${cardStyle}
${diffPrompt}
${cardStyle === 'multiple_choice'
        ? '- For multiple choice cards, write the question so the answer contains the correct option plus a short explanation'
        : ''}
${includeExplanations
        ? '- Include a brief explanation for why the answer is correct'
        : '- Do not include explanation text'}
${userContext ? `- Student Context: ${userContext}\n- Adapt style, depth, and difficulty according to their mastery metrics` : ''}

## Text to analyze:
"${content}"

## Response Format:
Respond with ONLY a valid JSON array. No conversational text, no markdown code blocks, no explanations outside the JSON.

Each flashcard object must have:
- question: string (clear, specific question)
- answer: string (concise, accurate answer)
- difficulty: "easy" | "medium" | "hard"
- explanation: string (optional, only if requested)

Example:
[
    {
        "question": "What is photosynthesis?",
        "answer": "Photosynthesis is the process by which plants convert sunlight, carbon dioxide, and water into glucose and oxygen.",
        "difficulty": "medium",
        "explanation": "This process occurs in chloroplasts and is essential for life on Earth."
    }
]`;

    try {
        const response = await client.chat([
            { role: "user", content: prompt }
        ]);

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) return [];

        // Parse JSON response - try multiple patterns
        let jsonMatch = responseContent.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            // Try to find JSON in code blocks
            jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonMatch = [jsonMatch[1]];
            }
        }
        
        if (!jsonMatch) return [];
        
        const cards = JSON.parse(jsonMatch[0]) as GeneratedCard[];
        setCachedResponse(cacheKey, cards);
        return cards;
    } catch (error) {
        console.error("Error generating flashcards:", error);
        throw error;
    }
};

/**
 * Generates a full deck (title, description, cards) from a topic.
 *
 * Behaviour:
 *   1. Cache hit → return immediately.
 *   2. AI available → call Groq (or local-AI proxy) via `getDeepSeekClient()`.
 *   3. AI unavailable (typed `GroqUnavailableError` from `groqClient`) →
 *      fall back to the deterministic template generator so the user still
 *      gets a usable deck instead of a hard failure. Offline decks are
 *      tagged with `source: 'offline-template'` per-card so analytics can
 *      attribute them separately.
 *
 * Why the fallback exists:
 *   The Promise on the UI's AI button is a hard UX failure when the Groq
 *   key is rejected upstream (401 invalid_api_key, 429 quota, 5xx, network).
 *   Users shouldn't have to debug their .env to use their own deck-creator.
 */
export const generateDeckFromTopic = async (topic: string): Promise<{ title: string, description: string, cards: GeneratedCard[] }> => {
    const cacheKey = getCacheKey('deck', { topic });
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;

    const client = getDeepSeekClient();

    const prompt = `You are an expert educational content creator. Create a comprehensive study deck about: "${topic}".

## Instructions:
- Create a clear, descriptive title
- Write a brief description (1-2 sentences) of what this deck covers
- Generate 8-12 comprehensive flashcards covering the most important aspects
- Include a mix of easy, medium, and hard difficulty cards
- Focus on key concepts, definitions, relationships, and applications

## Response Format:
Respond with ONLY a valid JSON object. No conversational text, no markdown code blocks.

{
    "title": "Deck Title",
    "description": "Brief description of what this deck covers",
    "cards": [
        {
            "question": "Question text",
            "answer": "Answer text",
            "difficulty": "easy|medium|hard"
        }
    ]
}`;

    try {
        const response = await client.chat([
            { role: "user", content: prompt }
        ]);

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No response from AI");

        // Parse JSON response - try multiple patterns
        let jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonMatch = [jsonMatch[1]];
            }
        }

        if (!jsonMatch) throw new Error("Invalid JSON response");

        const deck = JSON.parse(jsonMatch[0]) as { title: string, description: string, cards: GeneratedCard[] };
        setCachedResponse(cacheKey, deck);
        return deck;
    } catch (error) {
        // Typed fallback path: if Groq (or local-AI routing) returned a
        // GroqUnavailableError, do NOT throw — assemble an offline deck so
        // the user still gets a usable result. Anything else (e.g. our own
        // JSON parse failure) IS worth re-throwing.
        if (error instanceof GroqUnavailableError) {
            // No extra log here — groqClient.ts already emitted the single
            // session-level console.warn banner explaining the upstream
            // failure. Re-logging per call is just noise.
            //
            // Provider chain: Groq → Puter → offline template.
            //   1. Try Puter.js (user-pays free fallback) first.
            //   2. If Puter asks for auth, RE-THROW so the page can show a
            //      "Sign in with Puter" button (auto-popup is browser-blocked).
            //   3. Otherwise, drop through to the deterministic offline template.
            try {
                const puterResult = await puterChat({ prompt });
                const jsonMatch = ((): RegExpMatchArray | null => {
                    let m = puterResult.content.match(/\{[\s\S]*\}/);
                    if (m) return m;
                    m = puterResult.content.match(/```json\s*([\s\S]*?)\s*```/);
                    return m ? [m[1]] : null;
                })();
                if (jsonMatch) {
                    const deck = JSON.parse(jsonMatch[0]) as { title: string; description: string; cards: GeneratedCard[] };
                    // Cache in a separate namespace so AI and Puter cannot collide.
                    setCachedResponse(`deck.puter:${JSON.stringify({ topic })}`, deck);
                    return deck;
                }
                // Got a Puter response but couldn't parse JSON — fall through.
            } catch (putErr) {
                if (putErr instanceof PuterUnavailableError) {
                    if (putErr.isAuthRequired) {
                        // Can't auto-prompt popup; surface to UI and let the
                        // "Sign in with Puter" button handle it.
                        throw putErr;
                    }
                    // Quota exhausted / upstream down / SDK load error — drop
                    // through to offline template gracefully.
                } else {
                    // Unknown error from Puter path — re-raise so we don't
                    // accidentally swallow real bugs.
                    console.error('[BonaMind/groqService] unexpected puterChat error:', putErr);
                    throw putErr;
                }
            }

            const offline = buildOfflineDeck(topic);
            // Use a separate cache-key prefix (`deck.offline:<topic>`) so the
            // offline happy-path result can never collide with the AI or
            // Puter happy-path results.
            setCachedResponse(`deck.offline:${JSON.stringify({ topic })}`, offline);
            return offline;
        }

        console.error("Error generating deck:", error);
        throw error;
    }
};

/**
 * Public helper for analytics / logs: "did the last deck come from the
 * AI or from the offline template?". Walks the card array; returns true
 * if any card carries the `source: 'offline-template'` marker we attach
 * in `buildOfflineDeck`. Cheap short-circuit via `Array.some`.
 */
export function isOfflineDeck(
  deck: { cards: GeneratedCard[] },
): boolean {
  return deck.cards.some(c => c.source === OFFLINE_SOURCE);
}

/**
 * Generates a summary of a topic using DeepSeek.
 */
export const generateSummaryFromTopic = async (topic: string, userContext?: string): Promise<string> => {
    const client = getDeepSeekClient();
    
    const contextStr = userContext ? `\n\nStudent Context:\n${userContext}\nAdapt explanation depth regarding their weak/strong spots if relevant.` : "";

    const prompt = `Research the topic "${topic}" and provide a detailed comprehensive study summary covering key facts, dates, definitions, and concepts. The summary should be dense with information suitable for creating flashcards.${contextStr}`;

    try {
        const response = await client.chat([
            { role: "user", content: prompt }
        ]);

        return response.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Error researching topic:", error);
        throw error;
    }
};

export const generateQuizFromContent = async (
    content: string,
    topic: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed' = 'medium',
    userContext?: string
): Promise<Quiz> => {
    const cacheKey = getCacheKey('quiz', { content, topic, difficulty, userContext });
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;

    const client = getDeepSeekClient();
    
    const contextStr = userContext ? `\n\nStudent Context:\n${userContext}\nAdjust questions based on their demonstrated proficiency/mastery in these topics.` : "";
    const diffLabel = difficulty === 'mixed' ? 'a mix of easy, medium, and hard' : difficulty;

    const prompt = `You are an expert educational assessment creator. Create a comprehensive study quiz about "${topic}" using the provided source content.

## Instructions:
- Create 5-8 multiple choice questions at ${diffLabel} difficulty
- Ensure questions test understanding, not just recall
- Include clear, plausible distractors (wrong answers)
- Provide explanations for why the correct answer is right
${userContext ? '- Adjust question difficulty based on student context' : ''}

## Source Content:
${content}${contextStr}

## Response Format:
Respond with ONLY a valid JSON object. No conversational text, no markdown code blocks.

{
    "id": "unique-quiz-id",
    "title": "Quiz Title",
    "topic": "${topic}",
    "difficulty": "${difficulty === 'mixed' ? ('medium') : difficulty}",
    "questions": [
        {
            "id": "q1",
            "question": "Question text",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": 0,
            "explanation": "Explanation for why this answer is correct"
        }
    ]
}

Note: correctAnswer should be the index (0-3) of the correct option.`;

    try {
        const response = await client.chat([
            { role: "user", content: prompt }
        ]);

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) throw new Error("No quiz response from AI");

        // Parse JSON response - try multiple patterns
        let jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonMatch = [jsonMatch[1]];
            }
        }
        
        if (!jsonMatch) throw new Error("Invalid JSON response");

        const parsed = JSON.parse(jsonMatch[0]) as Quiz;
        const quiz = {
            ...parsed,
            topic: parsed.topic || topic,
            difficulty: (parsed.difficulty || difficulty) as Quiz['difficulty'],
            questions: parsed.questions.map((question, index) => ({
                ...question,
                id: question.id || `q${index + 1}`,
                options: question.options.slice(0, 4),
                correctAnswer: Math.max(0, Math.min(question.correctAnswer, Math.max(0, question.options.length - 1))),
            }))
        };
        setCachedResponse(cacheKey, quiz);
        return quiz;
    } catch (error) {
        console.error("Error generating quiz:", error);
        throw error;
    }
};

export const generateStudyBuddyResponse = async (
    prompt: string,
    sourceText?: string,
    userContext?: string
): Promise<StudyBuddyResponse> => {
    const client = getDeepSeekClient();
    
    const contextStr = userContext ? `\nStudent Context:\n${userContext}\nIf you know their mastery level, tailor your tone and explanations to their skill.` : "";

    const fullPrompt = `You are BonaMind Companion, an elite study tutor that uses the Socratic method.

TEACHING APPROACH:
- Guide the student to answers through questions rather than giving direct answers
- Break complex topics into smaller, digestible steps
- Use analogies and real-world examples
- Ask the student to explain their reasoning
- Provide hints before answers — only give direct answers after they've attempted
- Praise correct reasoning and gently correct misconceptions
- Adapt explanations to the student's skill level

User request: ${prompt}
${sourceText ? `Primary source material:\n${sourceText}` : 'No source material was provided. Use general knowledge.'}${contextStr}

Respond with a JSON object containing:
{
    "response": "Your tutoring answer using Socratic method — ask guiding questions, give hints, use analogies",
    "followUpQuestions": ["Question to deepen understanding", "Question to test comprehension", "Question to connect to broader concepts"],
    "flashcards": [
        {
            "question": "Question text",
            "answer": "Answer text",
            "difficulty": "easy|medium|hard",
            "explanation": "Explanation (optional)"
        }
    ]
}`;

    try {
        const response = await client.chat([
            { role: "user", content: fullPrompt }
        ]);

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No study buddy response from AI");

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Invalid JSON response");

        const parsed = JSON.parse(jsonMatch[0]) as StudyBuddyResponse;
        return {
            response: parsed.response,
            followUpQuestions: parsed.followUpQuestions ?? [],
            flashcards: parsed.flashcards ?? []
        };
    } catch (error) {
        console.error("Error generating study buddy response:", error);
        throw error;
    }
};

export const generateResearchPack = async (
    topic: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed' = 'medium',
    userContext?: string
): Promise<ResearchPack> => {
    const client = getDeepSeekClient();
    
    const contextStr = userContext ? `\nStudent Context:\n${userContext}\nAdapt content depth and vocabulary to fit their known metrics/weaknesses if applicable.` : "";
    const diffDesc = difficulty === 'mixed' ? 'a mix of easy, medium, and hard' : `a ${difficulty}`;

    const prompt = `Research "${topic}" and build a study pack for ${diffDesc} learner.${contextStr}

Generate a comprehensive JSON response with this structure:
{
    "summary": "Comprehensive summary of the topic",
    "keyConcepts": ["Concept 1", "Concept 2", "Concept 3"],
    "importantFacts": ["Fact 1", "Fact 2", "Fact 3"],
    "misconceptions": ["Misconception 1", "Misconception 2"],
    "flashcards": [
        {
            "question": "Question text",
            "answer": "Answer text",
            "difficulty": "easy|medium|hard",
            "explanation": "Explanation (optional)"
        }
    ],
    "quiz": {
        "id": "quiz-id",
        "title": "Quiz Title",
        "topic": "${topic}",
        "difficulty": "${difficulty}",
        "questions": [
            {
                "id": "q1",
                "question": "Question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": 0,
                "explanation": "Explanation"
            }
        ]
    }
}

Include 4-6 flashcards and 4-6 quiz questions.`;

    try {
        const response = await client.chat([
            { role: "user", content: prompt }
        ]);

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No research pack response from AI");

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Invalid JSON response");

        const parsed = JSON.parse(jsonMatch[0]) as ResearchPack;
        return parsed;
    } catch (error) {
        console.error("Error generating research pack:", error);
        throw error;
    }
};

/**
 * transcribeAudio — transcribe a recorded/uploaded audio clip via Groq
 * Whisper. Accepts either a Blob directly or a base64 string (which it
 * converts to a Blob using the supplied mimeType).
 */
export const transcribeAudio = async (
    audio: Blob | string,
    mimeType: string = 'audio/webm',
): Promise<string> => {
    const { groqTranscribe } = await import('./groqClient');
    const blob =
        typeof audio === 'string'
            ? base64ToBlob(audio, mimeType)
            : audio;
    if (!blob || blob.size === 0) return '';
    const extension = mimeExt(mimeType);
    return groqTranscribe(blob, `recording.${extension}`);
};

/** Convert a base64 data string into a Blob (used when the recorder hands
 *  back base64 rather than a raw Blob). */
function base64ToBlob(base64: string, mimeType: string): Blob | null {
    try {
        const binary = atob(base64.replace(/^data:[^;]+;base64,/, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    } catch {
        return null;
    }
}

/** Map a MIME type to a file extension for the Whisper API. */
function mimeExt(mimeType: string): string {
    if (mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('m4a')) return 'm4a';
    return 'webm';
}

/**
 * generateSpeech — text-to-speech.
 *
 * Groq has no TTS endpoint (August 2026), so this prefers the browser's
 * built-in speechSynthesis for instant, offline-capable playback. It
 * returns the browser's utterance (an opaque handle) so callers can
 * cancel it; a null return signals "no TTS available".
 */
export const generateSpeech = async (
    text: string,
    options?: { rate?: number; pitch?: number; voiceURI?: string },
): Promise<SpeechSynthesisUtterance | null> => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const utterance = new SpeechSynthesisUtterance(text);
    const { rate = 1, pitch = 1, voiceURI } = options ?? {};
    utterance.rate = rate;
    utterance.pitch = pitch;
    if (voiceURI) {
        const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceURI);
        if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return utterance;
};




