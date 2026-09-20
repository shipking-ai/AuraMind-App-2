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

export enum ViewState {
  LANDING = 'LANDING',
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  DECK_DETAIL = 'DECK_DETAIL',
  STUDY_MODE = 'STUDY_MODE',
  GENERATE_CARDS = 'GENERATE_CARDS',
  AURA_CHAT = 'AURA_CHAT',
  VAULT = 'VAULT',
  DEEPSEEK_CHAT = 'DEEPSEEK_CHAT',
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

export type Theme = 'light' | 'dark' | 'system'

export interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  cycleTheme: () => void
}

// Study Agent Types
export interface QuizQuestion {
  id: string;
  header?: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  title: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: QuizQuestion[];
}

export interface FlashcardData {
  header?: string;
  question: string;
  answer: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  citations?: CardCitation[];
  sourceLabel?: string;
  sourceType?: CardSourceType;
}

export interface Slide {
  title: string;
  bullets: string[];
  script: string;
}

export interface Presentation {
  title: string;
  slides: Slide[];
}

export interface StudyToolAction {
  tool: 'generate_quiz' | 'explain_concept' | 'generate_flashcards' | 'create_cards' | 'schedule_review' | 'track_progress' | 'generate_presentation';
  data: any;
}

export interface SourceDocument {
  id: string;
  name: string;
  type: 'pdf' | 'pptx' | 'text' | 'doc' | 'markdown';
  content: string;
  excerpt: string;
  contentHash: string;
  wordCount: number;
  addedAt: number;
  processingStatus: 'complete' | 'processing' | 'error';
  error?: string;
}

export interface SourceGroundedCard extends FlashcardData {
  sourceExcerpt?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
}

export interface SourceGroundedQuestion extends QuizQuestion {
  sourceExcerpt?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolAction?: StudyToolAction;
  timestamp: number;
  sourceIds?: string[];
}

export enum UserRole {
  OWNER = 'owner',
  CEO = 'ceo',
  ADMIN = 'admin',
  EMPLOYEE = 'employee',
  TESTER = 'tester',
  USER = 'user'
}

/**
 * Onboarding personas (learner, student, teacher, …). Display-only: they
 * personalize copy and starter topics but never drive authorization —
 * see `ONBOARDING_ROLES` in lib/onboardingRoles.ts.
 */
export type OnboardingPersona = string;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  plan: 'Starter' | 'Pro';
  streak: number;
  streakFreezes: number;
  joinedDate: number;
  isAdmin?: boolean;
  role?: UserRole;
  /** Onboarding persona from user_metadata — display only. */
  persona?: OnboardingPersona;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  phone?: string;
  lastStudyDate?: string;
  integrations?: UserIntegrations;
}

export interface UserIntegrations {
  notion?: NotionIntegration;
  anki?: AnkiIntegration;
  obsidian?: ObsidianIntegration;
  quizlet?: QuizletIntegration;
  schoology?: SchoologyIntegration;
}

export interface NotionIntegration {
  connected: boolean;
  accessToken?: string;
  workspaceId?: string;
  workspaceName?: string;
  connectedAt?: number;
}

export interface AnkiIntegration {
  connected: boolean;
  lastImportAt?: number;
  importCount?: number;
}

export interface ObsidianIntegration {
  connected: boolean;
  vaultPaths?: string[];
  lastImportAt?: number;
}

export interface QuizletIntegration {
  connected: boolean;
  username?: string;
  connectedAt?: number;
}

export interface SchoologyIntegration {
  connected: boolean;
  consumerKey?: string;
  accessToken?: string;
  connectedAt?: number;
  disconnectedAt?: number;
}



