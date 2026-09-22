import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IOSStudySession, formatInterval } from "../components/ios/IOSStudySession";
import { IOSChatView } from "../components/ios/IOSChatView";
import { Brain } from "../components/icons";
import { Rating, type Card } from "../types";

const CARD = {
  id: "c1",
  deckId: "d1",
  front: "What is LTP?",
  back: "Lasting synaptic strengthening.",
} as Card;

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

describe("formatInterval", () => {
  it("reads like a clock: minutes, days, months, years", () => {
    expect(formatInterval(10 / 1440)).toBe("10m");
    expect(formatInterval(3)).toBe("3d");
    expect(formatInterval(45)).toBe("6w");
    expect(formatInterval(60)).toBe("2mo");
    expect(formatInterval(730)).toBe("2.0y");
  });
});

describe("IOSStudySession", () => {
  it("shows the question and progress, and asks for a tap before grading", () => {
    session(false);
    expect(screen.getAllByText("What is LTP?").length).toBeGreaterThan(0);
    expect(screen.getByText("3 of 10")).toBeTruthy();
    expect(screen.getByText("Tap the card to see the answer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Good/ })).toBeNull();
  });

  it("offers four grades with when-it-returns labels once flipped", () => {
    const { onRate } = session(true);
    expect(screen.getByRole("button", { name: /Again\s*10m/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Easy\s*6w/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Good\s*3d/ }));
    expect(onRate).toHaveBeenCalledWith(Rating.GOOD);
  });
});

describe("IOSChatView", () => {
  const base = {
    messages: [],
    isStreaming: false,
    input: "",
    setInput: () => {},
    onSend: vi.fn(),
    onSendPrompt: vi.fn(),
    onAbort: () => {},
    onNewChat: () => {},
    onSaveCard: () => {},
    onAnswerQuiz: () => {},
    onMakeCard: vi.fn(async () => true),
    decks: [],
    selectedDeckId: "",
    onSelectDeck: () => {},
    starters: [{ icon: Brain, label: "Quiz me", prompt: "Quiz me on neuro", detail: "9 due" }],
    listening: false,
    liveTranscript: "",
    onToggleMic: () => {},
    onHoldStart: vi.fn(),
    onHoldEnd: vi.fn(),
    speaking: false,
    onToggleSpeaking: () => {},
    voicePlaying: false,
  };
  const answer = {
    id: "m2",
    role: "assistant" as const,
    content:
      "Long-term potentiation is **synaptic strengthening** after repeated firing.\n\n- Needs NMDA receptors\n- Lasts hours to weeks",
    rawContent: "",
    hasSaveCard: false,
    timestamp: new Date(),
  };
  const question = {
    id: "m1",
    role: "user" as const,
    content: "What is LTP?",
    rawContent: "",
    hasSaveCard: false,
    timestamp: new Date(),
  };

  beforeEach(() => window.localStorage.clear());

  it("offers Talk, Notebook and Cards, starting in Notebook", () => {
    render(<IOSChatView {...base} />);
    expect(screen.getByRole("tab", { name: "Notebook" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: "Talk" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Cards" })).toBeTruthy();
    expect(screen.getByText(/Ask a question in the margin/)).toBeTruthy();
  });

  it("Notebook: tapping a highlighted term makes a card from its sentence", async () => {
    const onMakeCard = vi.fn(async () => true);
    render(<IOSChatView {...base} messages={[question, answer]} onMakeCard={onMakeCard} />);
    fireEvent.click(screen.getByText("synaptic strengthening"));
    await waitFor(() =>
      expect(onMakeCard).toHaveBeenCalledWith(
        "What is synaptic strengthening?",
        expect.stringContaining("after repeated firing"),
      ),
    );
  });

  it("Cards: splits an answer into swipeable cards that save with the question", async () => {
    const onMakeCard = vi.fn(async () => true);
    render(<IOSChatView {...base} messages={[question, answer]} onMakeCard={onMakeCard} />);
    fireEvent.click(screen.getByRole("tab", { name: "Cards" }));
    expect(await screen.findByText("The idea")).toBeTruthy();
    expect(screen.getByText("Key points")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Save card/ })[0]);
    await waitFor(() =>
      expect(onMakeCard).toHaveBeenCalledWith(
        "What is LTP?",
        expect.stringContaining("synaptic strengthening"),
      ),
    );
  });

  it("Talk: holding the big button listens, releasing sends", async () => {
    const onHoldStart = vi.fn();
    const onHoldEnd = vi.fn();
    render(<IOSChatView {...base} onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} />);
    fireEvent.click(screen.getByRole("tab", { name: "Talk" }));
    const hold = await screen.findByRole("button", { name: "Hold to talk" });
    fireEvent.pointerDown(hold, { pointerId: 1 });
    expect(onHoldStart).toHaveBeenCalled();
    fireEvent.pointerUp(hold, { pointerId: 1 });
    expect(onHoldEnd).toHaveBeenCalled();
  });

  it("shows the send button only when there is text", () => {
    const onSend = vi.fn();
    const { rerender } = render(<IOSChatView {...base} />);
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    rerender(<IOSChatView {...base} input="Explain LTP" onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalled();
  });
});
