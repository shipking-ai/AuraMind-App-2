import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calculateSRS } from '../services/study/srs';
import { GOLDEN_HISTORIES, runHistory } from '../../../packages/core/test/goldenHistories';

// The same fixture is asserted by packages/core/test/schedulingGolden.test.ts:
// the website and the native app must schedule identically.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('schedules the golden histories exactly as recorded', async () => {
  const out = GOLDEN_HISTORIES.map((h) => runHistory(h, calculateSRS, (ms) => vi.setSystemTime(ms)));
  await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('../../../packages/core/test/__golden__/scheduling.json');
});
