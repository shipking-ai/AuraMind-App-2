import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { AssignDeckModal } from "../../components/classroom/AssignDeckModal";
import { ClassProgress } from "../../components/classroom/ClassProgress";
import { QuizTakeDialog } from "../../components/classroom/QuizTakeDialog";
import { classroomService } from "../../services/classroom/classroomService";
import { assignmentService } from "../../services/classroom/assignmentService";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import {
  classroomColorClasses,
  classroomRoleLabel,
  completionPercent,
  deriveDueInfo,
  statusLabel,
} from "../../lib/classroom/format";
import type {
  Assignment,
  AssignmentWithProgress,
  Classroom,
  AssignmentProgress,
  RosterEntry,
} from "../../types/classroom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  GraduationCap,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "../../components/icons";

const inputCls =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40";

const labelCls = "nova-label mb-1.5";

type Tab = "classwork" | "people";

function DueChip({ maybe }: { maybe: ReturnType<typeof deriveDueInfo> }) {
  let cls = "border-white/[0.1] bg-white/[0.05] text-zinc-400";
  if (maybe.overdue) cls = "border-rose-400/25 bg-rose-400/10 text-rose-200";
  else if (maybe.dueToday) cls = "border-amber-400/25 bg-amber-400/10 text-amber-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${cls}`}>
      <Clock className="h-3 w-3" aria-hidden />
      {maybe.label}
    </span>
  );
}

function KindChip({ kind, deckTitle, deckCardCount }: { kind: "deck" | "quiz"; deckTitle?: string | null; deckCardCount: number }) {
  return kind === "deck" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">
      <BookOpen className="h-3 w-3" aria-hidden />
      {deckTitle ? `${deckTitle} · ${deckCardCount} cards` : `${deckCardCount} cards`}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
      <ListChecks className="h-3 w-3" aria-hidden />
      Quiz
    </span>
  );
}

