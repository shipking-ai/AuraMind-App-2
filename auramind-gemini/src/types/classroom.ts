export type ClassroomMemberRole = "teacher" | "student";

export type AssignmentKind = "deck" | "quiz";

export type AssignmentStatus = "assigned" | "in_progress" | "completed";

export interface Classroom {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  color: string;
  inviteCode: string;
  createdAt: number;
}

export interface ClassroomMembership {
  classroomId: string;
  userId: string;
  role: ClassroomMemberRole;
  joinedAt: number;
  classroom?: Classroom;
}

export interface RosterEntry {
  userId: string;
  displayName: string;
  email?: string | null;
  role: ClassroomMemberRole;
  joinedAt: number;
}

export interface Assignment {
  id: string;
  classroomId: string;
  createdBy: string;
  title: string;
  instructions?: string | null;
  kind: AssignmentKind;
  deckId?: string | null;
  deckTitle?: string | null;
  deckCardCount: number;
  payload?: unknown;
  startAt?: number | null;
  dueAt?: number | null;
  createdAt: number;
}

export interface MostMissedTerm {
  front: string;
  misses: number;
}

export interface AssignmentProgress {
  id: string;
  assignmentId: string;
  classroomId: string;
  userId: string;
  localDeckId?: string | null;
  status: AssignmentStatus;
  startedAt?: number | null;
  completedAt?: number | null;
  score?: number | null;
  scoreTotal?: number | null;
  accuracy?: number | null;
  cardsTotal?: number | null;
  cardsReviewed?: number | null;
  misses?: number | null;
  timeSpentS?: number | null;
  mostMissed: MostMissedTerm[];
  updatedAt: number;
}

/** An assignment rendered for a classroom: the assignment plus each
 * student's progress for the teacher's progress grid. */
export interface AssignmentWithProgress extends Assignment {
  progress: AssignmentProgress[];
}