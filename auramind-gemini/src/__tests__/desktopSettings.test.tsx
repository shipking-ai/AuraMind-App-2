import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  setShortcut: vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok: boolean; reason?: string }),
  getAutostart: vi.fn(async () => false),
  setAutostart: vi.fn(async (on: boolean) => on),
  notificationsEnabled: vi.fn(async () => true as boolean | null),
}));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));
const open = vi.hoisted(() => vi.fn());

import { DesktopSettingsSection } from '../desktop/DesktopSettingsSection';
import { acceleratorFromEvent, displayAccelerator } from '../desktop/accelerator';

type W = Window & { __TAURI_INTERNALS__?: unknown };
const key = (over: Partial<Parameters<typeof acceleratorFromEvent>[0]>) =>
  ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over });

beforeEach(() => {
  (window as W).__TAURI_INTERNALS__ = {};
  Object.values(bridge).forEach((f) => f.mockClear());
  localStorage.clear();
  window.open = open as unknown as typeof window.open;
});
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('accelerator', () => {
  it('needs a modifier and a real key', () => {
    expect(acceleratorFromEvent(key({ code: 'Space', key: ' ', ctrlKey: true, altKey: true }))).toBe('CommandOrControl+Alt+Space');
    expect(acceleratorFromEvent(key({ code: 'KeyQ', key: 'q', ctrlKey: true, shiftKey: true }))).toBe('CommandOrControl+Shift+Q');
    expect(acceleratorFromEvent(key({ code: 'F8', key: 'F8', altKey: true }))).toBe('Alt+F8');
    expect(acceleratorFromEvent(key({ code: 'KeyQ', key: 'q' }))).toBeNull();
    expect(acceleratorFromEvent(key({ code: 'ControlLeft', key: 'Control', ctrlKey: true }))).toBeNull();
  });

  it('reads like Windows', () => {
    expect(displayAccelerator('CommandOrControl+Alt+Space')).toBe('Ctrl + Alt + Space');
  });
});

describe('DesktopSettingsSection', () => {
  it('renders nothing in a browser tab', () => {
    delete (window as W).__TAURI_INTERNALS__;
    const { container } = render(<DesktopSettingsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('records a new shortcut and saves it', async () => {
    render(<DesktopSettingsSection />);
    expect(await screen.findByText('Ctrl + Alt + Space')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', ctrlKey: true, altKey: true }); });
    expect(bridge.setShortcut).toHaveBeenCalledWith('CommandOrControl+Alt+Q');
    expect(screen.getByText('Ctrl + Alt + Q')).toBeInTheDocument();
    expect(localStorage.getItem('auramind_quickReviewShortcut')).toBe(JSON.stringify('CommandOrControl+Alt+Q'));
  });

  it('explains a shortcut another app owns and keeps the old one', async () => {
    bridge.setShortcut.mockResolvedValueOnce({ ok: false, reason: 'taken' });
    render(<DesktopSettingsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', ctrlKey: true, altKey: true }); });
    expect(screen.getByText('Another app already uses that shortcut. Try a different one.')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Alt + Space')).toBeInTheDocument();
  });

  it('toggles start with Windows from the real state', async () => {
    render(<DesktopSettingsSection />);
    const toggle = await screen.findByRole('switch', { name: 'Start with Windows' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(toggle); });
    expect(bridge.setAutostart).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('says when Windows has notifications turned off, with a way to fix it', async () => {
    bridge.notificationsEnabled.mockResolvedValueOnce(false);
    render(<DesktopSettingsSection />);
    expect(await screen.findByText('Notifications are turned off in Windows')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Windows settings' }));
    expect(open).toHaveBeenCalledWith('ms-settings:notifications', '_blank');
  });
});
