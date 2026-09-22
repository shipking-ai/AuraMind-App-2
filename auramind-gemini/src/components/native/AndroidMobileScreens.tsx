import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock,
  EllipsisVertical,
  Layers,
  MessageCircle,
  Mic,
  Pencil,
  Play,
  Plus,
  Search,
  Share,
  Smartphone,
  Sparkles,
  Trash2,
} from "@/components/icons";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import { hapticSuccess, hapticTap, hapticWarning } from "./androidHaptics";
import { publishWidgetState } from "../../lib/widgetBridge";
import { canPinDecks, pinDeckToHomeScreen, publishRecentDecks } from "../../lib/auraDevice";
import { useAppPreference } from "../../lib/appPreferences";
import { Share as NativeShare } from "../../lib/nativeShim";
import AndroidAura from "./AndroidAura";
import { clampAuraScroll } from "./auraDepth";
import { useRM } from "../dashboard/nova/motion";
import { AndroidSheet, AndroidSheetAction } from "./AndroidSheet";
import { useLongPress } from "./useLongPress";
import type { Card, Deck } from "../../types";
import { toast } from "sonner";
import { toastError } from "../../lib/errorToast";

function startOfToday(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function deckCards(deck: Deck, cards: Card[]): Card[] {
  return cards.filter((card) => card.deckId === deck.id);
}

function deckProgress(deck: Deck, cards: Card[]): number {
  const items = deckCards(deck, cards);
  if (items.length === 0) return 0;
  return Math.round(
    (items.filter((card) => (card.repetition ?? 0) > 0).length / items.length) * 100,
  );
}

function deckDue(deck: Deck, cards: Card[]): number {
  return deckCards(deck, cards).filter((card) => (card.nextReview ?? 0) <= Date.now()).length;
}

function AndroidScreenHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="android-screen-header">
      <div className="min-w-0">
        <p className="android-eyebrow">{eyebrow}</p>
        <h1 className="android-screen-title">{title}</h1>
        {detail && <p className="android-screen-detail">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function AndroidAction({
  label,
  hint,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "violet" | "cyan" | "pink";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`android-action android-action-${tone}`}
      onClick={() => {
        hapticTap();
        onClick();
      }}
    >
      <span className="android-action-icon">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 text-left">
        <span className="android-action-label">{label}</span>
        <span className="android-action-hint">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Everything you can do with one deck, in one place: reached by long-pressing
 * a row or its overflow button. Delete lives here rather than as a bare icon
 * on every row, where a mis-tap next to "Edit" was one confirm away from
 * losing a deck.
 */
function DeckActionsSheet({
  deck,
  cards,
  onClose,
  onDelete,
}: {
  deck: Deck | null;
  cards: Card[];
  onClose: () => void;
  onDelete?: (deck: Deck) => void;
}) {
  const navigate = useNavigate();
  const [canPin, setCanPin] = useState(false);
  useEffect(() => {
    let live = true;
    void canPinDecks().then((supported) => {
      if (live) setCanPin(supported);
    });
    return () => {
      live = false;
    };
  }, []);

  const count = deck ? deckCards(deck, cards).length : 0;
  const due = deck ? deckDue(deck, cards) : 0;
  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <AndroidSheet
      open={deck !== null}
      onClose={onClose}
      eyebrow="DECK"
      title={deck?.title ?? ""}
      description={`${count} ${count === 1 ? "card" : "cards"} · ${due} due`}
    >
      {deck && (
        <div className="android-sheet-actions">
          <AndroidSheetAction
            icon={Play}
            label="Study now"
            detail={due > 0 ? `Start with the ${due} due` : "Review at your own pace"}
            onClick={() => run(() => navigate(`/dashboard/study/${deck.id}`))}
          />
          <AndroidSheetAction
            icon={Mic}
            label="Voice study"
            detail="Hands-free: questions read aloud"
            onClick={() => run(() => navigate(`/dashboard/study/${deck.id}?voice=1`))}
          />
          <AndroidSheetAction
            icon={Pencil}
            label="Edit cards"
            onClick={() => run(() => navigate(`/deck/${deck.id}`))}
          />
          {canPin && (
            <AndroidSheetAction
              icon={Smartphone}
              label="Add to home screen"
              detail="One tap from your launcher to this deck"
              onClick={() =>
                run(() => {
                  void pinDeckToHomeScreen({ id: deck.id, title: deck.title });
                })
              }
            />
          )}
          <AndroidSheetAction
            icon={Share}
            label="Share"
            onClick={() =>
              run(() => {
                void NativeShare.share({
                  title: deck.title,
                  text: `I'm studying "${deck.title}" on AuraMind (${count} cards).`,
                  url: "https://auramind.app",
                  dialogTitle: "Share deck",
                }).catch(() => undefined);
              })
            }
          />
          {onDelete && (
            <AndroidSheetAction
              icon={Trash2}
              label="Delete deck"
              tone="danger"
              onClick={() =>
                run(() => {
                  hapticWarning();
                  onDelete(deck);
                })
              }
            />
          )}
        </div>
      )}
    </AndroidSheet>
  );
}

function AndroidDeckRow({
  deck,
  cards,
  onStudy,
  onEdit,
  onMore,
}: {
  deck: Deck;
  cards: Card[];
  onStudy: () => void;
  onEdit: () => void;
  onMore: () => void;
}) {
  const items = deckCards(deck, cards);
  const due = deckDue(deck, cards);
  const progress = deckProgress(deck, cards);
  const longPress = useLongPress(onMore);

  return (
    <article className="android-deck-row">
      <button
        type="button"
        className="android-deck-main"
        {...longPress}
        onClick={() => {
          hapticTap();
          onStudy();
        }}
        aria-description="Press and hold for more actions"
      >
        <span className="android-deck-icon">
          <BookOpen className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="android-deck-title">{deck.title}</span>
          <span className="android-deck-meta">
            {items.length} cards · {progress}% explored
          </span>
          <span className="android-progress-track" aria-label={`${progress}% explored`}>
            <span className="android-progress-value" style={{ width: `${progress}%` }} />
          </span>
        </span>
        <span className="android-deck-status">
          {due > 0 ? (
            <span className="android-due-badge">{due} due</span>
          ) : (
            <Check className="h-4 w-4 text-emerald-300" aria-label="All reviewed" />
          )}
          <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
        </span>
      </button>
      <div className="android-deck-actions">
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onStudy();
          }}
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
          Study
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onEdit();
          }}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Edit
        </button>
        <button
          type="button"
          className="android-deck-more"
          onClick={() => {
            hapticTap();
            onMore();
          }}
          aria-label={`More actions for ${deck.title}`}
        >
          <EllipsisVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function AndroidOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useDashboardWorkspace();
  const { user, decks, cards, startQuickStudy, startStudyForDeck } = workspace!;

  // Scroll-reactive aura — the native counterpart of the web shell's aurora
  // (NovaDashboardShell). Same grammar: a rAF-throttled, clamped MotionValue
  // fed from the one scroller (`main#nova-main-content`), a per-route reset
  // to the static baseline, and zero re-renders (MotionValues update outside
  // React). Reduced-motion users keep the original still mark — the listener
  // never attaches. The reset deliberately keys on `location.pathname`, NOT
  // `navigate` — this build returns a fresh navigate identity every render,
  // and a [navigate] dep re-applies effects ~79 ms after every navigation.
  const reduced = useRM();
  const auraScroll = useMotionValue(0);
  const auraResetRef = useRef(location.pathname);
  auraResetRef.current = location.pathname;
  useEffect(() => {
    if (reduced) return;
    const el = document.getElementById("nova-main-content");
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        auraScroll.set(clampAuraScroll(el.scrollTop));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, location.pathname, auraScroll]);
  useEffect(() => {
    auraScroll.set(0);
  }, [location.pathname, auraScroll]);
  const today = startOfToday();
  const dueCount = cards.filter((card) => (card.nextReview ?? 0) <= Date.now()).length;
  const studiedToday = cards.filter((card) => (card.lastReviewed ?? 0) >= today).length;
  const mastered = cards.filter(
    (card) => (card.repetition ?? 0) >= 3 && (card.lapses ?? 0) === 0,
  ).length;
  const firstName = user?.name?.split(" ")[0] || "Learner";
  const firstDueDeck = decks.find((deck) => deckDue(deck, cards) > 0) ?? decks[0];
  const [dailyGoalPref] = useAppPreference("auramind_dailyGoal", "20");
  const dailyGoal = Math.max(1, Number.parseInt(String(dailyGoalPref), 10) || 20);
  const [sheetDeck, setSheetDeck] = useState<Deck | null>(null);

  // Launcher long-press lists the two decks studied most recently.
  const recentDecks = useMemo(() => {
    const lastTouched = new Map<string, number>();
    for (const card of cards) {
      const at = card.lastReviewed ?? 0;
      if (at > (lastTouched.get(card.deckId) ?? 0)) lastTouched.set(card.deckId, at);
    }
    return [...decks]
      .sort((a, b) => (lastTouched.get(b.id) ?? 0) - (lastTouched.get(a.id) ?? 0))
      .slice(0, 2)
      .map((deck) => ({ id: deck.id, title: deck.title }));
  }, [decks, cards]);
  useEffect(() => {
    void publishRecentDecks(recentDecks);
  }, [recentDecks]);
  // Keep the home-screen widget in step with what this screen shows. The
  // widget cannot compute due-ness itself (that is FSRS, and it lives in TS),
  // so the count is published from the one place that already derives it.
  // MainActivity broadcasts the redraw when the app backgrounds.
  useEffect(() => {
    void publishWidgetState(dueCount, firstDueDeck?.title ?? null, user?.streak ?? 0);
  }, [dueCount, firstDueDeck?.title, user?.streak]);

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <div className="android-screen android-home-screen">
      <div className="android-greeting-block">
        <p className="android-eyebrow">
          {greeting}, {firstName}
        </p>
        <h1 className="android-hero-title">
          Make today
          <br />
          <span>count.</span>
        </h1>
        <p className="android-hero-copy">
          {dueCount > 0
            ? `${dueCount} cards are ready when you are.`
            : "Your memory queue is clear. Build a little more mastery."}
        </p>
      </div>

      <section className="android-focus-card">
        <AndroidAura className="android-focus-aura" scrollY={auraScroll} />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <span className="android-focus-label">
              <span className="android-live-dot" /> TODAY&apos;S FOCUS
            </span>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="android-focus-number">{dueCount}</p>
              <p className="android-focus-caption">cards waiting for review</p>
            </div>
            <button
              type="button"
              className="android-primary-button"
              onClick={() => {
                hapticTap();
                if (firstDueDeck) startQuickStudy();
                else navigate("/dashboard/decks");
              }}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden />
              {firstDueDeck ? "Start review" : "Create a deck"}
            </button>
          </div>
          <div className="android-focus-footer">
            <span>
              <Clock className="h-3.5 w-3.5" aria-hidden /> About{" "}
              {Math.max(2, Math.ceil(dueCount * 0.6))} min
            </span>
            <span className="android-focus-goal">
              <DailyGoalRing done={studiedToday} goal={dailyGoal} />
              Daily goal
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="android-section-heading">
          <h2>Quick actions</h2>
          <span>One tap away</span>
        </div>
        <div className="android-action-grid">
          <AndroidAction
            label="Generate"
            hint="Turn anything into cards"
            icon={Sparkles}
            tone="violet"
            onClick={() => navigate("/dashboard/generator")}
          />
          <AndroidAction
            label="Voice study"
            hint="Learn hands-free"
            icon={Mic}
            tone="cyan"
            onClick={() =>
              navigate(firstDueDeck ? `/dashboard/study/${firstDueDeck.id}?voice=1` : "/dashboard/study")
            }
          />
          <AndroidAction
            label="Ask Aura"
            hint="Explain a hard concept"
            icon={MessageCircle}
            tone="pink"
            onClick={() => navigate("/dashboard/chat")}
          />
        </div>
      </section>

      <section>
        <div className="android-section-heading">
          <div>
            <h2>Your learning</h2>
            <span>
              {decks.length} decks · {cards.length} cards
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/decks")}
            className="android-text-button"
          >
            See all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="android-stat-strip">
          <div>
            <span className="android-stat-value">{studiedToday}</span>
            <span className="android-stat-label">Today</span>
          </div>
          <div>
            <span className="android-stat-value android-stat-violet">{mastered}</span>
            <span className="android-stat-label">Mastered</span>
          </div>
          <div>
            <span className="android-stat-value android-stat-amber">{decks.length}</span>
            <span className="android-stat-label">Decks</span>
          </div>
        </div>
      </section>

      <section>
        <div className="android-section-heading">
          <h2>Continue learning</h2>
          <button
            type="button"
            onClick={() => navigate("/dashboard/decks")}
            className="android-text-button"
          >
            Library <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {decks.length > 0 ? (
          <div className="android-deck-list">
            {decks.slice(0, 3).map((deck) => (
              <AndroidDeckRow
                key={deck.id}
                deck={deck}
                cards={cards}
                onStudy={() => startStudyForDeck(deck.id)}
                onEdit={() => navigate(`/deck/${deck.id}`)}
                onMore={() => setSheetDeck(deck)}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="android-empty-card"
            onClick={() => {
              hapticTap();
              navigate("/dashboard/generator");
            }}
          >
            <span className="android-empty-icon">
              <Layers className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <strong>Build your first deck</strong>
              <small>Start with a topic, PDF, video, or recording.</small>
            </span>
            <ChevronRight className="ml-auto h-5 w-5 text-slate-500" aria-hidden />
          </button>
        )}
      </section>
      <DeckActionsSheet deck={sheetDeck} cards={cards} onClose={() => setSheetDeck(null)} />
    </div>
  );
}

/** Today's reviews against the daily goal from Settings, as a progress ring. */
function DailyGoalRing({ done, goal }: { done: number; goal: number }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, done / goal);
  const complete = done >= goal;
  return (
    <span
      className={`android-goal-ring ${complete ? "is-complete" : ""}`}
      role="img"
      aria-label={`${done} of ${goal} daily reviews`}
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="android-goal-ring-track" cx="20" cy="20" r={radius} />
        <circle
          className="android-goal-ring-value"
          cx="20"
          cy="20"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className="android-goal-ring-text">
        {complete ? <Check className="h-4 w-4" aria-hidden /> : `${done}/${goal}`}
      </span>
    </span>
  );
}

