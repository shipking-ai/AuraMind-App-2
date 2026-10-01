/**
 * Windows app (Tauri) behaviour that lives in the web code: outside links go
 * to the user's browser, and updates are offered without interrupting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const openUrl = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (url: string) => openUrl(url) }));

const checkForDesktopUpdate = vi.hoisted(() => vi.fn());
const installDesktopUpdate = vi.hoisted(() => vi.fn());
vi.mock('../lib/desktopUpdater', () => ({
  checkForDesktopUpdate: () => checkForDesktopUpdate(),
  installDesktopUpdate: (...args: unknown[]) => installDesktopUpdate(...args),
}));

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };
const setDesktop = (on: boolean) => {
  if (on) (window as TauriWindow).__TAURI_INTERNALS__ = {};
  else delete (window as TauriWindow).__TAURI_INTERNALS__;
};

beforeEach(() => {
  openUrl.mockReset().mockResolvedValue(undefined);
  checkForDesktopUpdate.mockReset();
  installDesktopUpdate.mockReset();
});

afterEach(() => {
  setDesktop(false);
  vi.useRealTimers();
});

describe('externalUrl', () => {
  it('keeps same-origin URLs in the app and sends the rest out', async () => {
    const { externalUrl } = await import('../lib/desktopLinks');
    const page = 'https://tauri.localhost/dashboard';
    expect(externalUrl('/deck/1', page)).toBeNull();
    expect(externalUrl('https://tauri.localhost/about', page)).toBeNull();
    expect(externalUrl('https://billing.stripe.com/p/session', page)?.href).toBe('https://billing.stripe.com/p/session');
    expect(externalUrl('mailto:hello@auramind.app', page)?.protocol).toBe('mailto:');
    expect(externalUrl('javascript:alert(1)', page)).toBeNull();
    expect(externalUrl('file:///C:/Windows/', page)).toBeNull();
    expect(externalUrl('ms-settings:notifications', page)?.href).toBe('ms-settings:notifications');
    expect(externalUrl('ms-settings:privacy', page)).toBeNull();
  });
});

describe('installDesktopLinkHandling', () => {
  it('does nothing in a browser tab', async () => {
    vi.resetModules();
    const before = window.open;
    const { installDesktopLinkHandling } = await import('../lib/desktopLinks');
    installDesktopLinkHandling();
    expect(window.open).toBe(before);
  });

  it('routes window.open and target=_blank links to the browser in the Windows app', async () => {
    vi.resetModules();
    setDesktop(true);
    const inWebView = vi.fn(() => null);
    const original = window.open;
    window.open = inWebView as unknown as typeof window.open;
    try {
      const { installDesktopLinkHandling } = await import('../lib/desktopLinks');
      installDesktopLinkHandling();

      // Stripe billing portal from Settings.
      expect(window.open('https://billing.stripe.com/p/session', '_blank', 'noopener')).toBeNull();
      await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://billing.stripe.com/p/session'));
      expect(inWebView).not.toHaveBeenCalled();

      // In-app URLs still go to the webview.
      window.open('/dashboard', '_self');
      expect(inWebView).toHaveBeenCalledWith('/dashboard', '_self', undefined);

      // A target=_blank link on the About page.
      const link = document.createElement('a');
      link.href = 'https://auramind.app/privacy';
      link.target = '_blank';
      link.textContent = 'privacy';
      document.body.appendChild(link);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://auramind.app/privacy'));
      link.remove();
    } finally {
      window.open = original;
    }
  });
});

describe('DesktopUpdateBanner', () => {
  const update = { version: '2.1.0', body: 'Community tab' };

  async function renderBanner() {
    const { DesktopUpdateBanner, FIRST_CHECK_DELAY_MS } = await import('../components/desktop/DesktopUpdateBanner');
    render(<DesktopUpdateBanner />);
    return FIRST_CHECK_DELAY_MS;
  }

  it('never checks outside the Windows app', async () => {
    vi.useFakeTimers();
    const delay = await renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay + 1); });
    expect(checkForDesktopUpdate).not.toHaveBeenCalled();
  });

  it('waits for startup, then offers the update and installs it on request', async () => {
    vi.useFakeTimers();
    setDesktop(true);
    checkForDesktopUpdate.mockResolvedValue(update);
    installDesktopUpdate.mockReturnValue(new Promise(() => {})); // relaunch never returns

    const delay = await renderBanner();
    expect(checkForDesktopUpdate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay + 1); });

    expect(screen.getByText('AuraMind 2.1.0 is ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and update' }));
    expect(installDesktopUpdate).toHaveBeenCalledWith(update, expect.any(Function));
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
  });

  it('shows nothing when up to date or when the check fails', async () => {
    vi.useFakeTimers();
    setDesktop(true);
    checkForDesktopUpdate.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const delay = await renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay + 1); });

    expect(screen.queryByRole('status')).toBeNull();
    warn.mockRestore();
  });

  it('"Later" hides the prompt', async () => {
    vi.useFakeTimers();
    setDesktop(true);
    checkForDesktopUpdate.mockResolvedValue(update);

    const delay = await renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay + 1); });
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByText('AuraMind 2.1.0 is ready')).toBeNull();
  });

  it('lets the user retry after a failed install', async () => {
    vi.useFakeTimers();
    setDesktop(true);
    checkForDesktopUpdate.mockResolvedValue(update);
    installDesktopUpdate.mockRejectedValueOnce(new Error('signature mismatch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const delay = await renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay + 1); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Restart and update' })); });

    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    warn.mockRestore();
  });
});
