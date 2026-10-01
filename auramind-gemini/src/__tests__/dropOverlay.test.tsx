import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));
const offer = vi.hoisted(() => vi.fn());
vi.mock('../lib/pendingGeneratorFile', () => ({ offerGeneratorFile: (f: File) => offer(f) }));

import { DropOverlay } from '../components/shared/DropOverlay';

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }

function setup() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DropOverlay />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

const files = (...list: File[]) => ({ types: ['Files'], files: list });

beforeEach(() => { toastError.mockReset(); offer.mockReset(); });

describe('DropOverlay', () => {
  it('appears when files are dragged over the window', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    expect(screen.getByText('Drop to make a course')).toBeInTheDocument();
  });

  it('ignores drags that carry no files (text, links)', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } }); });
    expect(screen.queryByText('Drop to make a course')).toBeNull();
  });

  it('a supported file goes to the generator', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    const pdf = new File(['x'], 'Notes.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByTestId('drop-overlay'), { dataTransfer: files(pdf) });
    expect(offer).toHaveBeenCalledWith(pdf);
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/generator');
    expect(screen.queryByText('Drop to make a course')).toBeNull();
  });

  it('an unsupported file explains itself and stays put', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    fireEvent.drop(screen.getByTestId('drop-overlay'), { dataTransfer: files(new File(['x'], 'setup.exe')) });
    expect(toastError).toHaveBeenCalledWith("AuraMind can't make a course from .exe files.");
    expect(offer).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });
});
