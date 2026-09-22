import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IOSStudySession, formatInterval } from '../components/ios/IOSStudySession';
import { IOSChatView } from '../components/ios/IOSChatView';
import { Brain } from '../components/icons';
import { Rating, type Card } from '../types';

const CARD = { id: 'c1', deckId: 'd1', front: 'What is LTP?', back: 'Lasting synaptic strengthening.' } as Card;

function session(flipped: boolean, onRate = vi.fn(), onFlip = vi.fn()) {
  render(
    <IOSStudySession
      deckTitle="Neuro"
      deckId="d1"
      card={CARD}
      index={2}
      total={10}
      flipped={flipped}
      onFlip={onFlip}
      onRate={onRate}
      onExit={() => {}}
      intervals={{ [Rating.AGAIN]: 0.007, [Rating.GOOD]: 3, [Rating.EASY]: 45 }}
      voiceMode={false}
      onToggleVoice={() => {}}
    />,
  );
  return { onRate, onFlip };
}

describe('formatInterval', () => {
  it('reads like a clock: minutes, days, months, years', () => {
    expect(formatInterval(10 / 1440)).toBe('10m');
    expect(formatInterval(3)).toBe('3d');
    expect(formatInterval(60)).toBe('2mo');
    expect(formatInterval(730)).toBe('2.0y');
  });
});

describe('IOSStudySession', () => {
  it('shows the question and progress, and asks for a tap before grading', () => {
    session(false);
    expect(screen.getAllByText('What is LTP?').length).toBeGreaterThan(0);
    expect(screen.getByText('3 of 10')).toBeTruthy();
    expect(screen.getByText('Tap the card to see the answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Good/ })).toBeNull();
  });

  it('offers four grades with when-it-returns labels once flipped', () => {
    const { onRate } = session(true);
    expect(screen.getByRole('button', { name: /Again\s*10m/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Easy\s*2mo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Good\s*3d/ }));
    expect(onRate).toHaveBeenCalledWith(Rating.GOOD);
  });
});

describe('IOSChatView', () => {
  const base = {
    messages: [],
    isStreaming: false,
    setInput: () => {},
    onSend: vi.fn(),
    onSendPrompt: vi.fn(),
    onAbort: () => {},
    onNewChat: () => {},
    onSaveCard: () => {},
    onAnswerQuiz: () => {},
    decks: [],
    selectedDeckId: '',
    onSelectDeck: () => {},
    starters: [{ icon: Brain, label: 'Quiz me', prompt: 'Quiz me on neuro', detail: '9 due' }],
    listening: false,
    onToggleMic: () => {},
    speaking: false,
    onToggleSpeaking: () => {},
  };

  it('starts with suggestions that send their prompt', () => {
    const onSendPrompt = vi.fn();
    render(<IOSChatView {...base} input="" onSendPrompt={onSendPrompt} />);
    fireEvent.click(screen.getByRole('button', { name: /Quiz me/ }));
    expect(onSendPrompt).toHaveBeenCalledWith('Quiz me on neuro');
    // Empty field shows the mic, not the send button.
    expect(screen.getByRole('button', { name: 'Dictate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('shows a send button once there is text, and renders bubbles', () => {
    const onSend = vi.fn();
    render(
      <IOSChatView
        {...base}
        input="Explain LTP"
        onSend={onSend}
        messages={[
          { id: 'm1', role: 'user', content: 'Hi', rawContent: 'Hi', hasSaveCard: false, timestamp: new Date() },
          { id: 'm2', role: 'assistant', content: 'Hello **there**', rawContent: '', hasSaveCard: true, timestamp: new Date() },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalled();
    expect(screen.getByText('Hi')).toBeTruthy();
    expect(screen.getByText('there')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save as card/ })).toBeTruthy();
  });
});
