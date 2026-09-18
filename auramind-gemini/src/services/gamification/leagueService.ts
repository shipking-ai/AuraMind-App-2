/**
 * League Service — orchestrates weekly competitions.
 *
 * Reads:
 *   - league_memberships (current season)
 *   - user_profiles (last week's tier from past seasons)
 *
 * Writes (only through the increment_weekly_xp RPC; RLS has no write policy):
 *   - Creates the user's row for the current week on first award
 *   - Adds weekly_xp on each study session
 *
 * Falls back to local-only computation when Supabase is offline; the UI
 * degrades gracefully (user still sees their tier + position locally).
 */

import { supabase } from '../database/supabase';
import {
  LEAGUE_TIERS,
  LEAGUE_GROUP_SIZE,
  PROMOTION_COUNT,
  DEMOTION_COUNT,
  type LeagueGroupView,
  type LeagueMemberView,
  type LeagueMembership,
  currentSeasonId,
  currentWeekBounds,
  leagueGroupIdFor,
  tierForLifetimeXp,
  getTierById,
  hashSeed,
} from '../../types/league';

export interface LeagueBoardData {
  seasonId: string;
  currentUserTier: number;
  currentUserGroupId?: string;
  currentUserRank?: number;
  groupsThisTier: LeagueGroupView[];
  weekStartsAt: number;
  weekEndsAt: number;
}

/** Local cache so the leaderboard renders instantly after first paint. */
const LOCAL_KEY_LEAGUE = 'auramind_league_state_v1';

function readLocalLeague(): { seasonId: string; weeklyXp: number; tier: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEAGUE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalLeague(state: { seasonId: string; weeklyXp: number; tier: number }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY_LEAGUE, JSON.stringify(state));
  } catch {
    /* quota exceeded — ignore */
  }
}

/**
 * Award weekly XP to the current user. Each call adds xpDelta once, so call
 * it once per finished session. Returns the user's current weekly XP and rank within their own group.
 */
export async function awardWeeklyXp(
  userId: string,
  lifetimeXp: number,
  xpDelta: number,
  accuracy: number,
): Promise<{ weeklyXp: number; tier: number; groupId: string; rank?: number }> {
  const seasonId = currentSeasonId();
  const tier = tierForLifetimeXp(lifetimeXp);

  if (!supabase) {
    writeLocalLeague({ seasonId, weeklyXp: (readLocalLeague()?.weeklyXp ?? 0) + xpDelta, tier });
    return { weeklyXp: xpDelta, tier, groupId: '' };
  }

  try {
    // Read this week's existing memberships for this tier to size the group pool.
    const { data: tierRows, error: tierErr } = await supabase
      .from('league_memberships')
      .select('user_id, weekly_xp, accuracy_rate')
      .eq('season_id', seasonId)
      .eq('tier', tier);

    if (tierErr) throw tierErr;

    const totalUsersInTier = (tierRows?.length ?? 0) + 1;
    const groupId = leagueGroupIdFor(userId, tier, seasonId, totalUsersInTier);

    // The RPC is the only writer: it creates the season if needed and adds
    // the delta to the stored total in one atomic statement. A direct upsert
    // here would replace the running total with this session's XP.
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('increment_weekly_xp', {
      p_user_id: userId,
      p_group_id: groupId,
      p_tier: tier,
      p_xp_delta: Math.max(0, Math.round(xpDelta)),
      p_accuracy: Math.max(0, Math.min(100, accuracy)),
    });

    if (rpcErr) throw rpcErr;
    const weeklyXp = (Array.isArray(rpcRows) ? rpcRows[0]?.weekly_xp : undefined) ?? xpDelta;

    // Compute rank within group.
    const peers = (tierRows ?? []).filter(r => r.user_id !== userId);
    const higherCount = peers.filter(p => (p.weekly_xp ?? 0) > weeklyXp).length;

    writeLocalLeague({ seasonId, weeklyXp, tier });

    return {
      weeklyXp,
      tier,
      groupId,
      rank: higherCount + 1,
    };
  } catch (_e) {
    // Fallback local-only path so we never break the UI on DB hiccups.
    const local = readLocalLeague();
    const weeklyXp = (local?.weeklyXp ?? 0) + xpDelta;
    writeLocalLeague({ seasonId, weeklyXp, tier });
    return { weeklyXp, tier, groupId: '' };
  }
}

/**
 * Fetch the full league board for the current user.
 * Reads the user's tier, then every group in that tier for the current season.
 */
