import { requireSupabase } from "../database/supabase";
import { mapAssignmentRow, mapProgressRow } from "../../lib/classroom/format";
import type {
  Assignment,
  AssignmentProgress,
  AssignmentWithProgress,
} from "../../types/classroom";

export interface CreateAssignmentInput {
  classroomId: string;
  title: string;
  instructions?: string;
  kind?: "deck" | "quiz";
  deckId?: string | null;
  payload?: unknown;
  startAt?: number | null;
  dueAt?: number | null;
}

export interface UpdateAssignmentInput {
  title?: string;
  instructions?: string;
  startAt?: number | null;
  dueAt?: number | null;
}

export interface AcceptDeckResult {
  deckId: string;
  title: string;
}

export interface RecordProgressSummary {
  progressId: string;
  status: AssignmentProgress["status"];
  startedAt?: number | null;
  completedAt?: number | null;
  score?: number | null;
  scoreTotal?: number | null;
  accuracy?: number | null;
  cardsTotal?: number | null;
  cardsReviewed?: number | null;
  misses?: number | null;
  timeSpentS?: number | null;
}

function toIsoOrNull(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function asRow(data: unknown): Record<string, any> {
  return (data ?? {}) as Record<string, any>;
}

export const assignmentService = {
  async fetchAssignments(classroomId: string): Promise<Assignment[]> {
    const { data, error } = await requireSupabase()
      .from("assignments")
      .select("*")
      .eq("classroom_id", classroomId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAssignmentRow);
  },

  /** Assignments plus the per-student progress rows for a classroom. */
  async fetchClassroomAssignments(classroomId: string): Promise<AssignmentWithProgress[]> {
    const [assignments, progress] = await Promise.all([
      this.fetchAssignments(classroomId),
      this.fetchProgress(classroomId),
    ]);
    return assignments.map((a) => ({
      ...a,
      progress: progress.filter((p) => p.assignmentId === a.id).sort((x, y) => x.userId.localeCompare(y.userId)),
    }));
  },

  async fetchProgress(classroomId: string): Promise<AssignmentProgress[]> {
    const { data, error } = await requireSupabase()
      .from("assignment_progress")
      .select("*")
      .eq("classroom_id", classroomId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapProgressRow);
  },

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
    const { data, error } = await requireSupabase()
      .rpc("create_assignment", {
        p_classroom_id: input.classroomId,
        p_title: input.title,
        p_instructions: input.instructions ?? null,
        p_kind: input.kind ?? "deck",
        p_deck_id: input.deckId ?? null,
        p_payload: (input.payload as any) ?? null,
        p_start_at: toIsoOrNull(input.startAt),
        p_due_at: toIsoOrNull(input.dueAt),
      })
      .select()
      .single();
    if (error) throw error;
    return mapAssignmentRow(asRow(data));
  },

  async updateAssignment(assignmentId: string, input: UpdateAssignmentInput): Promise<Assignment> {
    const { data, error } = await requireSupabase()
      .rpc("update_assignment", {
        p_assignment_id: assignmentId,
        p_title: input.title ?? null,
        p_instructions: input.instructions ?? null,
        p_start_at: toIsoOrNull(input.startAt),
        p_due_at: toIsoOrNull(input.dueAt),
      })
      .select()
      .single();
    if (error) throw error;
    return mapAssignmentRow(asRow(data));
  },

  async deleteAssignment(assignmentId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("delete_assignment", {
      p_assignment_id: assignmentId,
    });
    if (error) throw error;
  },

  /** Student side: copy the teacher's deck into the student's own library. */
  async acceptClassDeck(assignmentId: string): Promise<AcceptDeckResult> {
    const { data, error } = await requireSupabase().rpc("accept_class_deck", {
      p_assignment_id: assignmentId,
    });
    if (error) throw error;
    return {
      deckId: data?.deck_id,
      title: data?.title,
    };
  },

  /**
   * Student side: after a study session on a class copy of a deck, refresh
   * every assignment that copy belongs to so the teacher sees live progress
   * without the student tapping "Refresh". A local deck id is unique to its
   * owner, so this only ever matches the caller's own progress rows.
   */
  async syncProgressForDeck(localDeckId: string): Promise<void> {
    const { data, error } = await requireSupabase()
      .from("assignment_progress")
      .select("assignment_id")
      .eq("local_deck_id", localDeckId);
    if (error) throw error;
    for (const row of data ?? []) {
      await this.recordProgress(row.assignment_id, { localDeckId });
    }
  },

  /** Student side: recompute + persist progress for an assignment. */
  async recordProgress(
    assignmentId: string,
    opts: { localDeckId?: string | null; quizCorrect?: number | null; quizTotal?: number | null } = {},
  ): Promise<RecordProgressSummary> {
    const { data, error } = await requireSupabase().rpc("record_assignment_progress", {
      p_assignment_id: assignmentId,
      p_local_deck_id: opts.localDeckId ?? null,
      p_quiz_correct: opts.quizCorrect ?? null,
      p_quiz_total: opts.quizTotal ?? null,
    });
    if (error) throw error;
    return {
      progressId: data?.progress_id,
      status: data?.status,
      startedAt: data?.started_at ? Date.parse(data.started_at) : null,
      completedAt: data?.completed_at ? Date.parse(data.completed_at) : null,
      score: data?.score ?? null,
      scoreTotal: data?.score_total ?? null,
      accuracy: data?.accuracy ?? null,
      cardsTotal: data?.cards_total ?? null,
      cardsReviewed: data?.cards_reviewed ?? null,
      misses: data?.misses ?? null,
      timeSpentS: data?.time_spent_s ?? null,
    };
  },
};
