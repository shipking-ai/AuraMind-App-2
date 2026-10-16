/**
 * Dev-only visual harness for the Windows app's screens (/__e2e/windows),
 * like /__e2e/android: sample data, no sign-in. `?screen=` picks the screen
 * (today, library, session, answer, complete, settings, chat, create).
 * scripts/capture-windows-screens.mjs screenshots it with a stubbed Tauri
 * runtime so the light and dark Windows looks can be checked without an
 * account.
 */
import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardWorkspaceProvider } from '../../contexts/DashboardWorkspaceContext';
import { Rating, type Card, type Deck, type UserProfile } from '../../types';
import { WindowsShell } from './WindowsShell';
import { WindowsToday } from './WindowsToday';
import { WindowsLibrary } from './WindowsLibrary';
import { WindowsSettings } from './WindowsSettings';
import { WindowsStudyComplete, WindowsStudySession } from './WindowsStudySession';

const AIChatPage = React.lazy(() => import('../chat/AIChatPage'));
const GeneratorPage = React.lazy(() => import('../../pages/generator/GeneratorPage'));

const NOW = Date.now();
const DAY = 86_400_000;

const USER = {
  id: 'windows-visual-preview',
  name: 'Matt Smith',
  email: 'matt@example.com',
  plan: 'Pro',
  streak: 12,
  streakFreezes: 0,
  joinedDate: NOW,
  isEmailVerified: true,
  isPhoneVerified: false,
} as UserProfile;

const DECKS: Deck[] = [
  ['bio', 'Biology 101'],
  ['spa', 'Spanish A2'],
  ['his', 'World History'],
  ['chem', 'Organic Chemistry'],
].map(([id, title]) => ({ id, title, description: '', createdAt: NOW - 40 * DAY, cardCount: 0 }));

function cards(deckId: string, due: number, later: number, studiedDaysAgo: number): Card[] {
  return Array.from({ length: due + later }, (_, i) => ({
    id: `${deckId}-${i}`,
    deckId,
    front: `Question ${i + 1}`,
    back: `Answer ${i + 1}`,
    nextReview: i < due ? NOW - 3_600_000 : NOW + 2 * DAY,
    lastReviewed: NOW - studiedDaysAgo * DAY,
  }) as unknown as Card);
}

const CARDS: Card[] = [...cards('bio', 12, 30, 1), ...cards('spa', 8, 40, 2), ...cards('his', 4, 20, 5), ...cards('chem', 0, 25, 9)];

const SESSION_CARD = { id: 'c1', deckId: 'bio', front: 'What does the mitochondria produce?', back: "ATP — the cell's main energy currency" } as unknown as Card;
const INTERVALS = { [Rating.AGAIN]: 0.007, [Rating.HARD]: 1, [Rating.GOOD]: 3, [Rating.EASY]: 8 };
const noop = () => undefined;

function Screen({ screen }: { screen: string }) {
  switch (screen) {
    case 'library': return <WindowsLibrary />;
    case 'settings': return <WindowsSettings />;
    case 'session':
    case 'answer':
      return (
        <WindowsStudySession
          deckTitle="Biology 101" card={SESSION_CARD} index={8} total={24}
          flipped={screen === 'answer'} onFlip={noop} onRate={noop} onExit={noop} intervals={INTERVALS}
        />
      );
    case 'complete':
      return <WindowsStudyComplete deckTitle="Biology 101" reviewed={24} correct={21} elapsedMs={492_000} onRestart={noop} onDone={noop} />;
    case 'chat': return <AIChatPage />;
    case 'create': return <GeneratorPage />;
    default: return <WindowsToday />;
  }
}

export default function WindowsVisualPreview() {
  const [params] = useSearchParams();
  const screen = params.get('screen') || 'today';
  return (
    <DashboardWorkspaceProvider
      user={USER}
      decks={DECKS}
      cards={CARDS}
      createDeck={async () => DECKS[0]}
      deleteDeck={async () => undefined}
      addCardsToDeck={async (_deckId, added) => added.length}
      updateProfile={async () => undefined}
      onLogout={noop}
    >
      <WindowsShell>
        <Suspense fallback={null}>
          <Screen screen={screen} />
        </Suspense>
      </WindowsShell>
    </DashboardWorkspaceProvider>
  );
}
