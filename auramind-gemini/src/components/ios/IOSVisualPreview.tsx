/**
 * The iPhone screens with sample data, for screenshots from the cloud
 * simulator (no account or network needed). Mounted at /__preview/ios in dev
 * builds and in the CI screenshot build (VITE_IOS_PREVIEW=true), never in a
 * release build.
 *
 * `?tour=1` walks through every screen on a fixed schedule so the simulator
 * can be photographed without tapping: see .github/workflows/mobile-ios.yml.
 */
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Card, Deck, UserProfile } from "../../types";
import { DashboardWorkspaceProvider } from "../../contexts/DashboardWorkspaceContext";
import { IOSShell } from "./IOSShell";
import { IOSLibrary, IOSStudy, IOSToday } from "./IOSScreens";
import IOSSettingsScreen from "./IOSSettingsScreen";
import IOSWelcomeScreen from "./IOSWelcomeScreen";

export const IOS_PREVIEW_BASE = "/__preview/ios";

/** Screens in tour order, and how long each stays up (ms). */
export const IOS_PREVIEW_TOUR = ["/welcome", "", "/decks", "/study", "/settings"];
export const IOS_PREVIEW_STEP_MS = 6000;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const USER: UserProfile = {
  id: "00000000-0000-4000-8000-00000000105a",
  name: "Alex Morgan",
  email: "alex@example.com",
  plan: "Pro",
  streak: 12,
  streakFreezes: 2,
  joinedDate: now - 90 * DAY,
  isEmailVerified: true,
  isPhoneVerified: false,
};

const DECKS: Deck[] = [
  {
    id: "neuro",
    title: "Neuroscience Foundations",
    description: "",
    createdAt: now,
    cardCount: 48,
  },
  { id: "spanish", title: "Spanish Conversation", description: "", createdAt: now, cardCount: 120 },
  {
    id: "pharm",
    title: "Pharmacology: Cardio Drugs",
    description: "",
    createdAt: now,
    cardCount: 36,
  },
  { id: "hist", title: "US History 1865–1945", description: "", createdAt: now, cardCount: 64 },
  { id: "sql", title: "SQL Window Functions", description: "", createdAt: now, cardCount: 22 },
];

function makeCards(): Card[] {
  const plan: Array<[string, number, number, number]> = [
    // deckId, due, reviewedToday, mastered
    ["neuro", 9, 6, 20],
    ["spanish", 14, 5, 70],
    ["pharm", 4, 3, 8],
    ["hist", 0, 2, 50],
    ["sql", 2, 0, 20],
  ];
  const cards: Card[] = [];
  for (const [deckId, due, reviewed, mastered] of plan) {
    const total = DECKS.find((d) => d.id === deckId)!.cardCount;
    for (let i = 0; i < total; i++) {
      const isDue = i < due;
      cards.push({
        id: `${deckId}-${i}`,
        deckId,
        front: `Card ${i + 1}`,
        back: "Answer",
        repetition: i < mastered + due ? 3 : 1,
        lapses: 0,
        nextReview: isDue ? now - HOUR : now + 3 * DAY,
        lastReviewed: i >= due && i < due + reviewed ? now - HOUR : now - 3 * DAY,
      } as Card);
    }
  }
  return cards;
}

const CARDS = makeCards();

function Tour() {
  const navigate = useNavigate();
  const location = useLocation();
  const touring = new URLSearchParams(location.search).get("tour") === "1";
  useEffect(() => {
    if (!touring) return;
    const timers = IOS_PREVIEW_TOUR.map((path, i) =>
      window.setTimeout(
        () => navigate(`${IOS_PREVIEW_BASE}${path}?tour=1`),
        i * IOS_PREVIEW_STEP_MS,
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Runs once per tour start; the tour drives its own navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring]);
  return null;
}

export default function IOSVisualPreview() {
  return (
    <DashboardWorkspaceProvider
      user={USER}
      decks={DECKS}
      cards={CARDS}
      createDeck={async () => DECKS[0]}
      deleteDeck={async () => undefined}
      addCardsToDeck={async (_deckId, cards) => cards.length}
      updateProfile={async () => undefined}
      onLogout={() => undefined}
    >
      <Tour />
      <Routes>
        <Route path="welcome" element={<IOSWelcomeScreen />} />
        <Route
          path="*"
          element={
            <IOSShell bleed={false} basePath={IOS_PREVIEW_BASE}>
              <Routes>
                <Route index element={<IOSToday />} />
                <Route path="decks" element={<IOSLibrary />} />
                <Route path="study" element={<IOSStudy />} />
                <Route path="settings" element={<IOSSettingsScreen />} />
                <Route path="*" element={<Navigate to={IOS_PREVIEW_BASE} replace />} />
              </Routes>
            </IOSShell>
          }
        />
      </Routes>
    </DashboardWorkspaceProvider>
  );
}
