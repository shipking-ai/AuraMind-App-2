import React, { useEffect, useRef, useState } from "react";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import { describeShare, takeStagedShare } from "../../lib/shareTarget";
import { auraAiClient } from "../../services/api/auraAiService";
import { extractStudyAssetText } from "../../services/import/documentImportService";
import { transcribeAudio } from "../../services/api/groqService";
import { supabase } from "../../services/database/supabase";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import type { FlashcardData, Quiz } from "../../types";
import {
  BookOpen,
  Check,
  FileText,
  Globe,
  Mic,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
  X,
} from "@/components/icons";
import { toast } from "sonner";
import { useAppPreference } from "../../lib/appPreferences";
import { toastError } from "../../lib/errorToast";
import { hapticError, hapticSelection, hapticSuccess, hapticTap } from "./androidHaptics";

type GeneratorKind = "flashcards" | "quiz" | "presentation";
type SourceKind = "topic" | "url" | "youtube" | "file" | "audio";
type Difficulty = "easy" | "medium" | "hard" | "mixed";

type GeneratedPresentation = {
  title: string;
  slides: { title: string; bullets: string[]; script: string }[];
};

const KIND_OPTIONS: { value: GeneratorKind; label: string; detail: string }[] = [
  { value: "flashcards", label: "Flashcards", detail: "Fast recall cards" },
  { value: "quiz", label: "Quiz", detail: "Multiple choice" },
  { value: "presentation", label: "Slides", detail: "Narrated outline" },
];

const SOURCE_OPTIONS: {
  value: SourceKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "topic", label: "Topic", icon: Sparkles },
  { value: "url", label: "Web page", icon: Globe },
  { value: "youtube", label: "Video", icon: Play },
  { value: "file", label: "Document", icon: FileText },
  { value: "audio", label: "Voice memo", icon: Mic },
];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "mixed"];

function parseJsonResponse(content: string): any {
  const cleaned = content
    .replace(/```json\s*/i, "")
    .replace(/```/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Aura returned an unreadable response.");
  try {
    return JSON.parse(match[0]);
  } catch {
    return JSON.parse(match[0].replace(/,\s*([\]}])/g, "$1"));
  }
}

function NativePanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`android-native-panel ${className}`}>{children}</section>;
}

