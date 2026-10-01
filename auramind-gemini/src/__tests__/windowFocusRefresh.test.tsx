import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { useWindowFocusRefresh } from '../hooks/useWindowFocusRefresh';

function asTauri(): void {
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
}

function Harness({ onFocus }: { onFocus: () => void }): null {
  useWindowFocusRefresh(onFocus);
  return null;
}

describe('useWindowFocusRefresh', () => {
  beforeEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('ignores the focus that arrives with the initial load', () => {
    asTauri();
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    // A Tauri window is focused when it opens. Reacting here would put a
    // subscription request on every boot.
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('fires when the window comes back from losing focus', () => {
    asTauri();
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('fires once per blur, not on every focus event', () => {
    asTauri();
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('tracks each return separately', () => {
    asTauri();
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    for (let i = 0; i < 3; i += 1) {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    }
    expect(onFocus).toHaveBeenCalledTimes(3);
  });

  it('does nothing in a browser tab', () => {
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    // The website reloads on return, so it has no need of this.
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    asTauri();
    const onFocus = vi.fn();
    const { unmount } = render(<Harness onFocus={onFocus} />);
    unmount();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).not.toHaveBeenCalled();
  });
});
