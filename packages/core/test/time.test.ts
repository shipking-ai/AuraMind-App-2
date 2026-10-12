import { expect, it } from 'vitest';
import { isoToMs, isoToMsOrUndef, msToIso } from '../src';

it('parses ISO timestamps to epoch ms with a fallback', () => {
  expect(isoToMs('2026-10-08T00:00:00.000Z', 0)).toBe(1791417600000);
  expect(isoToMs(null, 5)).toBe(5);
  expect(isoToMs(1791417600000, 0)).toBe(1791417600000);
});

it('returns undefined for unparseable input', () => {
  expect(isoToMsOrUndef('garbage')).toBeUndefined();
  expect(isoToMsOrUndef(undefined)).toBeUndefined();
});

it('formats epoch ms as ISO', () => {
  expect(msToIso(1791417600000)).toBe('2026-10-08T00:00:00.000Z');
});
