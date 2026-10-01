// @vitest-environment jsdom
//
// VideoBackground had two defects that only a render test can pin down:
//
//   1. `lazy` never deferred the download. `preload="metadata"` still makes
//      the browser open the source, and the IntersectionObserver only ever
//      gated play()/pause() - never the fetch. Measured on the landing page
//      at scroll 0, `ai-gen-reveal.webm` had fully downloaded (1759 KB) while
//      sitting 3734px below the fold, and `manifesto.webm` was opened then
//      aborted (no completed resource-timing entry, ERR_ABORTED in the
//      network panel). Now a lazy video renders no <source> at all until it
//      intersects, and stays on preload="none" until then.
//
//   2. `prefers-reduced-motion` was not actually honoured. The guard only
//      skipped the imperative play() call, but `autoPlay` was hardcoded on
//      the element, and the attribute wins over JS. Now autoPlay tracks the
//      preference, while a lazy video still arms its sources on intersection
//      so reduced-motion users get the static poster frame rather than nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { VideoBackground } from '../components/ui/VideoBackground';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let observerCallback: ObserverCallback | null = null;
let observed: Element | null = null;

class ControllableIntersectionObserver {
  constructor(cb: ObserverCallback) {
    observerCallback = cb;
  }
  observe(el: Element) {
    observed = el;
  }
  unobserve() {}
  disconnect() {
    observerCallback = null;
    observed = null;
  }
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [0.15];
}

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (q: string) => ({
      matches: reduced && q.includes('prefers-reduced-motion'),
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

function emitIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback?.([
      { isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as Partial<IntersectionObserverEntry>,
    ]);
  });
}

function sourcesOf(video: HTMLVideoElement): (string | null)[] {
  return [...video.querySelectorAll('source')].map((s) => s.getAttribute('src'));
}

describe('VideoBackground', () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observerCallback = null;
    observed = null;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      ControllableIntersectionObserver;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      writable: true,
      configurable: true,
      value: play,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      writable: true,
      configurable: true,
      value: pause,
    });
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests nothing for a lazy video that has not been scrolled to', () => {
    const { container } = render(<VideoBackground name="manifesto" lazy />);
    const video = container.querySelector('video')!;

    expect(sourcesOf(video)).toHaveLength(0);
    expect(video.getAttribute('preload')).toBe('none');
    expect(play).not.toHaveBeenCalled();
  });

  it('arms sources and plays only once a lazy video intersects', () => {
    const { container } = render(<VideoBackground name="manifesto" lazy />);
    const video = container.querySelector('video')!;

    expect(observed).toBe(video);
    emitIntersection(true);

    expect(sourcesOf(video)).toEqual([
      '/auramind/video/manifesto.webm',
      '/auramind/video/manifesto.mp4',
    ]);
    expect(video.getAttribute('preload')).toBe('auto');
    expect(play).toHaveBeenCalled();
  });

  it('pauses a lazy video when it leaves the viewport and does not replay it', () => {
    render(<VideoBackground name="manifesto" lazy />);
    emitIntersection(true);
    play.mockClear();

    emitIntersection(false);

    expect(pause).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('loads and plays immediately when lazy is not set', () => {
    const { container } = render(<VideoBackground name="hero-neural" />);
    const video = container.querySelector('video')!;

    expect(sourcesOf(video)).toEqual([
      '/auramind/video/hero-neural.webm',
      '/auramind/video/hero-neural.mp4',
    ]);
    expect(video.getAttribute('preload')).toBe('auto');
    expect(play).toHaveBeenCalled();
  });

  it('never autoplays when the user prefers reduced motion', () => {
    setReducedMotion(true);
    const { container } = render(<VideoBackground name="hero-neural" />);
    const video = container.querySelector('video')!;

    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('still shows the static frame for reduced motion when a lazy video comes into view', () => {
    setReducedMotion(true);
    const { container } = render(<VideoBackground name="manifesto" lazy />);
    const video = container.querySelector('video')!;

    expect(sourcesOf(video)).toHaveLength(0);

    emitIntersection(true);

    expect(sourcesOf(video)).toHaveLength(2);
    expect(play).not.toHaveBeenCalled();
  });
});
