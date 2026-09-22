/**
 * A sample Prof. Aura conversation for the iOS preview screens, so each chat
 * mode can be seen with real content without calling the AI. Preview only
 * (see IOSVisualPreview); the live chat is AIChatPage.
 */
import { useParams } from "react-router-dom";
import type { Message } from "../../hooks/useAIChat";
import { Brain, Lightbulb, Pencil } from "../icons";
import { IOSChatView, type AuraChatMode, AURA_CHAT_MODE_KEY } from "./IOSChatView";

const MESSAGES: Message[] = [
  {
    id: "q1",
    role: "user",
    content: "Why does long-term potentiation last so long?",
    rawContent: "",
    hasSaveCard: false,
    timestamp: new Date(),
  },
  {
    id: "a1",
    role: "assistant",
    content:
      "Because the synapse physically changes. Strong stimulation opens **NMDA receptors**, and the calcium that rushes in tells the neuron to add more **AMPA receptors** to that synapse — so the next signal lands harder.\n\n" +
      "- Early LTP lasts hours: existing receptors are moved into place\n- Late LTP lasts days to weeks: new proteins are built\n\n" +
      "Think of it as widening a path you walk every day — the more you use it, the easier it gets.",
    rawContent: "",
    hasSaveCard: true,
    timestamp: new Date(),
    quizBlock: {
      question: "What lets calcium into the cell during LTP?",
      options: ["AMPA receptors", "NMDA receptors", "Myelin", "GABA"],
      correctIndex: 1,
    },
  },
];

const STARTERS = [
  { icon: Brain, label: "Quiz me on Neuroscience", prompt: "", detail: "9 cards due" },
  { icon: Lightbulb, label: "Explain a concept", prompt: "", detail: "Deep dive" },
  { icon: Pencil, label: "Generate flashcards", prompt: "", detail: "Auto-save" },
];

export default function IOSChatDemo() {
  const { mode = "notebook", state } = useParams<{ mode: AuraChatMode; state?: string }>();
  // The view reads its mode from the saved preference on mount.
  try {
    window.localStorage.setItem(AURA_CHAT_MODE_KEY, JSON.stringify(mode));
  } catch {
    /* preview only */
  }
  const empty = state === "empty";
  return (
    <IOSChatView
      key={`${mode}-${state ?? ""}`}
      messages={empty ? [] : MESSAGES}
      isStreaming={false}
      input=""
      setInput={() => {}}
      onSend={() => {}}
      onSendPrompt={() => {}}
      onAbort={() => {}}
      onNewChat={() => {}}
      onSaveCard={() => {}}
      onAnswerQuiz={() => {}}
      onMakeCard={async () => true}
      decks={[
        {
          id: "neuro",
          title: "Neuroscience Foundations",
          description: "",
          createdAt: 0,
          cardCount: 48,
        },
      ]}
      selectedDeckId="neuro"
      onSelectDeck={() => {}}
      starters={STARTERS}
      listening={state === "listening"}
      liveTranscript={state === "listening" ? "Why does long-term potentiation" : ""}
      onToggleMic={() => {}}
      onHoldStart={() => {}}
      onHoldEnd={() => {}}
      speaking
      onToggleSpeaking={() => {}}
      voicePlaying={state === "speaking"}
    />
  );
}
