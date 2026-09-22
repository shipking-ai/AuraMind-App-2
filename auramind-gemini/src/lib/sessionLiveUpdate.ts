import { startLiveUpdate, updateLiveUpdate, endLiveUpdate } from './liveUpdate';
import { startLiveActivity, updateLiveActivity, endLiveActivity } from './liveActivity';

/**
 * One study session, shown wherever the platform can show it.
 *
 * Android 16 promotes an ongoing notification to the status-bar chip
 * (lib/liveUpdate); iOS puts the same session on the Lock Screen and in the
 * Dynamic Island (lib/liveActivity). Both bridges already no-op off their own
 * platform, so this calls both and lets each decide — which keeps the study
 * page free of platform branching and stops the two from drifting apart.
 */

export interface SessionProgress {
  deckTitle: string;
  deckId: string;
  total: number;
  done: number;
  /** 1-based positions of the cards graded Again. */
  againAt: number[];
}

const android = (p: SessionProgress) => ({
  deckTitle: p.deckTitle,
  total: p.total,
  done: p.done,
  againAt: p.againAt,
  deepLink: `auramind://app/dashboard/study/${p.deckId}`,
});

// The Live Activity draws a count, not positions.
const ios = (p: SessionProgress) => ({
  deckTitle: p.deckTitle,
  total: p.total,
  done: p.done,
  again: p.againAt.length,
});

export async function startSessionLiveUpdate(progress: SessionProgress): Promise<void> {
  await Promise.all([startLiveUpdate(android(progress)), startLiveActivity(ios(progress))]);
}

export async function updateSessionLiveUpdate(progress: SessionProgress): Promise<void> {
  await Promise.all([updateLiveUpdate(android(progress)), updateLiveActivity(ios(progress))]);
}

/** Ends whichever surface is showing. Safe when none is. */
export async function endSessionLiveUpdate(): Promise<void> {
  await Promise.all([endLiveUpdate(), endLiveActivity()]);
}
