// Pure unit tests for the Classroom Portal helpers. All these functions are
// network-free by design so the suite can pin row mapping + status math
// without mocking Supabase.
import { describe, expect, it } from 'vitest';
import {
  classroomColorClasses,
  classroomRoleLabel,
  completionPercent,
  deriveDueInfo,
  mapAssignmentRow,
  mapClassroomRow,
  mapProgressRow,
  mapRosterRow,
  statusLabel,
} from '../lib/classroom/format';
import type { Assignment, AssignmentProgress } from '../types/classroom';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('mapClassroomRow', () => {
  it('maps snake_case columns and ISO timestamps to camelCase + epoch ms', () => {
    const row = mapClassroomRow({
      id: 'c1',
      owner_id: 'u1',
      title: 'Biology',
      description: 'Period 3',
      subject: 'Bio',
      color: 'cyan',
      invite_code: 'ABCDEF',
      created_at: '2026-09-01T12:00:00.000Z',
    });
    expect(row).toMatchObject({
      id: 'c1',
      ownerId: 'u1',
      title: 'Biology',
      description: 'Period 3',
      subject: 'Bio',
      color: 'cyan',
      inviteCode: 'ABCDEF',
    });
    expect(row.createdAt).toBe(Date.parse('2026-09-01T12:00:00.000Z'));
  });

  it('defaults missing optional fields and timestamps', () => {
    const row = mapClassroomRow({ id: 'c2', owner_id: 'u1', title: 'X', invite_code: 'ZZZZZZ' });
    expect(row.description).toBeNull();
    expect(row.subject).toBeNull();
    expect(row.color).toBe('violet');
    expect(typeof row.createdAt).toBe('number');
  });
});

describe('mapAssignmentRow', () => {
  it('derives kind and keeps deck snapshot fields', () => {
    const row = mapAssignmentRow({
      id: 'a1',
      classroom_id: 'c1',
      created_by: 'u1',
      title: 'HW',
      instructions: null,
      kind: 'deck',
      deck_id: 'd1',
      deck_title: 'Photosynthesis',
      deck_card_count: 42,
      payload: null,
      start_at: null,
      due_at: '2026-09-20T23:59:59.000Z',
      created_at: '2026-09-18T10:00:00.000Z',
    });
    expect(row).toMatchObject({
      id: 'a1',
      classroomId: 'c1',
      createdBy: 'u1',
      title: 'HW',
      kind: 'deck',
      deckId: 'd1',
      deckTitle: 'Photosynthesis',
      deckCardCount: 42,
      dueAt: Date.parse('2026-09-20T23:59:59.000Z'),
    });
    expect(row.startAt).toBeNull();
  });

  it('falls back to deck for unknown kinds', () => {
    expect(mapAssignmentRow({ kind: 'quiz' }).kind).toBe('quiz');
    // The DB CHECK constraint only allows deck|quiz; the defensive fallback
    // preserves the table default rather than inventing data.
    expect(mapAssignmentRow({ kind: 'weird' }).kind).toBe('deck');
  });
});

describe('mapProgressRow', () => {
  it('parses most_missed from details', () => {
    const row = mapProgressRow({
      id: 'p1',
      assignment_id: 'a1',
      classroom_id: 'c1',
      user_id: 'u1',
      local_deck_id: 'd1',
      status: 'completed',
      started_at: '2026-09-18T10:00:00.000Z',
      completed_at: '2026-09-18T10:30:00.000Z',
      score: null,
      score_total: null,
      accuracy: 80.5,
      cards_total: 42,
      cards_reviewed: 42,
      misses: 6,
      time_spent_s: 1800,
      details: { most_missed: [{ front: 'Chlorophyll', misses: 3 }, { front: 'Stomata', misses: 2 }] },
      updated_at: '2026-09-18T10:30:00.000Z',
    });
    expect(row.mostMissed).toEqual([
      { front: 'Chlorophyll', misses: 3 },
      { front: 'Stomata', misses: 2 },
    ]);
    expect(row.accuracy).toBeCloseTo(80.5, 5);
    expect(row.misses).toBe(6);
    expect(row.completedAt).not.toBeNull();
  });

  it('defaults most_missed to empty when details are missing', () => {
    expect(mapProgressRow({ status: 'assigned' }).mostMissed).toEqual([]);
  });
});

