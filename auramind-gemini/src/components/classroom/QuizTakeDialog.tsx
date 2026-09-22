import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  assignmentService,
  type QuizQuestion,
  type QuizResult,
} from "../../services/classroom/assignmentService";
import type { Assignment } from "../../types/classroom";

interface QuizTakeDialogProps {
  assignment: Assignment | null;
  onClose: () => void;
  /** Called after a graded attempt is saved, so the page can reload progress. */
  onSubmitted: () => void;
}

/**
 * Student side of a classroom quiz: one multiple-choice question at a time,
 * graded by the server on submit. The client never learns the right answers
 * until it has submitted, and even then only which prompts were missed.
 */
export function QuizTakeDialog({ assignment, onClose, onSubmitted }: QuizTakeDialogProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  const assignmentId = assignment?.id;

  useEffect(() => {
    if (!assignmentId) return;
    let alive = true;
    setQuestions(null);
    setLoadError(false);
    setIndex(0);
    setAnswers({});
    setResult(null);
    assignmentService
      .getQuizQuestions(assignmentId)
      .then((qs) => {
        if (alive) setQuestions(qs);
      })
      .catch((err) => {
        console.error("[QuizTakeDialog] Could not load quiz:", err);
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  const total = questions?.length ?? 0;
  const current = questions?.[index];
  const answeredCount = questions?.filter((q) => answers[q.id] !== undefined).length ?? 0;
  const allAnswered = total > 0 && answeredCount === total;

  const submit = async () => {
    if (!assignmentId || !allAnswered) return;
    setSubmitting(true);
    try {
      const graded = await assignmentService.submitQuiz(assignmentId, answers);
      setResult(graded);
      onSubmitted();
    } catch (err) {
      console.error("[QuizTakeDialog] Could not submit quiz:", err);
      toast.error("Could not submit your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={assignment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border border-white/10 bg-[#0E1420] text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{assignment?.title ?? "Quiz"}</DialogTitle>
          <DialogDescription>
            {result
              ? "Your teacher sees your best attempt."
              : total > 0
                ? `Question ${index + 1} of ${total}`
                : "Multiple choice, from your teacher's deck."}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-rose-200/80">This quiz could not be loaded. Close and try again.</p>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center">
              <p className="text-4xl font-bold tabular-nums text-white">
                {result.score}/{result.total}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {Math.round(result.accuracy)}% · attempt {result.attempts}
              </p>
            </div>
            {result.missed.length > 0 && (
              <div>
                <p className="nova-label mb-1.5">Review these</p>
                <ul className="space-y-1 text-sm text-rose-200/80">
                  {result.missed.map((front, i) => (
                    <li key={`${i}-${front}`}>{front}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : !questions ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" aria-busy="true" aria-label="Loading quiz" />
        ) : total === 0 ? (
          <p className="text-sm text-zinc-400">This quiz has no questions yet.</p>
        ) : current ? (
          <div className="space-y-4">
            <div className="nova-track h-1.5 rounded-full bg-white/[0.08]" aria-hidden>
              <div
                className="nova-track-fill h-full rounded-full"
                style={{ width: `${Math.round((answeredCount / total) * 100)}%` }}
              />
            </div>
            <p className="text-base font-semibold text-white">{current.prompt}</p>
            <div className="space-y-2" role="radiogroup" aria-label={current.prompt}>
              {current.choices.map((choice) => {
                const selected = answers[current.id] === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: choice }))}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                      selected
                        ? "border-violet-400/40 bg-violet-500/15 text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                Back
              </Button>
              {index < total - 1 ? (
                <Button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                  disabled={answers[current.id] === undefined}
                >
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={() => void submit()} disabled={!allAnswered || submitting}>
                  {submitting ? "Grading…" : "Submit answers"}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default QuizTakeDialog;
