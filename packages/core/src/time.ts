/**
 * Timestamp conversion at the database boundary. Postgres TIMESTAMPTZ columns
 * arrive as ISO strings; in memory every schedule field is epoch ms so due
 * comparisons are plain number comparisons.
 */
export function isoToMsOrUndef(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function isoToMs(value: string | number | null | undefined, fallback: number): number {
  return isoToMsOrUndef(value) ?? fallback;
}

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}
