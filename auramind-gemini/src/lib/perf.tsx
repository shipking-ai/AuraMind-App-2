import { useEffect, useRef } from 'react';

/**
 * Performance measurement utilities for BonaMind.
 *
 * Usage:
 *   import { mark, measure, PerfBoundary } from '@/lib/perf';
 *
 *   // Manual markers
 *   mark('skeleton-chat-start');
 *   // ... after content loads ...
 *   measure('skeleton-chat-swap', 'skeleton-chat-start');
 *
 *   // Component wrapper
 *   <PerfBoundary label="dashboard">...</PerfBoundary>
 *
 * Open DevTools > Performance to see these as User Timing marks.
 * They also appear in console.time/timeEnd if DevTools is not open.
 */

const marks = new Map<string, number>();

export function mark(name: string, options?: { log?: boolean }): number {
  const ts = performance.now();
  marks.set(name, ts);
  if (options?.log !== false && import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- profiling utility
    console.log('[Perf]', name + ':', ts.toFixed(1), 'ms');
  }
  return ts;
}

export function measure(
  name: string,
  startMark?: string,
  options?: { log?: boolean },
): number | null {
  const start = startMark ? marks.get(startMark) : 0;
  if (start === undefined) {
    console.warn('[Perf] Mark not found:', startMark);
    return null;
  }
  const elapsed = performance.now() - (start || performance.timing?.navigationStart || 0);
  if (options?.log !== false && import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- profiling utility
    console.log('[Perf]', name + ':', elapsed.toFixed(1), 'ms');
  }
  if (typeof performance.measure === 'function') {
    try {
      performance.measure(name, startMark);
    } catch {
      // ignore if mark doesn't exist
    }
  }
  return elapsed;
}

export function clearMarks(): void {
  marks.clear();
}

interface PerfBoundaryProps {
  label: string;
  children: React.ReactNode;
  log?: boolean;
}

export function PerfBoundary({ label, children, log = true }: PerfBoundaryProps) {
  const contentRendered = useRef(false);

  useEffect(() => {
    if (contentRendered.current) return;
    contentRendered.current = true;
    if (log && import.meta.env.DEV) {
      const end = performance.now();
      // eslint-disable-next-line no-console -- profiling utility
      console.log('[Perf]', label, 'skeleton-content swap:', end.toFixed(1), 'ms');
    }
    try {
      performance.measure('skeleton-' + label, 'skeleton-' + label + '-start');
    } catch {
      // ignore
    }
  }, [label, log]);

  useEffect(() => {
    performance.mark('skeleton-' + label + '-start');
  }, [label]);

  return <>{children}</>;
}