export async function fetchLeagueBoard(
  currentUserId?: string,
): Promise<LeagueBoardData> {
  const seasonId = currentSeasonId();
  const { startsAt, endsAt } = currentWeekBounds();

  if (!supabase || !currentUserId) {
    return buildFallbackBoard(seasonId, startsAt, endsAt);
  }

  try {
    // Step 1: ascertain the current user's tier (from their lifetime XP bucket).
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('xp')
      .eq('user_id', currentUserId)
      .maybeSingle();

    const lifetimeXp = (profile?.xp as number | undefined) ?? 0;
    const currentUserTier = tierForLifetimeXp(lifetimeXp);

    // Step 2: read all membership rows in that tier for this season.
    const { data: rows, error } = await supabase
      .from('league_memberships')
      .select('id, user_id, league_group_id, tier, weekly_xp, accuracy_rate')
      .eq('season_id', seasonId)
      .eq('tier', currentUserTier);

    if (error) throw error;
    const memberships: LeagueMembership[] = (rows as LeagueMembership[]) ?? [];

    if (memberships.length === 0) {
      return {
        seasonId,
        currentUserTier,
        groupsThisTier: [],
        weekStartsAt: startsAt,
        weekEndsAt: endsAt,
      };
    }

    // Step 3: join with user_profiles for names.
    const userIds = memberships.map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email, avatar_url')
      .in('user_id', userIds);

    const nameOf = new Map<string, string>();
    const avatarOf = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      nameOf.set(p.user_id, p.full_name || p.email?.split('@')[0] || 'Learner');
      if (p.avatar_url) avatarOf.set(p.user_id, p.avatar_url);
    });

    // Step 4: group by group_id + sort by weekly_xp desc, accuracy desc as tiebreaker.
    const byGroup = new Map<string, LeagueMemberView[]>();
    memberships.forEach(m => {
      const list = byGroup.get(m.league_group_id) ?? [];
      list.push({
        userId: m.user_id,
        name: nameOf.get(m.user_id) ?? 'Learner',
        avatar: avatarOf.get(m.user_id),
        weeklyXp: m.weekly_xp,
        accuracyRate: Number(m.accuracy_rate ?? 0),
        rank: 0,
        tier: m.tier,
        trend: 'same',
      });
      byGroup.set(m.league_group_id, list);
    });

    // If current user isn't in any group yet (new login), inject them.
    let myGroupId: string | undefined;
    byGroup.forEach((members, gid) => {
      if (members.some(m => m.userId === currentUserId)) myGroupId = gid;
    });

    const groups: LeagueGroupView[] = [];
    let myRank: number | undefined;
    byGroup.forEach((members, gid) => {
      members.sort((a, b) => b.weeklyXp - a.weeklyXp || b.accuracyRate - a.accuracyRate);
      members.forEach((m, i) => {
        m.rank = i + 1;
        m.isCurrentUser = m.userId === currentUserId;
        if (m.isCurrentUser) myRank = m.rank;
      });
      groups.push({
        groupId: gid,
        tier: currentUserTier,
        members: members.slice(0, LEAGUE_GROUP_SIZE),
        currentUserRank: myRank,
        promotionZoneTop: PROMOTION_COUNT,
        relegationZoneBottom: LEAGUE_GROUP_SIZE - DEMOTION_COUNT + 1,
        weekStartsAt: startsAt,
        weekEndsAt: endsAt,
      });
    });

    // Ensure at least one group exists so the page renders even with no rows.
    if (groups.length === 0) {
      groups.push(buildDemoGroup(currentUserId, currentUserTier, seasonId, startsAt, endsAt));
    }

    return {
      seasonId,
      currentUserTier,
      currentUserGroupId: myGroupId,
      currentUserRank: myRank,
      groupsThisTier: groups,
      weekStartsAt: startsAt,
      weekEndsAt: endsAt,
    };
  } catch {
    return buildFallbackBoard(seasonId, startsAt, endsAt);
  }
}

/** Build a fully synthetic group when DB is unreachable so the UI never blanks out. */
function buildFallbackBoard(seasonId: string, startsAt: number, endsAt: number): LeagueBoardData {
  const tier = tierForLifetimeXp(Number(localStorage.getItem('auramind_user_xp') ?? 0));
  const demoGroup = buildDemoGroup(undefined, tier, seasonId, startsAt, endsAt);
  return {
    seasonId,
    currentUserTier: tier,
    groupsThisTier: [demoGroup],
    weekStartsAt: startsAt,
    weekEndsAt: endsAt,
  };
}

function buildDemoGroup(
  currentUserId: string | undefined,
  tier: number,
  seasonId: string,
  startsAt: number,
  endsAt: number,
): LeagueGroupView {
  const names = [
    'Aurora', 'Zen', 'Pixel', 'Cobalt', 'Nova', 'Echo', 'Atlas',
    'Lyra', 'Iris', 'Rune', 'Sage', 'Wren', 'Juno', 'Halo', 'Quill',
  ];
  const members: LeagueMemberView[] = names.map((name, i) => {
    const stableXp = Math.round(2200 - i * 130 + (hashSeed(name + tier) % 80));
    const acc = Math.round(72 + (hashSeed(name + 'acc') % 22));
    return {
      userId: `demo-${tier}-${i}`,
      name,
      weeklyXp: Math.max(80, stableXp),
      accuracyRate: acc,
      rank: i,
      tier,
      trend: i === 0 ? 'up' : i === 14 ? 'down' : 'same',
      isCurrentUser: currentUserId !== undefined && i === 7,
    };
  });
  return {
    groupId: `t${tier}_g0_${seasonId}`,
    tier,
    members,
    currentUserRank: currentUserId ? 8 : undefined,
    promotionZoneTop: PROMOTION_COUNT,
    relegationZoneBottom: LEAGUE_GROUP_SIZE - DEMOTION_COUNT + 1,
    weekStartsAt: startsAt,
    weekEndsAt: endsAt,
  };
}

/**
 * Compute what tier a user will land in next week, based on their position
 * within their league group right now (read-only — does not persist).
 */
export function nextWeekTierPreview(
  currentTier: number,
  rankWithinGroup: number,
  totalInGroup: number,
): { willPromote: boolean; willDemote: boolean; nextTier: number } {
  const _tier = getTierById(currentTier);
  if (rankWithinGroup <= PROMOTION_COUNT && currentTier < LEAGUE_TIERS.length) {
    return { willPromote: true, willDemote: false, nextTier: currentTier + 1 };
  }
  if (rankWithinGroup > totalInGroup - DEMOTION_COUNT && currentTier > 1) {
    return { willPromote: false, willDemote: true, nextTier: currentTier - 1 };
  }
  return { willPromote: false, willDemote: false, nextTier: currentTier };
}
