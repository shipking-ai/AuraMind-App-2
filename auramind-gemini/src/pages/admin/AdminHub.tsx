/**
 * AdminHub — the unified /admin entry point.
 *
 * Every /admin/* path renders inside NovaDashboardShell (same sidebar/top-bar
 * chrome as /dashboard/*), with the shell switching to its admin mode via
 * `isOnAdminRoute` (rose Vault theme + Admin nav section). Previously /admin
 * mounted a standalone AdminShell with no sidebar, so the sidebar visibly
 * "disappeared" on admin pages and the shell's admin-aware branches were
 * dead code. Role-gating stays one level up in App.tsx.
 */
import React from "react";
import { Outlet } from "react-router-dom";
import type { UserProfile, Deck, Card } from "../../types";
import { DashboardWorkspaceProvider } from "../../contexts/DashboardWorkspaceContext";
import { NovaDashboardShell } from "../../components/dashboard/nova/NovaDashboardShell";

export interface AdminHubProps {
  user: UserProfile;
  decks: Deck[];
  cards: Card[];
  createDeck: (title: string, description: string) => Promise<Deck | null>;
  deleteDeck: (id: string) => Promise<void>;
  addCardsToDeck: (deckId: string, newCards: any[]) => Promise<number | undefined>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onLogout: () => void;
}

const AdminHub: React.FC<AdminHubProps> = (props) => {
  const {
    user, decks, cards,
    createDeck, deleteDeck, addCardsToDeck,
    updateProfile, onLogout,
  } = props;

  return (
    <DashboardWorkspaceProvider
      user={user}
      decks={decks}
      cards={cards}
      createDeck={createDeck}
      deleteDeck={deleteDeck}
      addCardsToDeck={addCardsToDeck}
      updateProfile={updateProfile}
      onLogout={onLogout}
    >
      <NovaDashboardShell>
        <Outlet />
      </NovaDashboardShell>
    </DashboardWorkspaceProvider>
  );
};

export default AdminHub;
