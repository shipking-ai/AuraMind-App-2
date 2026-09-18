import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { assignmentService } from "../../services/classroom/assignmentService";
import type { Assignment, AssignmentKind } from "../../types/classroom";
import type { Deck } from "../../types";
import { BookOpen, ListChecks, Sparkles } from "../icons";

// datetime-local <-> epoch ms helpers (local-time aware, no UTC skew).
function toLocalInput(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const inputCls =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40";

const labelCls = "nova-label mb-1.5";

interface AssignDeckModalProps {
  classroomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: Deck[];
  onCreated: (assignment: Assignment) => void;
}

export function AssignDeckModal({
  classroomId,
  open,
  onOpenChange,
  decks,
  onCreated,
}: AssignDeckModalProps) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AssignmentKind>("deck");
  const [deckId, setDeckId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset local form state whenever the dialog opens so a previous draft
  // never leaks into a new assignment.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind("deck");
    setDeckId("");
    setInstructions("");
    setDueAt("");
    setStartAt("");
    setSubmitting(false);
  }, [open]);

  const ownedDecks = useMemo(
    () => decks.filter((d) => d.id && d.title).filter((d) => !d.isSample),
    [decks],
  );

  // Auto-select the first deck and keep the selection meaningful when the
  // user switches between kind and deck.
  useEffect(() => {
    if (kind === "deck" && !deckId && ownedDecks.length > 0) {
      setDeckId(ownedDecks[0].id);
    }
  }, [kind, deckId, ownedDecks]);

  const canSubmit =
    title.trim().length > 0 &&
    (kind === "quiz" || deckId.length > 0) &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const assignment = await assignmentService.createAssignment({
        classroomId,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        kind,
        deckId: kind === "deck" ? deckId : null,
        startAt: fromLocalInput(startAt),
        dueAt: fromLocalInput(dueAt),
      });
      toast.success("Assignment created");
      onCreated(assignment);
      onOpenChange(false);
    } catch (err) {
      console.error("[AssignDeckModal] Could not create assignment:", err);
      toast.error("Could not create the assignment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border border-white/10 bg-[#0E1420] text-white">
        <DialogHeader>
          <DialogTitle className="text-white">New assignment</DialogTitle>
          <DialogDescription>
            Send this class a deck to study or a quiz to take.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div>
            <label htmlFor="assignment-title" className={labelCls}>
              Title
            </label>
            <input
              id="assignment-title"
              className={inputCls}
              placeholder="e.g. Photosynthesis — homework 2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <span className={labelCls}>Assignment type</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Assignment type">
              {(
                [
                  { value: "deck", icon: BookOpen, label: "Deck to study" },
                  { value: "quiz", icon: ListChecks, label: "Quiz" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === opt.value}
                  onClick={() => setKind(opt.value)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                    kind === opt.value
                      ? "border-violet-400/40 bg-violet-500/15 text-white"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                  }`}
                >
                  <opt.icon className="h-4 w-4" aria-hidden />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {kind === "deck" && (
            <div>
              <label htmlFor="assignment-deck" className={labelCls}>
                Deck
              </label>
              {ownedDecks.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-400">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Assignments reuse decks from your library.
                </div>
              ) : (
                <select
                  id="assignment-deck"
                  className={inputCls}
                  value={deckId}
                  onChange={(e) => setDeckId(e.target.value)}
                >
                  {ownedDecks.map((d) => (
                    <option key={d.id} value={d.id} className="bg-[#0E1420] text-white">
                      {d.title} · {d.cardCount} cards
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label htmlFor="assignment-instructions" className={labelCls}>
              Instructions <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="assignment-instructions"
              className={`${inputCls} min-h-[72px] resize-y`}
              placeholder="What should students do, and by when?"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="assignment-due" className={labelCls}>
                Due date
              </label>
              <input
                id="assignment-due"
                type="datetime-local"
                className={inputCls}
                min={toLocalInput(todayStart())}
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="assignment-start" className={labelCls}>
                Opens <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="assignment-start"
                type="datetime-local"
                className={inputCls}
                min={toLocalInput(todayStart())}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Assign"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}