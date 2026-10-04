/**
 * League System Types & Constants
 *
 * Duolingo-inspired weekly competitions adapted for BonaMind.
 * 10 tiers × 15-person groups × 7-day cycles. Top 7 promote, middle 3 stay,
 * bottom 5 demote. Driven by weekly XP with accuracy as tiebreaker.
 */
import type { ComponentType } from 'react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
} from '../components/icons';

export interface LeagueTier {
  id: number;
  name: string;
  gemIcon: ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgGradient: string;
  minXp: number;
  description: string;
}

/** 10 leagues ordered from Novice entry to Aura top tier. */
export const LEAGUE_TIERS: readonly LeagueTier[] = [
  { id: 1,  name: 'Novice',     gemIcon: Medal,      color: '#B87333', bgGradient: 'from-amber-700 to-amber-900', minXp: 0,     description: 'Every sage was once a novice.' },
  { id: 2,  name: 'Iron',       gemIcon: Shield,     color: '#71717A', bgGradient: 'from-zinc-500 to-zinc-700',    minXp: 500,   description: 'Forged by repetition.' },
  { id: 3,  name: 'Bronze',     gemIcon: Star,       color: '#CD7F32', bgGradient: 'from-orange-600 to-orange-800', minXp: 1500,  description: 'Cast your first durable memory.' },
  { id: 4,  name: 'Silver',     gemIcon: Award,      color: '#C0C0C0', bgGradient: 'from-slate-300 to-slate-500',  minXp: 3000,  description: 'Refined. Reflective.' },
  { id: 5,  name: 'Gold',       gemIcon: Trophy,     color: '#FFD700', bgGradient: 'from-yellow-400 to-yellow-600', minXp: 5000,  description: 'Bright enough to recall at noon.' },
  { id: 6,  name: 'Platinum',   gemIcon: Crown,      color: '#22D3EE', bgGradient: 'from-cyan-400 to-cyan-600',    minXp: 7500,  description: 'Crystal clarity.' },
  { id: 7,  name: 'Emerald',    gemIcon: Sparkles,   color: '#10B981', bgGradient: 'from-emerald-400 to-emerald-600', minXp: 10000, description: 'Growing like leaves in spring.' },
  { id: 8,  name: 'Ruby',       gemIcon: Flame,      color: '#EF4444', bgGradient: 'from-rose-500 to-rose-700',    minXp: 15000, description: 'Hot with knowledge.' },
  { id: 9,  name: 'Diamond',    gemIcon: Target,     color: '#A855F7', bgGradient: 'from-violet-500 to-violet-700', minXp: 25000, description: 'Unbreakable. Sharp.' },
  { id: 10, name: 'Aura',       gemIcon: Sun,        color: '#6366F1', bgGradient: 'from-indigo-400 via-purple-500 to-pink-500', minXp: 40000, description: 'You are the light.' },
] as const;

/** Group target size — Duolingo's 15-person tier convention. */
export const LEAGUE_GROUP_SIZE = 15;

/** Within a 15-person group, ranks 1–7 promote to the next tier. */
export const PROMOTION_COUNT = 7;
/** Within a 15-person group, the bottom 5 are demoted. */
export const DEMOTION_COUNT = 5;
/** Equivalently, the middle 3 hold their tier. */
export const STAY_COUNT = LEAGUE_GROUP_SIZE - PROMOTION_COUNT - DEMOTION_COUNT;

export interface LeagueMembership {
  id: string;
  season_id: string;
  user_id: string;
  league_group_id: string;
  tier: number;
  weekly_xp: number;
  accuracy_rate: number;
  updated_at: string;
}

export interface LeagueMemberView {
  userId: string;
  name: string;
  avatar?: string;
  weeklyXp: number;
  accuracyRate: number;
  rank: number;
  tier: number;
  trend: 'up' | 'down' | 'same';
  isCurrentUser?: boolean;
}

export interface LeagueGroupView {
  groupId: string;
  tier: number;
  members: LeagueMemberView[];
  currentUserRank?: number;
  promotionZoneTop: number;
  relegationZoneBottom: number;
  weekStartsAt: number;
  weekEndsAt: number;
}

/** Look up a tier by id. Falls back to the lowest tier if the id is invalid. */
export function getTierById(id: number): LeagueTier {
  return LEAGUE_TIERS.find(t => t.id === id) ?? LEAGUE_TIERS[0];
}

/**
 * Derive the user's tier from their lifetime XP. Sticky on promotion so a
 * slow week doesn't immediately demote someone.
 */
export function tierForLifetimeXp(xp: number): number {
  let tier = LEAGUE_TIERS[0].id;
  for (const t of LEAGUE_TIERS) {
    if (xp >= t.minXp) tier = t.id;
  }
  return tier;
}

/** Deterministic string hash used to assign group buckets without races. */
export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Compute the 15-person league group id for a user within a tier and season.
 * Pure function — same (user, tier, season) yields the same bucket so group
 * membership stays stable as users earn midweek XP.
 */
export function leagueGroupIdFor(
  userId: string,
  tier: number,
  seasonId: string,
  totalUsersInTier: number,
): string {
  const numGroups = Math.max(1, Math.ceil(totalUsersInTier / LEAGUE_GROUP_SIZE));
  const bucket = hashSeed(`${userId}-${tier}-${seasonId}`) % numGroups;
  return `t${tier}_g${bucket}_${seasonId}`;
}

/** ISO week label such as '2026-W28'. Used as the season_id primary key. */
export function currentSeasonId(now = new Date()): string {
  // Copy so we don't mutate the caller's date.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Day of week with Monday=0 ... Sunday=6 so the arithmetic below lines up.
  const day = (d.getUTCDay() + 6) % 7;
  // Shift to the Thursday of this ISO week — that's how ISO 8601 week numbers anchor.
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Returns millisecond timestamps for Monday 00:00 UTC of the current ISO week. */
export function currentWeekBounds(now = new Date()): { startsAt: number; endsAt: number } {
  const start = new Date(now);
  // Day of week with Monday=0 ... Sunday=6.
  const day = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return { startsAt: start.getTime(), endsAt: end.getTime() };
}

/** Format ms remaining until the next week rollover as a short status string. */
export function formatTimeUntilRollover(end: number): string {
  const ms = Math.max(0, end - Date.now());
  const d = Math.floor(ms / (24 * 3600 * 1000));
  const h = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  const m = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
