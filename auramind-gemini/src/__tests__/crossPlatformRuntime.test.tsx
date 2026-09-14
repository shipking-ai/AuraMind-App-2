import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTTS } from "../hooks/useTTS";
import { setAppPreference } from "../lib/appPreferences";
import { MemoryRouter } from "react-router-dom";
import { AndroidLibrary } from "../components/native/AndroidMobileScreens";
import { DashboardWorkspaceProvider } from "../contexts/DashboardWorkspaceContext";
import type { Card, Deck, UserProfile } from "../types";

class FakeUtterance {
  rate = 1;
  pitch = 1;
  voice?: SpeechSynthesisVoice;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public text: string) {}
}

function TtsProbe() {
  const tts = useTTS();
  return (
    <div>
      <span data-testid="enabled">{String(tts.isEnabled)}</span>
      <button type="button" onClick={tts.toggle}>
        Toggle
      </button>
      <button type="button" onClick={() => tts.speak("Hello from Aura")}>
        Speak
      </button>
    </div>
  );
}

describe("cross-platform runtime preferences", () => {
  const speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    });
    speechSynthesis.cancel.mockClear();
    speechSynthesis.speak.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the shared Settings preference for chat voice output", async () => {
    setAppPreference("auramind_textToSpeech", false);
    render(<TtsProbe />);

    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => expect(screen.getByTestId("enabled")).toHaveTextContent("true"));
    expect(localStorage.getItem("auramind_textToSpeech")).toBe("true");
    expect(localStorage.getItem("auramind.tts.enabled.v1")).toBeNull();

    act(() => {
      setAppPreference("auramind_textToSpeech", false);
    });
    await waitFor(() => expect(screen.getByTestId("enabled")).toHaveTextContent("false"));
  });

  it("does not attempt speech until the shared preference is enabled", async () => {
    render(<TtsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(speechSynthesis.speak).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await waitFor(() => expect(screen.getByTestId("enabled")).toHaveTextContent("true"));
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it("uses an in-app Android dialog for deck creation and deletion", async () => {
    const deck: Deck = {
      id: "deck-1",
      title: "Intro deck",
      description: "",
      createdAt: Date.now(),
      cardCount: 0,
    };
    const user: UserProfile = {
      id: "user-1",
      name: "Alex Morgan",
      email: "alex@example.com",
      plan: "Starter",
      streak: 1,
      streakFreezes: 2,
      joinedDate: Date.now(),
      isEmailVerified: true,
      isPhoneVerified: false,
    };
    const createDeck = vi.fn(async () => deck);
    const deleteDeck = vi.fn(async () => undefined);
    const cards: Card[] = [];

    render(
      <MemoryRouter>
        <DashboardWorkspaceProvider
          user={user}
          decks={[deck]}
          cards={cards}
          createDeck={createDeck}
          deleteDeck={deleteDeck}
          addCardsToDeck={async () => 0}
          updateProfile={async () => undefined}
          onLogout={() => undefined}
        >
          <AndroidLibrary />
        </DashboardWorkspaceProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create deck" }));
    const createDialog = await screen.findByRole("dialog", { name: "Give it a home" });
    expect(within(createDialog).getByLabelText("New deck name")).toBeInTheDocument();
    fireEvent.change(within(createDialog).getByLabelText("New deck name"), {
      target: { value: "New topic" },
    });
    fireEvent.click(within(createDialog).getByRole("button", { name: "Create deck" }));
    await waitFor(() => expect(createDeck).toHaveBeenCalledWith("New topic", ""));

    // Delete is behind the deck's action sheet, then a confirmation sheet —
    // never a bare icon on the row.
    expect(screen.queryByRole("button", { name: "Delete Intro deck" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Intro deck" }));
    const actions = await screen.findByRole("dialog", { name: "Intro deck" });
    fireEvent.click(within(actions).getByRole("button", { name: /Delete deck/ }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Delete Intro deck?" });
    expect(deleteDialog).toHaveTextContent("This action cannot be undone.");
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete deck" }));
    await waitFor(() => expect(deleteDeck).toHaveBeenCalledWith("deck-1"));
  });
});
