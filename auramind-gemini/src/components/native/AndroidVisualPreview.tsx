import React from "react";
import { useSearchParams } from "react-router-dom";
import type { Card, Deck, UserProfile } from "../../types";
import { DashboardWorkspaceProvider } from "../../contexts/DashboardWorkspaceContext";
import AndroidBottomNav from "./AndroidBottomNav";
import AndroidMobileTopBar from "./AndroidMobileTopBar";
import { AndroidLibrary, AndroidOverview, AndroidStudy } from "./AndroidMobileScreens";
import AndroidGeneratorScreen from "./AndroidGeneratorScreen";
import AndroidSettingsScreen from "./AndroidSettingsScreen";

const PREVIEW_USER: UserProfile = {
  id: "android-visual-preview",
  name: "Alex Morgan",
  email: "alex@example.com",
  plan: "Starter",
  streak: 12,
  streakFreezes: 2,
  joinedDate: Date.now(),
  isEmailVerified: true,
  isPhoneVerified: false,
};

const PREVIEW_DECKS: Deck[] = [
  {
    id: "preview-neuro",
    title: "Neuroscience foundations",
    description: "Core concepts",
    createdAt: Date.now(),
    cardCount: 18,
  },
  {
    id: "preview-spanish",
    title: "Spanish conversation",
    description: "Everyday phrases",
    createdAt: Date.now(),
    cardCount: 12,
  },
];

const PREVIEW_CARDS: Card[] = [
  {
    id: "preview-1",
    deckId: "preview-neuro",
    front: "What is long-term potentiation?",
    back: "A persistent strengthening of synapses after repeated stimulation.",
    repetition: 2,
    nextReview: Date.now() - 3_600_000,
    lastReviewed: Date.now() - 86_400_000,
  },
  {
    id: "preview-2",
    deckId: "preview-neuro",
    front: "What does the hippocampus support?",
    back: "Memory consolidation and spatial navigation.",
    repetition: 0,
    nextReview: Date.now() - 7_200_000,
  },
  {
    id: "preview-3",
    deckId: "preview-spanish",
    front: "How do you say “see you soon”?",
    back: "Hasta pronto.",
    repetition: 3,
    nextReview: Date.now() + 86_400_000,
    lastReviewed: Date.now() - 43_200_000,
  },
];

/** What the top bar says on each screen in the real app (see AndroidMobileTopBar). */
const SCREEN_TITLES: Record<string, string> = {
  home: "Today",
  library: "Library",
  study: "Study",
  generator: "Create",
  settings: "Settings",
};

function PreviewScreen({ screen }: { screen: string }) {
  if (screen === "library") return <AndroidLibrary />;
  if (screen === "study") return <AndroidStudy />;
  if (screen === "generator") return <AndroidGeneratorScreen />;
  if (screen === "settings") return <AndroidSettingsScreen />;
  return <AndroidOverview />;
}

export default function AndroidVisualPreview() {
  const [params] = useSearchParams();
  const screen = params.get("screen") || "home";

  return (
    <DashboardWorkspaceProvider
      user={PREVIEW_USER}
      decks={PREVIEW_DECKS}
      cards={PREVIEW_CARDS}
      createDeck={async () => PREVIEW_DECKS[0]}
      deleteDeck={async () => undefined}
      addCardsToDeck={async (_deckId, cards) => cards.length}
      updateProfile={async () => undefined}
      onLogout={() => undefined}
    >
      <div className="nova-shell android-mobile-shell" data-testid="android-preview-shell">
        <div className="android-mobile-app-column">
          <AndroidMobileTopBar user={PREVIEW_USER} title={SCREEN_TITLES[screen] ?? SCREEN_TITLES.home} />
          <main className="android-mobile-main scrollbar-thin overflow-y-auto">
            <div className="android-mobile-content">
              <PreviewScreen screen={screen} />
            </div>
          </main>
        </div>
        <AndroidBottomNav />
      </div>
    </DashboardWorkspaceProvider>
  );
}