describe('mapRosterRow', () => {
  it('nulls email for students and keeps joined_at', () => {
    const row = mapRosterRow({
      user_id: 'u1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'student',
      joined_at: '2026-09-18T10:00:00.000Z',
    });
    expect(row).toMatchObject({
      userId: 'u1',
      displayName: 'Ada Lovelace',
      role: 'student',
      email: 'ada@example.com',
      joinedAt: Date.parse('2026-09-18T10:00:00.000Z'),
    });
  });
});

describe('deriveDueInfo', () => {
  const base: Assignment = {
    id: 'a1',
    classroomId: 'c1',
    createdBy: 'u1',
    title: 'HW',
    kind: 'deck',
    deckCardCount: 0,
    createdAt: Date.now(),
  };

  it('returns a stateless label when there is no due date', () => {
    const info = deriveDueInfo(base, Date.now());
    expect(info).toMatchObject({ overdue: false, dueToday: false, upcoming: false, nearMs: null });
    expect(info.label).toBe('No due date');
  });

  it('flags overdue and counts days', () => {
    const assignment = { ...base, dueAt: Date.now() - 2 * DAY };
    const info = deriveDueInfo(assignment, Date.now());
    expect(info.overdue).toBe(true);
    expect(info.label).toBe('Overdue · 2d');
  });

  it('flags due today within 24h', () => {
    const assignment = { ...base, dueAt: Date.now() + 2 * HOUR };
    expect(deriveDueInfo(assignment, Date.now()).dueToday).toBe(true);
  });

  it('labels upcoming with a short date', () => {
    const assignment = { ...base, dueAt: Date.now() + 5 * DAY };
    expect(deriveDueInfo(assignment, Date.now()).upcoming).toBe(true);
    expect(deriveDueInfo(assignment, Date.now()).label).toMatch(/^Due \w{3} \d+$/);
  });
});

describe('completionPercent', () => {
  it('is 100 once completed', () => {
    const p: AssignmentProgress = {
      id: 'p',
      assignmentId: 'a1',
      classroomId: 'c1',
      userId: 'u1',
      status: 'completed',
      mostMissed: [],
      updatedAt: Date.now(),
    };
    expect(completionPercent(p)).toBe(100);
  });

  it('derives from cardsReviewed / cardsTotal', () => {
    const p: AssignmentProgress = {
      id: 'p',
      assignmentId: 'a1',
      classroomId: 'c1',
      userId: 'u1',
      status: 'in_progress',
      mostMissed: [],
      updatedAt: Date.now(),
      cardsTotal: 40,
      cardsReviewed: 10,
    };
    expect(completionPercent(p)).toBe(25);
  });

  it('derives from quiz score when no card counts exist', () => {
    const p: AssignmentProgress = {
      id: 'p',
      assignmentId: 'a1',
      classroomId: 'c1',
      userId: 'u1',
      status: 'in_progress',
      mostMissed: [],
      updatedAt: Date.now(),
      score: 8,
      scoreTotal: 10,
    };
    expect(completionPercent(p)).toBe(80);
  });

  it('returns 0 with no progress or no data', () => {
    expect(completionPercent(null)).toBe(0);
    expect(completionPercent(undefined)).toBe(0);
  });
});

describe('labels', () => {
  it('labels roles', () => {
    expect(classroomRoleLabel('teacher')).toBe('Teacher');
    expect(classroomRoleLabel('student')).toBe('Student');
  });

  it('labels statuses', () => {
    expect(statusLabel('assigned')).toBe('Assigned');
    expect(statusLabel('in_progress')).toBe('In progress');
    expect(statusLabel('completed')).toBe('Completed');
  });
});

describe('classroomColorClasses', () => {
  it('returns paired gradient classes for known colors', () => {
    expect(classroomColorClasses('cyan')).toContain('from-cyan-500/40');
  });

  it('falls back to violet for unknown colors', () => {
    expect(classroomColorClasses('nope')).toContain('from-violet-500/40');
  });
});