export default function AndroidGeneratorScreen() {
  const workspace = useDashboardWorkspace();
  const recorder = useAudioRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<GeneratorKind>("flashcards");
  const [source, setSource] = useState<SourceKind>("topic");
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  /**
   * Pick up content shared in from another app.
   *
   * The root listener consumes the native share and parks it; this reads it
   * once on mount. Runs before any user input, so nothing can be overwritten.
   *
   * The mapping matters. A shared URL is a source still to be fetched, so it
   * goes in `topic` where the import flow reads it, and YouTube gets its own
   * kind because the transcript endpoint differs. A shared passage is already
   * the material, so it goes straight into `sourceText` — which grounds
   * generation regardless of source kind and marks the form ready, meaning a
   * highlighted paragraph becomes a deck without another tap.
   */
  useEffect(() => {
    const share = takeStagedShare();
    if (!share) return;
    const { mode, value, title } = describeShare(share);

    if (mode === 'url') {
      const isVideo = /youtube\.com|youtu\.be/i.test(value);
      setSource(isVideo ? 'youtube' : 'url');
      setTopic(value);
      if (title) setSourceTitle(title);
      return;
    }

    if (mode === 'file') {
      // A content:// grant lives only for this launch and cannot be read from
      // JS, so the file is not silently imported. Naming it and switching to
      // the file source tells the user what arrived and what to do next.
      setSource('file');
      setSourceTitle(title || 'Shared file');
      return;
    }

    if (!value) return;
    setSourceText(value);
    setSourceTitle(title || 'Shared text');
    // A deck still needs a name. The sender's title is the best one available;
    // failing that, the opening words of the passage beat an empty field.
    setTopic(title || value.slice(0, 60).replace(/\s+\S*$/, ''));
  }, []);
  const [cardsPerGeneration] = useAppPreference("auramind_cardsPerGen", "20");
  const [includeExamples] = useAppPreference("auramind_includeExamples", true);
  const [defaultLanguage] = useAppPreference("auramind_defaultLanguage", "English");
  const [loadingSource, setLoadingSource] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardData[] | null>(null);
  const [presentation, setPresentation] = useState<GeneratedPresentation | null>(null);

  useEffect(() => {
    const preferredCount = Number(cardsPerGeneration);
    if (Number.isFinite(preferredCount) && preferredCount > 0) {
      setCount(Math.min(30, Math.max(5, preferredCount)));
    }
  }, [cardsPerGeneration]);

  const clearGenerated = () => {
    setQuiz(null);
    setFlashcards(null);
    setPresentation(null);
  };

  const selectSource = (next: SourceKind) => {
    hapticSelection();
    setSource(next);
    setError(null);
    if (next !== "topic") setSourceText("");
  };

  const handleFile = async (file: File) => {
    setLoadingSource(true);
    setError(null);
    try {
      const text = await extractStudyAssetText(file);
      if (!text.trim()) throw new Error("No readable text was found in that file.");
      setSourceText(text);
      setSourceTitle(file.name);
      setTopic(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`Imported ${file.name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that file.");
    } finally {
      setLoadingSource(false);
    }
  };

  const handleRemoteSource = async () => {
    if (!topic.trim()) return;
    setLoadingSource(true);
    setError(null);
    try {
      const endpoint = source === "youtube" ? "/api/fetch-youtube-transcript" : "/api/fetch-url";
      const { data: { session } } = await supabase!.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: topic.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.text) {
        throw new Error(data.error || data.data?.error || "Could not import that source.");
      }
      setSourceText(data.data.text);
      setSourceTitle(data.data.title || topic.trim());
      toast.success(source === "youtube" ? "Video transcript imported" : "Web page imported");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import that source.");
    } finally {
      setLoadingSource(false);
    }
  };

  const handleAudioFile = async (file: File) => {
    setLoadingSource(true);
    setError(null);
    try {
      const text = await transcribeAudio(file, file.type);
      if (!text.trim()) throw new Error("No speech was detected in that recording.");
      setSourceText(text);
      setSourceTitle(file.name);
      setTopic(file.name.replace(/\.[^.]+$/, ""));
      toast.success("Voice memo transcribed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not transcribe that recording.");
    } finally {
      setLoadingSource(false);
    }
  };

  const finishRecording = async () => {
    const blob = await recorder.stop();
    if (!blob) return;
    setLoadingSource(true);
    setError(null);
    try {
      const text = await transcribeAudio(blob, blob.type);
      if (!text.trim()) throw new Error("No speech was detected in that recording.");
      setSourceText(text);
      setSourceTitle("Voice memo");
      setTopic("Voice memo");
      recorder.clear();
      toast.success("Recording transcribed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not transcribe your recording.");
    } finally {
      setLoadingSource(false);
    }
  };

  const generate = async () => {
    const label = sourceTitle || topic.trim();
    if (!label) {
      setError("Add a topic or import a source first.");
      return;
    }
    setGenerating(true);
    setError(null);
    clearGenerated();
    const sourceContext = sourceText
      ? `\n\nGround the output in this source material:\n${sourceText.slice(0, 30000)}`
      : "";
    const difficultyText =
      difficulty === "mixed" ? "a balanced mix of easy, medium, and hard" : difficulty;
    const languageInstruction =
      defaultLanguage.toLowerCase() === "english"
        ? ""
        : ` Write all generated content in ${defaultLanguage}.`;
    const exampleInstruction = includeExamples
      ? " Include a concise concrete example whenever it improves understanding."
      : " Prefer direct definitions and do not add optional examples.";
    const prompt =
      kind === "presentation"
        ? `Create a ${count}-slide presentation about "${label}" at ${difficultyText} difficulty. Each slide needs a title, 3-5 bullets, and a short narrator script.${languageInstruction}${exampleInstruction} Return JSON only: {"title":"...","slides":[{"title":"...","bullets":["..."],"script":"..."}]}${sourceContext}`
        : kind === "quiz"
          ? `Create ${count} multiple-choice questions about "${label}" at ${difficultyText} difficulty.${languageInstruction}${exampleInstruction} Return JSON only: {"questions":[{"id":"1","question":"...","options":["..."],"correctAnswer":0,"explanation":"..."}]}${sourceContext}`
          : `Create ${count} useful flashcards about "${label}" at ${difficultyText} difficulty.${languageInstruction}${exampleInstruction} Return JSON only: {"cards":[{"question":"...","answer":"...","difficulty":"easy|medium|hard"}]}${sourceContext}`;

    try {
      const response = await auraAiClient.chatCompletion({
        messages: [
          {
            role: "system",
            content: "You create accurate study materials. Return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });
      const parsed = parseJsonResponse(response.choices[0]?.message?.content || "");
      hapticSuccess();
      if (kind === "quiz" && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        setQuiz({
          id: crypto.randomUUID(),
          title: `${label} Quiz`,
          topic: label,
          difficulty: difficulty === "mixed" ? "medium" : difficulty,
          questions: parsed.questions,
        });
      } else if (
        kind === "presentation" &&
        Array.isArray(parsed.slides) &&
        parsed.slides.length > 0
      ) {
        setPresentation({ title: parsed.title || `${label} Presentation`, slides: parsed.slides });
      } else if (kind === "flashcards" && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
        setFlashcards(parsed.cards);
      } else {
        throw new Error("Aura did not return enough study material.");
      }
    } catch (cause) {
      hapticError();
      setError(cause instanceof Error ? cause.message : "Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!workspace) return;
    const title =
      quiz?.title || presentation?.title || sourceTitle || topic.trim() || "AuraMind deck";
    const cards = quiz
      ? quiz.questions.map((question) => ({
          question: question.question,
          answer: `${question.options[question.correctAnswer] || ""}${question.explanation ? ` — ${question.explanation}` : ""}`,
        }))
      : presentation
        ? presentation.slides.map((slide) => ({
            question: slide.title,
            answer: `${slide.bullets.join("\n")}${slide.script ? `\n\nScript: ${slide.script}` : ""}`,
          }))
        : (flashcards || []).map((card) => ({ question: card.question, answer: card.answer }));
    if (!cards.length) return;

    setSaving(true);
    try {
      const deck = await workspace.createDeck(
        title,
        `Created with AuraMind on Android from ${sourceTitle || topic}.`,
      );
      if (!deck) throw new Error("Could not create the deck.");
      const saved = await workspace.addCardsToDeck(deck.id, cards);
      if (!saved) {
        await workspace.deleteDeck(deck.id);
        throw new Error("Could not save the generated cards.");
      }
      hapticSuccess();
      toast.success(`${saved} cards saved to ${deck.title}`);
      clearGenerated();
    } catch (cause) {
      toastError(cause, "Could not save this deck.");
    } finally {
      setSaving(false);
    }
  };

  const hasGenerated = !!quiz || !!flashcards || !!presentation;
  const sourceReady = !!sourceText || (source === "topic" && !!topic.trim());

  return (
    <div className="android-native-generator" data-testid="android-generator-screen">
      <div className="android-native-screen-heading">
        <div>
          <p className="android-eyebrow">CREATE WITH AURA</p>
          <h1>Make something worth remembering.</h1>
          <p>Build a focused study session from a thought, file, video, or voice memo.</p>
        </div>
        {hasGenerated && (
          <button
            type="button"
            className="android-native-icon-button"
            onClick={clearGenerated}
            aria-label="Start over"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <NativePanel className="android-generator-kind-panel">
        <div className="android-native-segmented" role="tablist" aria-label="Study material type">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={kind === option.value}
              className={kind === option.value ? "is-selected" : ""}
              onClick={() => {
                hapticSelection();
                setKind(option.value);
                clearGenerated();
              }}
            >
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </NativePanel>

      {!hasGenerated && (
        <>
          <NativePanel>
            <div className="android-native-panel-heading">
              <div>
                <span className="android-native-step">01</span>
                <div>
                  <h2>Choose your source</h2>
                  <p>Start wherever the idea lives.</p>
                </div>
              </div>
            </div>
            <div className="android-source-grid">
              {SOURCE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={source === option.value ? "is-selected" : ""}
                    onClick={() => selectSource(option.value)}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="android-native-source-input">
              {source === "topic" && (
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="What are you learning?"
                  aria-label="Study topic"
                />
              )}
              {(source === "url" || source === "youtube") && (
                <div className="android-native-input-action">
                  <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder={
                      source === "youtube" ? "Paste a video URL" : "Paste a web page URL"
                    }
                    aria-label="Source URL"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRemoteSource()}
                    disabled={loadingSource || !topic.trim()}
                  >
                    {loadingSource ? "Importing…" : "Import"}
                  </button>
                </div>
              )}
              {source === "file" && (
                <>
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    accept=".pdf,.pptx,.txt,.md,.doc,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="android-native-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" aria-hidden />
                    <span>
                      {loadingSource
                        ? "Reading document…"
                        : sourceTitle || "Choose a PDF, DOCX, TXT, or PPTX"}
                    </span>
                  </button>
                </>
              )}
              {source === "audio" && (
                <div className="android-native-audio-source">
                  <input
                    ref={audioInputRef}
                    className="sr-only"
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleAudioFile(file);
                      event.target.value = "";
                    }}
                  />
                  {!recorder.recording ? (
                    <button
                      type="button"
                      onClick={() => void recorder.start()}
                      disabled={!recorder.supported}
                    >
                      <Mic className="h-4 w-4" aria-hidden /> Record voice memo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="is-recording"
                      onClick={() => void finishRecording()}
                    >
                      <span className="android-record-dot" /> Finish recording
                    </button>
                  )}
                  <button type="button" onClick={() => audioInputRef.current?.click()}>
                    <FileText className="h-4 w-4" aria-hidden /> Upload audio
                  </button>
                </div>
              )}
              {(sourceText || sourceTitle) && (
                <p className="android-native-source-status">
                  <Check className="h-4 w-4" aria-hidden /> {sourceTitle || "Topic ready"}
                  {sourceText ? ` · ${sourceText.length.toLocaleString()} characters` : ""}
                </p>
              )}
            </div>
            {error && (
              <p className="android-native-error" role="alert">
                {error}
              </p>
            )}
          </NativePanel>

          <NativePanel>
            <div className="android-native-panel-heading">
              <div>
                <span className="android-native-step">02</span>
                <div>
                  <h2>Set the feel</h2>
                  <p>Small sessions are easier to finish.</p>
                </div>
              </div>
            </div>
            <div className="android-native-control-row">
              <div>
                <span>Material count</span>
                <small>How much should Aura make?</small>
              </div>
              <div className="android-count-control">
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setCount((value) => Math.max(5, value - 5));
                  }}
                  aria-label="Decrease count"
                >
                  −
                </button>
                <strong>{count}</strong>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setCount((value) => Math.min(50, value + 5));
                  }}
                  aria-label="Increase count"
                >
                  +
                </button>
              </div>
            </div>
            <div className="android-native-chip-row" aria-label="Difficulty">
              {DIFFICULTIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={difficulty === value ? "is-selected" : ""}
                  onClick={() => {
                    hapticSelection();
                    setDifficulty(value);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          </NativePanel>

          <button
            type="button"
            className="android-native-primary"
            onClick={() => {
              hapticTap();
              void generate();
            }}
            disabled={generating || loadingSource || !sourceReady}
          >
            <Sparkles className="h-5 w-5" aria-hidden />{" "}
            {generating ? "Aura is building…" : "Generate study material"}{" "}
            <Play className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}

      {hasGenerated && (
        <NativePanel className="android-generated-panel">
          <div className="android-native-panel-heading">
            <div>
              <span className="android-native-step">03</span>
              <div>
                <h2>Ready to study</h2>
                <p>
                  {quiz?.questions.length || flashcards?.length || presentation?.slides.length}{" "}
                  items generated from {sourceTitle || topic}.
                </p>
              </div>
            </div>
          </div>
          <div className="android-generated-list">
            {quiz?.questions.slice(0, 4).map((item, index) => (
              <article key={item.id || index}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.question}</strong>
                  <small>{item.options[item.correctAnswer] || "Multiple choice question"}</small>
                </div>
              </article>
            ))}
            {flashcards?.slice(0, 4).map((item, index) => (
              <article key={`${item.question}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.question}</strong>
                  <small>{item.answer}</small>
                </div>
              </article>
            ))}
            {presentation?.slides.slice(0, 4).map((item, index) => (
              <article key={`${item.title}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.bullets.join(" · ")}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="android-native-generated-actions">
            <button type="button" className="android-native-secondary" onClick={clearGenerated}>
              <X className="h-4 w-4" aria-hidden /> Discard
            </button>
            <button
              type="button"
              className="android-native-primary"
              onClick={() => {
                hapticTap();
                void save();
              }}
              disabled={saving}
            >
              <Save className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Save as deck"}
            </button>
          </div>
        </NativePanel>
      )}

      <div className="android-native-tip">
        <BookOpen className="h-4 w-4" aria-hidden />
        <span>Aura works best with one clear topic and a small first session.</span>
      </div>
    </div>
  );
}
