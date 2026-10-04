import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const bridge = vi.hoisted(() => ({ appReady: vi.fn(), setTitle: vi.fn() }));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));

import { DesktopChrome, windowTitleFor } from '../desktop/DesktopChrome';

type W = Window & { __TAURI_INTERNALS__?: unknown };
function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
const mount = (path = '/dashboard/decks') =>
  render(<MemoryRouter initialEntries={[path]}><DesktopChrome /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>);

beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; bridge.appReady.mockClear(); bridge.setTitle.mockClear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; document.documentElement.classList.remove('platform-desktop'); });

describe('windowTitleFor', () => {
  it('names the page, then the app', () => {
    expect(windowTitleFor('/dashboard')).toBe('Home · BonaMind');
    expect(windowTitleFor('/dashboard/decks')).toBe('Library · BonaMind');
    expect(windowTitleFor('/dashboard/study/abc')).toBe('Study · BonaMind');
    expect(windowTitleFor('/somewhere-else')).toBe('BonaMind');
  });
});

describe('DesktopChrome', () => {
  it('reports first paint once and titles the window', async () => {
    mount();
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    expect(bridge.appReady).toHaveBeenCalledTimes(1);
    expect(bridge.setTitle).toHaveBeenCalledWith('Library · BonaMind');
    expect(document.documentElement.classList.contains('platform-desktop')).toBe(true);
  });

  it('hides the browser context menu except in text fields', () => {
    mount();
    const div = document.createElement('div');
    const input = document.createElement('input');
    document.body.append(div, input);
    const onDiv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    div.dispatchEvent(onDiv);
    const onInput = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    input.dispatchEvent(onInput);
    expect(onDiv.defaultPrevented).toBe(true);
    expect(onInput.defaultPrevented).toBe(false);
    div.remove(); input.remove();
  });

  it('Ctrl+N opens the generator and Ctrl+, opens settings', () => {
    const { getByTestId } = mount('/dashboard');
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/generator');
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/settings');
  });

  it('does nothing in a browser tab', () => {
    delete (window as W).__TAURI_INTERNALS__;
    mount();
    const onDiv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(onDiv);
    expect(onDiv.defaultPrevented).toBe(false);
    expect(bridge.setTitle).not.toHaveBeenCalled();
  });
});
