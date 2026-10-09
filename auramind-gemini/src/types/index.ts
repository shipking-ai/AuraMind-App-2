// Domain types shared with the native app live in @bonamind/core; they are
// re-exported here so existing imports keep working unchanged.
export type {
  CardSourceType,
  CardCitation,
  FSRSState,
  Card,
  Deck,
  StudySession,
  SRSResult,
} from '@bonamind/core';
export { Rating } from '@bonamind/core';
import type { CardCitation, CardSourceType } from '@bonamind/core';

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



