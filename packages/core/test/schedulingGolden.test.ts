import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calculateSRS } from '../src/scheduling/srs';
import { GOLDEN_HISTORIES, runHistory } from './goldenHistories';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('schedules the golden histories exactly as recorded', async () => {
  const out = GOLDEN_HISTORIES.map((h) => runHistory(h, calculateSRS, (ms) => vi.setSystemTime(ms)));
  await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__golden__/scheduling.json');
});