export function AndroidLibrary() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const { decks, cards, createDeck, deleteDeck } = workspace!;
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Deck | null>(null);
  const [sheetDeck, setSheetDeck] = useState<Deck | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const filtered = useMemo(
    () =>
      decks.filter((deck) =>
        `${deck.title} ${deck.description ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [decks, query],
  );

  const handleCreate = async () => {
    const title = newDeckTitle.trim();
    if (!title) return;
    setActionBusy(true);
    try {
      const deck = await createDeck(title, "");
      if (!deck) throw new Error("Could not create the deck.");
      setNewDeckTitle("");
      setCreateOpen(false);
      hapticSuccess();
      toast.success(`Created ${deck.title}`);
    } catch (cause) {
      toastError(cause, "Could not create the deck.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteDeck(deleteTarget.id);
      hapticSuccess();
      toast.success(`Deleted ${deleteTarget.title}`);
      setDeleteTarget(null);
    } catch (cause) {
      toastError(cause, "Could not delete the deck.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="android-screen">
      <AndroidScreenHeader
        eyebrow="YOUR KNOWLEDGE"
        title="Library"
        detail={`${decks.length} decks · ${cards.length} cards`}
        action={
          <button
            type="button"
            className="android-round-action"
            onClick={() => {
              hapticTap();
              setCreateOpen(true);
            }}
            aria-label="Create deck"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        }
      />
      <AndroidSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        busy={actionBusy}
        eyebrow="NEW DECK"
        title="Give it a home"
        description="Name the collection you want to return to."
      >
        <input
          data-autofocus
          value={newDeckTitle}
          onChange={(event) => setNewDeckTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleCreate();
          }}
          enterKeyHint="done"
          autoCapitalize="words"
          className="android-sheet-input"
          placeholder="e.g. Biology foundations"
          aria-label="New deck name"
        />
        <div className="android-sheet-buttons">
          <button
            type="button"
            className="android-native-secondary"
            onClick={() => setCreateOpen(false)}
            disabled={actionBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="android-native-primary"
            onClick={() => void handleCreate()}
            disabled={actionBusy || !newDeckTitle.trim()}
          >
            {actionBusy ? "Creating…" : "Create deck"}
          </button>
        </div>
      </AndroidSheet>
      <AndroidSheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        busy={actionBusy}
        eyebrow="DELETE DECK"
        title={`Delete ${deleteTarget?.title ?? "deck"}?`}
        description="This removes the deck and its cards. This action cannot be undone."
      >
        <div className="android-sheet-buttons">
          <button
            type="button"
            className="android-native-secondary"
            onClick={() => setDeleteTarget(null)}
            disabled={actionBusy}
            data-autofocus
          >
            Keep deck
          </button>
          <button
            type="button"
            className="android-native-danger"
            onClick={() => void handleDelete()}
            disabled={actionBusy}
          >
            {actionBusy ? "Deleting…" : "Delete deck"}
          </button>
        </div>
      </AndroidSheet>
      <DeckActionsSheet
        deck={sheetDeck}
        cards={cards}
        onClose={() => setSheetDeck(null)}
        onDelete={setDeleteTarget}
      />
      <div className="android-search-box">
        <Search className="h-4 w-4" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your decks"
          aria-label="Search decks"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="android-deck-list">
          {filtered.map((deck) => (
            <AndroidDeckRow
              key={deck.id}
              deck={deck}
              cards={cards}
              onStudy={() => navigate(`/dashboard/study/${deck.id}`)}
              onEdit={() => navigate(`/deck/${deck.id}`)}
              onMore={() => setSheetDeck(deck)}
            />
          ))}
        </div>
      ) : (
        <div className="android-empty-state">
          <div className="android-empty-icon">
            <BookOpen className="h-6 w-6" aria-hidden />
          </div>
          <h2>{query ? "No decks found" : "Your library is empty"}</h2>
          <p>
            {query
              ? "Try another search."
              : "Create a deck or let AuraMind build one from your study material."}
          </p>
          <button
            type="button"
            className="android-primary-button"
            onClick={() => {
              hapticTap();
              navigate("/dashboard/generator");
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Generate with AI
          </button>
        </div>
      )}
    </div>
  );
}

export function AndroidGeneratorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="android-generator-frame">
      <section className="android-create-hero">
        <span className="android-create-icon">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="android-eyebrow">CREATE WITH AURA</p>
          <h1>Turn anything into a study session.</h1>
          <p>
            Start with a topic, document, video, or voice memo. AuraMind does the heavy lifting.
          </p>
        </div>
      </section>
      <div className="android-source-pills" aria-label="Generation sources">
        <span>Topic</span>
        <span>PDF</span>
        <span>Video</span>
        <span>Voice</span>
      </div>
      {children}
    </div>
  );
}

export function AndroidStudy() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const { decks, cards, startQuickStudy } = workspace!;
  const dueCount = cards.filter((card) => (card.nextReview ?? 0) <= Date.now()).length;
  const studiedToday = cards.filter((card) => (card.lastReviewed ?? 0) >= startOfToday()).length;
  const dueDecks = decks.filter((deck) => deckDue(deck, cards) > 0);
  const [sheetDeck, setSheetDeck] = useState<Deck | null>(null);

  return (
    <div className="android-screen">
      <AndroidScreenHeader
        eyebrow="REVIEW CENTER"
        title="Study"
        detail={dueCount > 0 ? `${dueCount} cards are ready` : "You are all caught up"}
      />
      <section className="android-study-hero">
        <div className="android-study-icon">
          <Brain className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="android-study-kicker">SMART REVIEW</p>
          <h2>{dueCount > 0 ? "Keep your memory sharp" : "Deepen your mastery"}</h2>
          <p>
            {dueCount > 0
              ? "FSRS has picked the cards that matter most right now."
              : "Take an optional pass through any deck to keep recall strong."}
          </p>
        </div>
        <button
          type="button"
          className="android-primary-button android-primary-button-small"
          onClick={() => {
            hapticTap();
            if (decks.length > 0) startQuickStudy();
          }}
          disabled={decks.length === 0}
        >
          <Play className="h-4 w-4 fill-current" aria-hidden /> Go
        </button>
      </section>
      <div className="android-stat-strip android-study-stats">
        <div>
          <span className="android-stat-value">{dueCount}</span>
          <span className="android-stat-label">Due now</span>
        </div>
        <div>
          <span className="android-stat-value android-stat-cyan">{studiedToday}</span>
          <span className="android-stat-label">Today</span>
        </div>
        <div>
          <span className="android-stat-value android-stat-violet">{decks.length}</span>
          <span className="android-stat-label">Decks</span>
        </div>
      </div>
      <section>
        <div className="android-section-heading">
          <h2>{dueDecks.length > 0 ? "Priority queue" : "Choose a deck"}</h2>
          <span>{dueDecks.length > 0 ? "Recommended first" : "Study at your pace"}</span>
        </div>
        <div className="android-deck-list">
          {(dueDecks.length > 0 ? dueDecks : decks).map((deck) => (
            <AndroidDeckRow
              key={deck.id}
              deck={deck}
              cards={cards}
              onStudy={() => navigate(`/dashboard/study/${deck.id}`)}
              onEdit={() => navigate(`/deck/${deck.id}`)}
              onMore={() => setSheetDeck(deck)}
            />
          ))}
        </div>
        <DeckActionsSheet deck={sheetDeck} cards={cards} onClose={() => setSheetDeck(null)} />
        {decks.length === 0 && (
          <div className="android-empty-state">
            <div className="android-empty-icon">
              <Brain className="h-6 w-6" aria-hidden />
            </div>
            <h2>No decks yet</h2>
            <p>Create your first deck to start a study session.</p>
            <button
              type="button"
              className="android-primary-button"
              onClick={() => {
                hapticTap();
                navigate("/dashboard/generator");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Create a deck
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default AndroidOverview;
