/**
 * Domain types shared by the website and the native app. Moved verbatim
 * from the website's src/types/index.ts, which now re-exports them.
 */
export type CardSourceType = 'sample' | 'import' | 'ai' | 'lecture' | 'notes' | 'research' | 'manual' | 'notion' | 'anki' | 'obsidian' | 'quizlet' | 'schoology';

export interface CardCitation {
  id: string;
  label: string;
  excerpt?: string;
  locator?: string;
  sourceType: CardSourceType;
}

export interface FSRSState {
  stability: number;     // Memory stability in days
  difficulty: number;    // Card difficulty (0-10 scale)
  elapsedDays: number;   // Days since last review
  scheduledDays: number; // Days until next review
  repetitions: number;   // Number of reviews
  lapses: number;        // Number of times forgotten
  lastReview: number;    // Timestamp of last review
}

export interface Card {
  id: string;
  front: string;
  back: string;
  question?: string; // Alias for front — used by some components
  answer?: string;   // Alias for back — used by some components
  deckId: string;
  image?: string; // Optional image URL
  citations?: CardCitation[];
  sourceLabel?: string;
  sourceType?: CardSourceType;
  trustScore?: number;
  verified?: boolean; // AI fact-check verification status
  // Spaced Repetition System (SRS) data - optional since not all in database schema
  nextReview?: number; // Timestamp
  interval?: number; // Days
  easeFactor?: number;
  repetition?: number;
  understandingLevel?: number;
  lastReviewed?: number; // Timestamp of last review
  // FSRS state (optional, for cards migrated to FSRS)
  fsrsState?: FSRSState;
  // Per-card lapse counter, surfaced by migrations/20260718_*. Cards that
  // never lapsed never have it set. Surfaced to the UI for "weak card" badges.
  lapses?: number;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  cardCount: number;
  isSample?: boolean;
  is_public?: boolean;
  sourceLabel?: string;
}

export interface StudySession {
  id: string;
  userId: string;
  deckId?: string;
  startTime: number;
  endTime?: number;
  cardsStudied?: number;
  correctAnswers?: number;
  totalAnswers?: number;
  accuracy?: number;
  duration?: number;
}


// Spaced Repetition Quality ratings
export enum Rating {
  AGAIN = 0, // Forgot completely
  HARD = 3,  // Remembered with difficulty
  GOOD = 4,  // Remembered with hesitation
  EASY = 5,  // Remembered easily
}

export interface SRSResult {
  interval: number;
  repetition: number;
  easeFactor: number;
  fsrsState?: FSRSState;
}
