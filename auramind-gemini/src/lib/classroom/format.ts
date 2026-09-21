import type {
  Assignment,
  AssignmentProgress,
  AssignmentStatus,
  Classroom,
  ClassroomMemberRole,
  MostMissedTerm,
  RosterEntry,
} from "../../types/classroom";

// Pure, testable helpers for the Classroom Portal. No network imports so the
// unit suite can pin the mapping + status math without mocking Supabase.

export const CLASSROOM_COLORS = [
  "violet",
  "cyan",
  "fuchsia",
  "amber",
  "emerald",
] as const;

export function classroomColorClasses(color: string): string {
  const map: Record<string, string> = {
    violet: "from-violet-500/40 to-violet-600/10 text-violet-200",
    cyan: "from-cyan-500/40 to-cyan-600/10 text-cyan-200",
    fuchsia: "from-fuchsia-500/40 to-fuchsia-600/10 text-fuchsia-200",
    amber: "from-amber-500/40 to-amber-600/10 text-amber-200",
    emerald: "from-emerald-500/40 to-emerald-600/10 text-emerald-200",
  };
  return map[color] ?? map.violet;
}

export function classroomRoleLabel(role: ClassroomMemberRole): string {
  return role === "teacher" ? "Teacher" : "Student";
}

// ─── Row → model mappers (snake_case DB rows → camelCase app types) ────────

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function mapClassroomRow(row: Record<string, any>): Classroom {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? null,
    subject: row.subject ?? null,
    color: row.color ?? "violet",
    inviteCode: row.invite_code,
    createdAt: toMs(row.created_at) ?? Date.now(),
  };
}

export function mapMembershipRow(row: Record<string, any>): {
  classroomId: string;
  userId: string;
  role: ClassroomMemberRole;
  joinedAt: number;
} {
  return {
    classroomId: row.classroom_id ?? row.classrooms?.id,
    userId: row.user_id,
    role: row.role === "teacher" ? "teacher" : "student",
    joinedAt: toMs(row.joined_at) ?? Date.now(),
  };
}

export function mapRosterRow(row: Record<string, any>): RosterEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email ?? null,
    role: row.role === "teacher" ? "teacher" : "student",
    joinedAt: toMs(row.joined_at) ?? Date.now(),
  };
}

export function mapAssignmentRow(row: Record<string, any>): Assignment {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    createdBy: row.created_by,
    title: row.title,
    instructions: row.instructions ?? null,
    kind: row.kind === "quiz" ? "quiz" : "deck",
    deckId: row.deck_id ?? null,
    deckTitle: row.deck_title ?? null,
    deckCardCount: Number(row.deck_card_count ?? 0),
    payload: row.payload ?? undefined,
    startAt: toMs(row.start_at),
    dueAt: toMs(row.due_at),
    createdAt: toMs(row.created_at) ?? Date.now(),
  };
}

export function mapProgressRow(row: Record<string, any>): AssignmentProgress {
  const details = row.details ?? {};
  const mostMissed: MostMissedTerm[] = Array.isArray(details.most_missed)
    ? details.most_missed.map((m: any) => ({
        front: m.front ?? "",
        misses: Number(m.misses ?? 0),
      }))
    : [];
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    classroomId: row.classroom_id,
    userId: row.user_id,
    localDeckId: row.local_deck_id ?? null,
    status: (row.status ?? "assigned") as AssignmentStatus,
    startedAt: toMs(row.started_at),
    completedAt: toMs(row.completed_at),
    score: row.score != null ? Number(row.score) : null,
    scoreTotal: row.score_total != null ? Number(row.score_total) : null,
    accuracy: row.accuracy != null ? Number(row.accuracy) : null,
    cardsTotal: row.cards_total != null ? Number(row.cards_total) : null,
    cardsReviewed: row.cards_reviewed != null ? Number(row.cards_reviewed) : null,
    misses: row.misses != null ? Number(row.misses) : null,
    timeSpentS: row.time_spent_s != null ? Number(row.time_spent_s) : null,
    mostMissed,
    updatedAt: toMs(row.updated_at ?? row.created_at) ?? Date.now(),
  };
}

// ─── Status derivation ─────────────────────────────────────────────────────

export interface AssignmentDueInfo {
  overdue: boolean;
  dueToday: boolean;
  upcoming: boolean;
  label: string;
  nearMs: number | null;
}

export function deriveDueInfo(assignment: Assignment, nowMs = Date.now()): AssignmentDueInfo {
  if (!assignment.dueAt) {
    return { overdue: false, dueToday: false, upcoming: false, label: "No due date", nearMs: null };
  }
  const diffMs = assignment.dueAt - nowMs;
  const overdue = diffMs < 0;
  const dueToday = !overdue && diffMs < 24 * 60 * 60 * 1000;
  const upcoming = !overdue && !dueToday;

  let label: string;
  if (overdue) {
    const days = Math.max(1, Math.ceil(-diffMs / (24 * 60 * 60 * 1000)));
    label = `Overdue · ${days}d`;
  } else if (dueToday) {
    label = "Due today";
  } else {
    label = `Due ${new Date(assignment.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return { overdue, dueToday, upcoming, label, nearMs: assignment.dueAt };
}

export function completionPercent(progress?: AssignmentProgress | null): number {
  if (!progress) return 0;
  if (progress.status === "completed") return 100;
  if (
    progress.cardsTotal != null &&
    progress.cardsTotal > 0 &&
    progress.cardsReviewed != null
  ) {
    return Math.min(100, Math.round((progress.cardsReviewed / progress.cardsTotal) * 100));
  }
  if (progress.scoreTotal != null && progress.scoreTotal > 0 && progress.score != null) {
    return Math.min(100, Math.round((progress.score / progress.scoreTotal) * 100));
  }
  return 0;
}

export function statusLabel(status: AssignmentStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    default:
      return "Assigned";
  }
}