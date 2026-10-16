/**
 * The website's custom cursor (a dot and a ring, with the system pointer
 * hidden) is a web flourish. The Windows app keeps the Windows pointer.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { CustomCursor } from '../components/ui/CustomCursor';

type W = Window & { __TAURI_INTERNALS__?: unknown };
const realMatchMedia = window.matchMedia;
const finePointer = () => {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  delete (window as W).__TAURI_INTERNALS__;
  window.matchMedia = realMatchMedia;
  document.body.classList.remove('custom-cursor-active');
});

describe('CustomCursor', () => {
  it('keeps the Windows pointer in the Windows app', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    finePointer();
    const { container } = render(<CustomCursor />);
    expect(container.querySelector('.cursor-dot')).toBeNull();
    expect(document.body).not.toHaveClass('custom-cursor-active');
  });

  it('still draws the custom cursor on the website with a mouse', () => {
    finePointer();
    const { container } = render(<CustomCursor />);
    expect(container.querySelector('.cursor-dot')).not.toBeNull();
  });
});
