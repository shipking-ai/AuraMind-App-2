import { describe, it, expect, vi, beforeEach } from 'vitest';

// awardWeeklyXp must write through the increment_weekly_xp RPC. The old direct
// upsert set weekly_xp to this session's delta, wiping the running total, and
// league_memberships no longer has a write policy for it to use anyway.

const { rpc, from } = vi.hoisted(() => {
  const tierQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: [{ user_id: 'peer', weekly_xp: 40, accuracy_rate: 90 }], error: null }),
  };
  return {
    rpc: vi.fn(),
    from: vi.fn(() => tierQuery),
  };
});

vi.mock('@/services/database/supabase', () => ({ supabase: { rpc, from } }));

import { awardWeeklyXp } from '@/services/gamification/leagueService';

describe('awardWeeklyXp', () => {
  beforeEach(() => {
    rpc.mockReset();
    window.localStorage.clear();
  });

  it('adds XP through the RPC and returns the stored running total', async () => {
    rpc.mockResolvedValue({
      data: [{ weekly_xp: 55, accuracy_rate: 71, group_id: 'g', tier: 1 }],
      error: null,
    });

    const result = await awardWeeklyXp('me', 0, 30, 80);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'increment_weekly_xp',
      expect.objectContaining({ p_user_id: 'me', p_tier: 1, p_xp_delta: 30, p_accuracy: 80 }),
    );
    expect(result.weeklyXp).toBe(55);
    // Peer has 40 and we have 55, so we lead the group.
    expect(result.rank).toBe(1);
    expect(from).not.toHaveBeenCalledWith('league_seasons');
  });

  it('clamps negative deltas and out-of-range accuracy before calling the RPC', async () => {
    rpc.mockResolvedValue({ data: [{ weekly_xp: 0 }], error: null });

    await awardWeeklyXp('me', 0, -10, 140);

    expect(rpc).toHaveBeenCalledWith(
      'increment_weekly_xp',
      expect.objectContaining({ p_xp_delta: 0, p_accuracy: 100 }),
    );
  });

  it('falls back to the local total when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });

    const first = await awardWeeklyXp('me', 0, 20, 80);
    const second = await awardWeeklyXp('me', 0, 15, 80);

    expect(first.weeklyXp).toBe(20);
    expect(second.weeklyXp).toBe(35);
  });
});
