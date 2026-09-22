import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  detectLanguage,
  hasBuiltInAI,
  summarizeLocally,
  summarizerStatus,
  translateLocally,
} from '../lib/builtInAI';
import { LocalAIAssist } from '../components/study/LocalAIAssist';

const g = globalThis as Record<string, any>;

function installSummarizer(over: Partial<Record<string, any>> = {}) {
  g.Summarizer = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async () => ({
      summarize: vi.fn(async () => '  Synapses strengthen with use.  '),
      destroy: vi.fn(),
    })),
    ...over,
  };
}

function installTranslator() {
  g.Translator = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async () => ({ translate: vi.fn(async () => 'Las sinapsis se fortalecen.'), destroy: vi.fn() })),
  };
  g.LanguageDetector = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async () => ({
      detect: vi.fn(async () => [{ detectedLanguage: 'en', confidence: 0.98 }]),
      destroy: vi.fn(),
    })),
  };
}

afterEach(() => {
  delete g.Summarizer;
  delete g.Translator;
  delete g.LanguageDetector;
  vi.useRealTimers();
});

describe('builtInAI', () => {
  it('reports the browser has nothing when the APIs are absent', async () => {
    expect(hasBuiltInAI()).toBe(false);
    expect(await summarizerStatus()).toBe('unsupported');
    expect(await summarizeLocally('text')).toBeNull();
    expect(await translateLocally('text', 'es')).toBeNull();
    expect(await detectLanguage('text')).toBeNull();
  });

  it('summarizes and trims, and maps a pending download onto downloadable', async () => {
    installSummarizer();
    expect(await summarizerStatus()).toBe('available');
    expect(await summarizeLocally('a long answer', { context: 'What is LTP?' }))
      .toBe('Synapses strengthen with use.');

    installSummarizer({ availability: vi.fn(async () => 'downloadable') });
    expect(await summarizerStatus()).toBe('downloadable');
  });

  it('never rejects and never hangs: a throwing or silent API resolves to null', async () => {
    installSummarizer({ create: vi.fn(async () => { throw new Error('no model'); }) });
    await expect(summarizeLocally('text')).resolves.toBeNull();

    // availability() that never settles must still answer.
    installSummarizer({ availability: vi.fn(() => new Promise(() => {})) });
    vi.useFakeTimers();
    const pending = summarizerStatus();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe('unavailable');
  });

  it('detects the source language and skips a no-op translation', async () => {
    installTranslator();
    expect(await detectLanguage('hello')).toBe('en');
    expect(await translateLocally('Synapses strengthen.', 'es')).toBe('Las sinapsis se fortalecen.');
    expect(await translateLocally('Synapses strengthen.', 'en')).toBeNull();
  });

  it('ignores a low-confidence language guess', async () => {
    installTranslator();
    g.LanguageDetector.create = vi.fn(async () => ({
      detect: vi.fn(async () => [{ detectedLanguage: 'de', confidence: 0.2 }]),
      destroy: vi.fn(),
    }));
    expect(await detectLanguage('hmm')).toBeNull();
  });
});

describe('LocalAIAssist', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders nothing when the browser has no built-in AI', () => {
    const { container } = render(<LocalAIAssist front="Q" back="A" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the key idea on demand, and says so when the model declines', async () => {
    installSummarizer();
    installTranslator();
    render(<LocalAIAssist front="What is LTP?" back="A long answer about synapses." />);
    const button = await screen.findByRole('button', { name: /Key idea/ });
    fireEvent.click(button);
    expect(await screen.findByText('Synapses strengthen with use.')).toBeTruthy();

    g.Summarizer.create = vi.fn(async () => ({ summarize: vi.fn(async () => '   '), destroy: vi.fn() }));
    fireEvent.click(button);
    expect(await screen.findByText(/couldn.t help with this one/)).toBeTruthy();
  });

  it('translates into the chosen language and remembers it', async () => {
    installSummarizer();
    installTranslator();
    render(<LocalAIAssist front="What is LTP?" back="Synapses strengthen." />);
    const select = await screen.findByLabelText('Translation language');
    fireEvent.change(select, { target: { value: 'fr' } });
    fireEvent.click(screen.getByRole('button', { name: /Translate/ }));
    await waitFor(() =>
      expect(g.Translator.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'fr' }),
      ),
    );
    expect(await screen.findByText('Las sinapsis se fortalecen.')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('auramind_localAiLanguage') ?? '""')).toBe('fr');
  });
});
