import type { ComponentType } from 'react';
import { Brain, Flame, Heart, Lightbulb, Zap } from '../components/icons';

export type ProfLinneaPersonality =
  | 'default'
  | 'socratic'
  | 'drill-sergeant'
  | 'gentle'
  | 'hype';
export const PROF_LINNEA_PERSONALITY_KEY = 'bonamind.prof.personality.v1';
export const PROF_LINNEA_PERSONALITY_OPTIONS: {
  id: ProfLinneaPersonality;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  description: string;
  promptModifier: string;
}[] = [
  {
    id: 'default',
    label: 'Balanced Coach',
    icon: Brain,
    description: 'Warm, sharp, encouraging — the default Prof. Linnea.',
    promptModifier: '',
  },
  {
    id: 'socratic',
    label: 'Socratic Guide',
    icon: Lightbulb,
    description: 'Asks questions first. Never gives the answer without making you think.',
    promptModifier: '\nPERSONALITY OVERRIDE: You are in Socratic mode. For every question the user asks, respond with a guiding question first. Never give the direct answer on the first turn. Lead them to discover the answer themselves through 2-3 exchanges before confirming.',
  },
  {
    id: 'drill-sergeant',
    label: 'Drill Sergeant',
    icon: Zap,
    description: 'Tough love. No fluff. High standards, fast pace.',
    promptModifier: '\nPERSONALITY OVERRIDE: You are in Drill Sergeant mode. Be direct, terse, high-energy. Cut the pleasantries. Use short sentences. Push the user to keep up. When they get something wrong, say so immediately without sugarcoating. When they get it right, acknowledge it in one word and move on.',
  },
  {
    id: 'gentle',
    label: 'Gentle Tutor',
    icon: Heart,
    description: 'Patient, reassuring, never judgmental. Great for beginners.',
    promptModifier: '\nPERSONALITY OVERRIDE: You are in Gentle Tutor mode. Be extra patient and reassuring. Validate effort before correcting mistakes. Use phrases like "great attempt" and "you\'re closer than you think." Never make the user feel bad about not knowing something. Celebrate small wins.',
  },
  {
    id: 'hype',
    label: 'Hype Coach',
    icon: Flame,
    description: 'Maximum enthusiasm. Every review is a victory lap.',
    promptModifier: '\nPERSONALITY OVERRIDE: You are in Hype Coach mode. Maximum enthusiasm and energy! Use exclamation points, celebrate every correct answer like a championship win, frame study sessions as epic quests. Be the study buddy who makes hard things feel exciting. Use phrases like "LET\'S GO" and "absolute legend."',
  },
];
export function getStoredPersonality(): ProfLinneaPersonality {
  try {
    const stored = localStorage.getItem(PROF_LINNEA_PERSONALITY_KEY);
    if (stored && PROF_LINNEA_PERSONALITY_OPTIONS.some(p => p.id === stored)) {
      return stored as ProfLinneaPersonality;
    }
  } catch { /* ignore */ }
  return 'default';
}

export function setStoredPersonality(personality: ProfLinneaPersonality): void {
  try {
    localStorage.setItem(PROF_LINNEA_PERSONALITY_KEY, personality);
  } catch { /* ignore */ }
}

export function getPersonalityPromptModifier(personality: ProfLinneaPersonality): string {
  const found = PROF_LINNEA_PERSONALITY_OPTIONS.find(p => p.id === personality);
  return found?.promptModifier ?? '';
}
