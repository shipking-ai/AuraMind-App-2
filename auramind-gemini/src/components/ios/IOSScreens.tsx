/**
 * The iPhone app's main screens: Today, Library and Study.
 *
 * Designed for iOS rather than ported from Android: large titles, Fitness-
 * style activity rings for the day's progress, inset grouped lists, a search
 * field and segmented control in the Library, action sheets for deck actions,
 * and haptics on every interaction.
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import { useAppPreference } from "../../lib/appPreferences";
import type { Card, Deck } from "../../types";
import {
  BookOpen,
  Brain,
  GraduationCap,
  Layers,
  MessageCircle,
  Play,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from "../icons";
import {
  ActivityRings,
  IOSActionSheet,
  IOSBarButton,
  IOSIconTile,
  IOSNavBar,
  IOSRow,
  IOSSection,
  IOSSegmented,
  deckGradient,
} from "./IOSPrimitives";
import { iosSuccess, iosTap, iosWarning } from "./iosHaptics";

// ── Derived numbers ──────────────────────────────────────────────────────

function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isDue(card: Card, now: number): boolean {
  return (card.nextReview ?? 0) <= now;
}

function isMastered(card: Card): boolean {
  return (card.repetition ?? 0) >= 3 && (card.lapses ?? 0) === 0;
}

interface DeckStats {
  deck: Deck;
  total: number;
  due: number;
  mastery: number;
}

function useDeckStats(decks: Deck[], cards: Card[]): DeckStats[] {
  return useMemo(() => {
    const now = Date.now();
    const byDeck = new Map<string, Card[]>();
    for (const card of cards) {
      const list = byDeck.get(card.deckId) ?? [];
      list.push(card);
      byDeck.set(card.deckId, list);
    }
    return decks.map((deck) => {
      const list = byDeck.get(deck.id) ?? [];
      const total = list.length || deck.cardCount || 0;
      return {
        deck,
        total,
        due: list.filter((c) => isDue(c, now)).length,
        mastery: list.length ? Math.round((list.filter(isMastered).length / list.length) * 100) : 0,
      };
    });
  }, [decks, cards]);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function DeckTile({ deck }: { deck: Deck }) {
  const initial = (deck.title.trim()[0] ?? "•").toUpperCase();
  return (
    <span className="ios-deck-tile" style={{ background: deckGradient(deck.id) }} aria-hidden>
      {initial}
    </span>
  );
}

function Avatar({ name, onClick }: { name: string; onClick: () => void }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <button
      type="button"
      aria-label="Account and settings"
      onClick={() => {
        iosTap();
        onClick();
      }}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        border: 0,
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        background: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
        marginRight: 8,
      }}
    >
      {initials || "A"}
    </button>
  );
}

// ── Today ────────────────────────────────────────────────────────────────

export function IOSToday() {
  const navigate = useNavigate();
  const { user, decks, cards, startQuickStudy, startStudyForDeck } = useDashboardWorkspace()!;
  const [goalPref] = useAppPreference("auramind_dailyGoal", "20");
  const goal = Math.max(1, Number.parseInt(String(goalPref), 10) || 20);
  const stats = useDeckStats(decks, cards);

  const now = Date.now();
  const today = startOfToday(now);
  const due = cards.filter((c) => isDue(c, now)).length;
  const reviewed = cards.filter((c) => (c.lastReviewed ?? 0) >= today).length;
  const streak = user?.streak ?? 0;
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const upNext = stats
    .filter((s) => s.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, 5);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const rings = [
    {
      label: "Reviews",
      progress: reviewed + due === 0 ? 1 : reviewed / (reviewed + due),
      color: "var(--ios-ring-move)",
    },
    { label: "Daily goal", progress: reviewed / goal, color: "var(--ios-ring-exercise)" },
    { label: "Streak", progress: Math.min(1, streak / 7), color: "var(--ios-ring-stand)" },
  ];

  return (
    <div>
      <IOSNavBar
        title="Today"
        eyebrow={dateLabel}
        trailing={
          <Avatar name={user?.name || "AuraMind"} onClick={() => navigate("/dashboard/settings")} />
        }
      />

      {decks.length === 0 ? (
        <div className="ios-empty">
          <Sparkles
            className="mx-auto h-12 w-12"
            style={{ color: "var(--ios-tint)" }}
            aria-hidden
          />
          <div className="ios-empty-title">Start with anything</div>
          <p className="ios-empty-body">
            Turn a topic, PDF, video or lecture into a deck, and AuraMind schedules the reviews for
            you.
          </p>
          <button
            type="button"
            className="ios-button-filled"
            onClick={() => navigate("/dashboard/generator")}
          >
            <Sparkles className="h-5 w-5" aria-hidden /> Create your first deck
          </button>
        </div>
      ) : (
        <>
          <div className="ios-rings-card">
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>
              {greeting}, {firstName}
            </div>
            <div className="ios-rings-layout">
              <ActivityRings rings={rings} />
              <div className="ios-ring-legend">
                <div>
                  <div className="ios-ring-legend-label" style={{ color: "var(--ios-ring-move)" }}>
                    Reviews
                  </div>
                  <div className="ios-ring-legend-value">
                    {reviewed}
                    <small>/{reviewed + due} cards</small>
                  </div>
                </div>
                <div>
                  <div
                    className="ios-ring-legend-label"
                    style={{ color: "var(--ios-ring-exercise)" }}
                  >
                    Daily goal
                  </div>
                  <div className="ios-ring-legend-value">
                    {Math.min(reviewed, goal)}
                    <small>/{goal}</small>
                  </div>
                </div>
                <div>
                  <div className="ios-ring-legend-label" style={{ color: "var(--ios-ring-stand)" }}>
                    Streak
                  </div>
                  <div className="ios-ring-legend-value">
                    {streak}
                    <small> {streak === 1 ? "day" : "days"}</small>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="ios-button-filled"
              onClick={() => {
                iosSuccess();
                startQuickStudy();
              }}
            >
              <Play className="h-5 w-5" aria-hidden />
              {due > 0 ? `Study ${plural(due, "due card")}` : "Review anyway"}
            </button>
          </div>

          <IOSSection
            title="Up Next"
            action={
              <button
                type="button"
                className="ios-bar-button"
                style={{ height: "auto", minWidth: 0, padding: 0, fontSize: 15 }}
                onClick={() => navigate("/dashboard/decks")}
              >
                See All
              </button>
            }
          >
            {upNext.length === 0 ? (
              <IOSRow
                leading={<IOSIconTile icon={Sparkles} color="var(--ios-green)" />}
                title="You're all caught up"
                subtitle="New reviews appear as cards start to fade."
              />
            ) : (
              upNext.map(({ deck, due: deckDue, total }) => (
                <IOSRow
                  key={deck.id}
                  leading={<DeckTile deck={deck} />}
                  title={deck.title}
                  subtitle={`${deckDue} due · ${plural(total, "card")}`}
                  trailing={<span className="ios-badge">{deckDue}</span>}
                  chevron
                  separatorInset={74}
                  onClick={() => startStudyForDeck(deck.id)}
                />
              ))
            )}
          </IOSSection>

          <IOSSection title="Make & Ask">
            <IOSRow
              leading={<IOSIconTile icon={Wand2} color="var(--ios-tint-fill)" />}
              title="Create a deck"
              subtitle="From a topic, PDF, video or notes"
              chevron
              onClick={() => navigate("/dashboard/generator")}
            />
            <IOSRow
              leading={<IOSIconTile icon={MessageCircle} color="var(--ios-blue)" />}
              title="Ask Prof. Aura"
              subtitle="Your tutor knows what you keep missing"
              chevron
              onClick={() => navigate("/dashboard/chat")}
            />
          </IOSSection>
        </>
      )}
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────

type LibraryFilter = "all" | "due" | "mastered";

export function IOSLibrary() {
  const navigate = useNavigate();
  const { decks, cards, startStudyForDeck, deleteDeck } = useDashboardWorkspace()!;
  const stats = useDeckStats(decks, cards);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [selected, setSelected] = useState<DeckStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeckStats | null>(null);

  const visible = stats
    .filter((s) => s.deck.title.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((s) => (filter === "due" ? s.due > 0 : filter === "mastered" ? s.mastery >= 80 : true));

  return (
    <div>
      <IOSNavBar
        title="Library"
        trailing={
          <IOSBarButton
            label="New deck"
            icon={Plus}
            glass
            onClick={() => navigate("/dashboard/generator")}
          />
        }
      />
      <label className="ios-search">
        <Search className="h-[18px] w-[18px]" aria-hidden />
        <input
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search decks"
        />
      </label>
      <IOSSegmented
        label="Filter decks"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "due", label: "Due" },
          { value: "mastered", label: "Mastered" },
        ]}
      />

      {visible.length === 0 ? (
        <div className="ios-empty">
          <BookOpen
            className="mx-auto h-11 w-11"
            style={{ color: "var(--ios-label-3)" }}
            aria-hidden
          />
          <div className="ios-empty-title">
            {decks.length === 0 ? "No decks yet" : "No results"}
          </div>
          <p className="ios-empty-body">
            {decks.length === 0
              ? "Create a deck from anything you want to remember."
              : query
                ? `Nothing matches “${query}”.`
                : "No decks in this view right now."}
          </p>
        </div>
      ) : (
        <IOSSection caption={`${plural(visible.length, "deck")}`}>
          {visible.map((s) => (
            <IOSRow
              key={s.deck.id}
              leading={<DeckTile deck={s.deck} />}
              title={s.deck.title}
              subtitle={`${plural(s.total, "card")} · ${s.mastery}% mastered`}
              trailing={s.due > 0 ? <span className="ios-badge">{s.due}</span> : undefined}
              chevron
              separatorInset={74}
              onClick={() => setSelected(s)}
            />
          ))}
        </IOSSection>
      )}

      <IOSActionSheet
        open={selected !== null}
        title={selected?.deck.title}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                {
                  label:
                    selected.due > 0 ? `Study ${plural(selected.due, "due card")}` : "Study now",
                  onSelect: () => startStudyForDeck(selected.deck.id),
                },
                { label: "Open Deck", onSelect: () => navigate(`/deck/${selected.deck.id}`) },
                {
                  label: "Delete Deck",
                  destructive: true,
                  onSelect: () => {
                    iosWarning();
                    setConfirmDelete(selected);
                  },
                },
              ]
            : []
        }
      />
      <IOSActionSheet
        open={confirmDelete !== null}
        title={
          confirmDelete
            ? `Delete “${confirmDelete.deck.title}” and its ${plural(confirmDelete.total, "card")}? This can’t be undone.`
            : undefined
        }
        onClose={() => setConfirmDelete(null)}
        actions={
          confirmDelete
            ? [
                {
                  label: "Delete Deck",
                  destructive: true,
                  onSelect: () => void deleteDeck(confirmDelete.deck.id),
                },
              ]
            : []
        }
      />
    </div>
  );
}

// ── Study ────────────────────────────────────────────────────────────────

export function IOSStudy() {
  const navigate = useNavigate();
  const { decks, cards, startQuickStudy, startStudyForDeck } = useDashboardWorkspace()!;
  const stats = useDeckStats(decks, cards);
  const due = stats.reduce((sum, s) => sum + s.due, 0);

  const tiles: Array<{
    title: string;
    caption: string;
    icon: React.ComponentType<{ className?: string }>;
    background: string;
    onClick: () => void;
  }> = [
    {
      title: "Flashcards",
      caption: due > 0 ? `${plural(due, "card")} due` : "Review anytime",
      icon: Layers,
      background: "linear-gradient(145deg, #8b5cf6, #5b21b6)",
      onClick: startQuickStudy,
    },
    {
      title: "Study tools",
      caption: "Quizzes, focus, voice",
      icon: Brain,
      background: "linear-gradient(145deg, #0ea5e9, #1e40af)",
      onClick: () => navigate("/dashboard/study-tools"),
    },
    {
      title: "Classes",
      caption: "Assignments & progress",
      icon: GraduationCap,
      background: "linear-gradient(145deg, #10b981, #047857)",
      onClick: () => navigate("/dashboard/classes"),
    },
    {
      title: "Create",
      caption: "New deck from anything",
      icon: Sparkles,
      background: "linear-gradient(145deg, #f472b6, #be185d)",
      onClick: () => navigate("/dashboard/generator"),
    },
  ];

  return (
    <div>
      <IOSNavBar title="Study" />
      <div className="ios-tile-grid">
        {tiles.map((tile) => (
          <button
            key={tile.title}
            type="button"
            className="ios-tile"
            style={{ background: tile.background }}
            onClick={() => {
              iosTap();
              tile.onClick();
            }}
          >
            <tile.icon className="h-7 w-7" aria-hidden />
            <div>
              <div className="ios-tile-title">{tile.title}</div>
              <div className="ios-tile-caption">{tile.caption}</div>
            </div>
          </button>
        ))}
      </div>

      {stats.length > 0 && (
        <IOSSection title="Your Decks">
          {stats.map(({ deck, due: deckDue, total }) => (
            <IOSRow
              key={deck.id}
              leading={<DeckTile deck={deck} />}
              title={deck.title}
              subtitle={
                deckDue > 0 ? `${deckDue} due · ${plural(total, "card")}` : plural(total, "card")
              }
              trailing={
                <Play className="h-5 w-5" style={{ color: "var(--ios-tint)" }} aria-hidden />
              }
              separatorInset={74}
              onClick={() => startStudyForDeck(deck.id)}
            />
          ))}
        </IOSSection>
      )}
    </div>
  );
}