function StatusChip({ status }: { status: AssignmentProgress["status"] }) {
  const cls =
    status === "completed"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : status === "in_progress"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
        : "border-white/[0.1] bg-white/[0.05] text-zinc-400";
  const Icon = status === "completed" ? CheckCircle2 : Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = workspace?.user?.id;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState<Tab>("classwork");
  const [assignOpen, setAssignOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Graded quiz (deck-backed) and legacy self-reported quiz dialogs
  const [takingQuiz, setTakingQuiz] = useState<Assignment | null>(null);
  const [quizAssignment, setQuizAssignment] = useState<Assignment | null>(null);
  const [quizCorrect, setQuizCorrect] = useState("");
  const [quizTotal, setQuizTotal] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cls, members, assignRows] = await Promise.all([
        classroomService.fetchClassroom(id),
        classroomService.fetchRoster(id),
        assignmentService.fetchClassroomAssignments(id),
      ]);
      if (!cls) {
        setNotFound(true);
        return;
      }
      setClassroom(cls);
      setRoster(members);
      setAssignments(assignRows);
      setNotFound(false);
    } catch (err) {
      console.error("[ClassDetailPage] Could not load class:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const myRole = roster.find((r) => r.userId === userId)?.role ?? "student";
  const isTeacher = myRole === "teacher";
  const isOwner = classroom?.ownerId === userId;

  const progressByUser = useCallback(
    (assignment: AssignmentWithProgress, uid: string | undefined) =>
      assignment.progress.find((p) => p.userId === uid) ?? null,
    [],
  );

  const copyInvite = async () => {
    if (!classroom) return;
    const text = `Join my AuraMind class "${classroom.title}" with code ${classroom.inviteCode}\n${window.location.origin}/dashboard/classes?join=${classroom.inviteCode}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Class invite copied");
    } catch {
      toast.error("Could not copy the invite.");
    }
  };

  const refreshCode = async () => {
    if (!classroom || !isTeacher) return;
    if (!window.confirm("New invite code? Old links to this class will stop working.")) return;
    try {
      const updated = await classroomService.refreshInviteCode(classroom.id);
      setClassroom(updated);
      toast.success("Invite code refreshed");
    } catch (err) {
      console.error("[ClassDetailPage] Could not refresh code:", err);
      toast.error("Could not refresh the invite code.");
    }
  };

  const deleteClass = async () => {
    if (!classroom) return;
    if (!window.confirm(`Delete "${classroom.title}" and all its assignments? This cannot be undone.`)) return;
    try {
      await classroomService.deleteClassroom(classroom.id);
      toast.success("Class deleted");
      navigate("/dashboard/classes");
    } catch (err) {
      console.error("[ClassDetailPage] Could not delete class:", err);
      toast.error("Could not delete the class.");
    }
  };

  const leaveClass = async () => {
    if (!classroom) return;
    if (!window.confirm(`Leave "${classroom.title}"? You can rejoin with the invite code.`)) return;
    try {
      await classroomService.leaveClassroom(classroom.id);
      toast.success(`Left ${classroom.title}`);
      navigate("/dashboard/classes");
    } catch (err) {
      console.error("[ClassDetailPage] Could not leave class:", err);
      toast.error("Could not leave the class.");
    }
  };

  const deleteAssignment = async (assignment: Assignment) => {
    if (!window.confirm(`Delete "${assignment.title}"? Student progress for it will be removed too.`)) return;
    try {
      await assignmentService.deleteAssignment(assignment.id);
      toast.success("Assignment deleted");
      await load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not delete assignment:", err);
      toast.error("Could not delete the assignment.");
    }
  };

  const toggleRole = async (entry: RosterEntry) => {
    if (!classroom) return;
    const target = entry.role === "teacher" ? "student" : "teacher";
    try {
      await classroomService.setMemberRole(classroom.id, entry.userId, target);
      toast.success(`${entry.displayName} is now ${target === "teacher" ? "a teacher" : "a student"}`);
      await load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not change role:", err);
      toast.error("Only the class owner can change roles.");
    }
  };

  const removeMember = async (entry: RosterEntry) => {
    if (!classroom) return;
    if (!window.confirm(`Remove ${entry.displayName} from this class?`)) return;
    try {
      await classroomService.removeMember(classroom.id, entry.userId);
      toast.success(`${entry.displayName} removed`);
      await load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not remove member:", err);
      toast.error("Could not remove that member.");
    }
  };

  // ─── Student deck flow ────────────────────────────────────────────────────
  const startDeckAssignment = async (assignment: AssignmentWithProgress) => {
    if (!workspace) return;
    const mine = progressByUser(assignment, userId);
    if (mine?.localDeckId) {
      workspace.startStudyForDeck(mine.localDeckId);
      return;
    }
    setBusy(true);
    try {
      const { deckId } = await assignmentService.acceptClassDeck(assignment.id);
      await assignmentService.recordProgress(assignment.id, { localDeckId: deckId });
      toast.success("Deck added to your library — starting now");
      workspace.startStudyForDeck(deckId);
      void load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not start assignment:", err);
      toast.error("Could not open this assignment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const syncProgress = async (assignment: AssignmentWithProgress) => {
    setBusy(true);
    try {
      const summary = await assignmentService.recordProgress(assignment.id);
      if (summary.status === "completed") {
        toast.success("Nice — completed! Accuracy synced.");
      } else if (summary.status === "in_progress") {
        toast.success("Progress refreshed — keep going!");
      } else {
        toast.success("Progress refreshed");
      }
      await load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not sync progress:", err);
      toast.error("Could not refresh progress.");
    } finally {
      setBusy(false);
    }
  };

  const openQuizComplete = (assignment: AssignmentWithProgress) => {
    // Quizzes built from a deck are taken in-app and graded by the server.
    if (assignment.deckId) {
      setTakingQuiz(assignment);
      return;
    }
    const mine = progressByUser(assignment, userId);
    setQuizCorrect(mine?.score != null ? String(mine.score) : "");
    setQuizTotal(mine?.scoreTotal != null ? String(mine.scoreTotal) : "");
    setQuizAssignment(assignment);
  };

  const submitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizAssignment) return;
    const correct = Number(quizCorrect);
    const total = Number(quizTotal);
    if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0 || correct < 0 || correct > total) {
      toast.error("Enter a valid score (correct out of total).");
      return;
    }
    setBusy(true);
    try {
      await assignmentService.recordProgress(quizAssignment.id, {
        quizCorrect: correct,
        quizTotal: total,
      });
      toast.success(`Recorded ${correct}/${total} — ${Math.round((correct / total) * 100)}%`);
      setQuizAssignment(null);
      void load();
    } catch (err) {
      console.error("[ClassDetailPage] Could not record quiz:", err);
      toast.error("Could not record the quiz score.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading class">
        <div className="h-44 animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.04]" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !classroom) {
    return (
      <div className="nova-card-elevated px-6 py-16 text-center sm:px-12">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15">
          <GraduationCap className="h-9 w-9 text-violet-200/80" aria-hidden />
        </div>
        <h2 className="nova-display text-3xl text-white">Class not found</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
          It may have been deleted, or you lost access to it.
        </p>
        <Button className="mt-6" onClick={() => navigate("/dashboard/classes")}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to classes
        </Button>
      </div>
    );
  }

  const gradient = classroomColorClasses(classroom.color);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate("/dashboard/classes")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All classes
      </button>

      {/* Hero */}
      <section className={`nova-card-elevated relative overflow-hidden bg-gradient-to-br ${gradient}`}>
        <div className="relative z-10 flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
                <GraduationCap className="h-3 w-3" aria-hidden />
                {classroomRoleLabel(myRole)}
              </span>
              {isOwner && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                  <ShieldCheck className="h-3 w-3" aria-hidden />
                  Owner
                </span>
              )}
              {classroom.subject && (
                <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-bold text-white/80">
                  {classroom.subject}
                </span>
              )}
            </div>
            <h1 className="nova-display mt-3 text-3xl text-white sm:text-4xl">{classroom.title}</h1>
            {classroom.description && (
              <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-white/80">
                {classroom.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {/* Invite code panel */}
            <div className="rounded-2xl border border-white/15 bg-black/30 p-4 backdrop-blur-sm">
              <div className="nova-label text-white/60">Invite code</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-2xl font-black tracking-[0.3em] text-white">
                  {classroom.inviteCode}
                </span>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  aria-label="Copy class invite"
                  className="rounded-lg border border-white/15 bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => void refreshCode()}
                    aria-label="Generate a new invite code"
                    className="rounded-lg border border-white/15 bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-white/50">Students join at Classes → Join with code.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("classwork")}
            className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
              tab === "classwork" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Classwork
          </button>
          <button
            type="button"
            onClick={() => setTab("people")}
            className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
              tab === "people" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            People ({roster.length})
          </button>
        </div>
        <div className="flex gap-2">
          {isTeacher && (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New assignment
            </Button>
          )}
          {isOwner ? (
            <Button variant="destructive" onClick={() => void deleteClass()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete class
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => void leaveClass()}>
              <LogOut className="h-4 w-4" aria-hidden /> Leave class
            </Button>
          )}
        </div>
      </div>

      {/* Workspace */}
      {tab === "classwork" ? (
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="nova-card px-6 py-12 text-center">
              <ListChecks className="mx-auto mb-3 h-8 w-8 text-zinc-600" aria-hidden />
              <p className="text-sm font-semibold text-white">
                {isTeacher ? "Nothing assigned yet" : "Nothing due yet"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {isTeacher
                  ? "Assign your first deck or quiz to the class."
                  : "Check back soon — your teacher hasn't posted anything yet."}
              </p>
              {isTeacher && (
                <Button className="mt-5" onClick={() => setAssignOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> New assignment
                </Button>
              )}
            </div>
          ) : (
            assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                isTeacher={isTeacher}
                userId={userId}
                busy={busy}
                roster={roster}
                expanded={expandedId === assignment.id}
                onToggleExpand={() =>
                  setExpandedId((prev) => (prev === assignment.id ? null : assignment.id))
                }
                onDelete={() => void deleteAssignment(assignment)}
                onStart={() => void startDeckAssignment(assignment)}
                onSync={() => void syncProgress(assignment)}
                onCompleteQuiz={() => openQuizComplete(assignment)}
                progressFor={progressByUser}
              />
            ))
          )}
        </div>
      ) : (
        <div className="nova-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" aria-hidden />
              <span className="text-sm font-semibold text-white">Roster</span>
            </div>
            {isTeacher && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <UserPlus className="h-3 w-3" aria-hidden /> Share the invite code above
              </span>
            )}
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {roster.map((entry) => (
              <li key={entry.userId} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-[12px] font-bold text-white">
                  {entry.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{entry.displayName}</span>
                    {entry.userId === classroom.ownerId && (
                      <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                        Owner
                      </span>
                    )}
                  </div>
                  {isTeacher && entry.email && (
                    <div className="truncate text-[11px] text-zinc-500">{entry.email}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {classroomRoleLabel(entry.role)}
                  </span>
                  {isOwner && entry.userId !== userId && (
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void toggleRole(entry)}
                        aria-label={`Make ${entry.displayName} ${entry.role === "teacher" ? "a student" : "a teacher"}`}
                      >
                        {entry.role === "teacher" ? "Make student" : "Make teacher"}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => void removeMember(entry)}
                        aria-label={`Remove ${entry.displayName}`}
                      >
                        <Trash2 className="h-3 w-3 text-rose-300" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create-assignment dialog */}
      {isTeacher && (
        <AssignDeckModal
          classroomId={classroom.id}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          decks={workspace?.decks ?? []}
          onCreated={() => void load()}
        />
      )}

      <QuizTakeDialog
        assignment={takingQuiz}
        onClose={() => setTakingQuiz(null)}
        onSubmitted={() => void load()}
      />

      {/* Legacy quiz (no deck): self-reported score */}
      <Dialog open={quizAssignment !== null} onOpenChange={(open) => !open && setQuizAssignment(null)}>
        <DialogContent className="max-w-sm border border-white/10 bg-[#0E1420] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Complete quiz</DialogTitle>
            <DialogDescription>
              {quizAssignment?.title} — enter your results to record this for your teacher.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitQuiz} className="mt-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label htmlFor="quiz-correct" className={labelCls}>
                  Correct
                </label>
                <input
                  id="quiz-correct"
                  type="number"
                  min={0}
                  className={inputCls}
                  value={quizCorrect}
                  onChange={(e) => setQuizCorrect(e.target.value)}
                  required
                />
              </div>
              <div className="flex-1">
                <label htmlFor="quiz-total" className={labelCls}>
                  Total questions
                </label>
                <input
                  id="quiz-total"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={quizTotal}
                  onChange={(e) => setQuizTotal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setQuizAssignment(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Record results"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Assignment card ────────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  isTeacher,
  userId,
  busy,
  roster,
  expanded,
  onToggleExpand,
  onDelete,
  onStart,
  onSync,
  onCompleteQuiz,
  progressFor,
}: {
  assignment: AssignmentWithProgress;
  isTeacher: boolean;
  userId: string | undefined;
  busy: boolean;
  roster: RosterEntry[];
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onStart: () => void;
  onSync: () => void;
  onCompleteQuiz: () => void;
  progressFor: (a: AssignmentWithProgress, uid: string | undefined) => AssignmentProgress | null;
}) {
  const mine = progressFor(assignment, userId);
  const due = deriveDueInfo(assignment);
  const done = assignment.progress.filter((p) => p.status === "completed").length;
  const started = assignment.progress.filter((p) => p.status === "in_progress").length;
  const pct = completionPercent(mine);

  return (
    <section className="nova-card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <KindChip kind={assignment.kind} deckTitle={assignment.deckTitle} deckCardCount={assignment.deckCardCount} />
              {assignment.dueAt != null && !isTeacher && mine && <StatusChip status={mine.status} />}
              {assignment.dueAt != null && <DueChip maybe={due} />}
              {assignment.instructions && (
                <span className="w-full text-[11px] text-zinc-500 sm:mt-0.5">
                  {assignment.instructions}
                </span>
              )}
            </div>
            <h3 className="mt-2 truncate text-base font-semibold text-white">{assignment.title}</h3>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isTeacher ? (
              <>
                <span className="text-[11px] font-bold tabular-nums text-zinc-500">
                  {done}/{assignment.progress.length || roster.length} done
                  {started > 0 ? ` · ${started} in progress` : ""}
                </span>
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label={`Delete ${assignment.title}`}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
                <motion.button
                  type="button"
                  onClick={onToggleExpand}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Hide progress" : "Show progress"}
                  className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                </motion.button>
              </>
            ) : (
              <>
                {mine && (
                  <div className="hidden w-28 sm:block">
                    <div className="mb-1 flex justify-between text-[10px] font-bold tabular-nums">
                      <span className="text-zinc-400">{pct}%</span>
                      {mine.cardsReviewed != null && mine.cardsTotal != null && (
                        <span className="text-zinc-600">{mine.cardsReviewed}/{mine.cardsTotal}</span>
                      )}
                    </div>
                    <div className="nova-track h-1.5 rounded-full bg-white/[0.08]">
                      <div className="nova-track-fill h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Student actions / details — show under the title for non-teachers */}
        {!isTeacher && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
            {assignment.kind === "deck" ? (
              <>
                <Button size="sm" onClick={onStart} disabled={busy}>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  {!mine
                    ? "Start"
                    : mine.status === "completed"
                      ? "Study again"
                      : "Continue"}
                </Button>
                {mine && mine.status !== "completed" && (
                  <Button size="sm" variant="outline" onClick={onSync} disabled={busy}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh progress
                  </Button>
                )}
                {mine && mine.mostMissed.length > 0 ? (
                  <span className="text-[11px] text-rose-200/70">
                    You missed: {mine.mostMissed.map((m) => m.front).slice(0, 2).join(", ")}
                  </span>
                ) : mine?.status === "in_progress" ? (
                  <span className="text-[11px] text-zinc-500">
                    Study the cards, then press refresh to keep your teacher in the loop.
                  </span>
                ) : null}
                {mine?.status === "completed" && mine?.accuracy != null && (
                  <span className="text-[11px] font-semibold tabular-nums text-emerald-300">
                    Accuracy {mine.accuracy}%
                  </span>
                )}
              </>
            ) : (
              <>
                <Button size="sm" onClick={onCompleteQuiz} disabled={busy}>
                  <ListChecks className="h-3.5 w-3.5" aria-hidden />
                  {assignment.deckId
                    ? mine?.status === "completed" ? "Retake quiz" : "Take quiz"
                    : mine?.status === "completed" ? "Record new score" : "Complete quiz"}
                </Button>
                {mine?.status === "completed" && mine?.accuracy != null && (
                  <span className="text-[11px] font-semibold tabular-nums text-emerald-300">
                    {assignment.deckId ? "Best" : "Score"} {mine.score}/{mine.scoreTotal} · {Math.round(mine.accuracy)}%
                  </span>
                )}
              </>
            )}
            {!mine && <StatusChip status="assigned" />}
          </div>
        )}
      </div>

      {/* Teacher progress grid */}
      {isTeacher && expanded && (
        <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4 sm:px-5">
          <ClassProgress progress={assignment.progress} roster={roster} />
        </div>
      )}
    </section>
  );
}
export default ClassDetailPage;
