import { requireSupabase } from "../database/supabase";
import {
  mapClassroomRow,
  mapMembershipRow,
  mapRosterRow,
} from "../../lib/classroom/format";
import type {
  Classroom,
  ClassroomMembership,
  RosterEntry,
} from "../../types/classroom";

export interface CreateClassroomInput {
  title: string;
  description?: string;
  subject?: string;
  color?: string;
}

export interface UpdateClassroomInput {
  title?: string;
  description?: string;
  subject?: string;
  color?: string;
}

function asRow(data: unknown): Record<string, any> {
  return (data ?? {}) as Record<string, any>;
}

export const classroomService = {
  /** The signed-in user's classrooms with the user's role in each. */
  async fetchMyClassrooms(userId: string): Promise<ClassroomMembership[]> {
    const { data, error } = await requireSupabase()
      .from("classroom_memberships")
      .select("classroom_id, user_id, role, joined_at, classrooms(*)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).flatMap((row: any) => {
      if (!row.classrooms) return [];
      return [
        {
          ...mapMembershipRow(row),
          classroom: mapClassroomRow(row.classrooms),
        } as ClassroomMembership,
      ];
    });
  },

  async fetchClassroom(classroomId: string): Promise<Classroom | null> {
    const { data, error } = await requireSupabase()
      .from("classrooms")
      .select("*")
      .eq("id", classroomId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapClassroomRow(asRow(data)) : null;
  },

  async createClassroom(input: CreateClassroomInput): Promise<Classroom> {
    const { data, error } = await requireSupabase()
      .rpc("create_classroom", {
        p_title: input.title,
        p_description: input.description ?? null,
        p_subject: input.subject ?? null,
        p_color: input.color ?? "violet",
      })
      .select()
      .single();

    if (error) throw error;
    return mapClassroomRow(asRow(data));
  },

  async updateClassroom(classroomId: string, input: UpdateClassroomInput): Promise<Classroom> {
    const { data, error } = await requireSupabase()
      .rpc("update_classroom", {
        p_classroom_id: classroomId,
        p_title: input.title ?? null,
        p_description: input.description ?? null,
        p_subject: input.subject ?? null,
        p_color: input.color ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return mapClassroomRow(asRow(data));
  },

  async deleteClassroom(classroomId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("delete_classroom", {
      p_classroom_id: classroomId,
    });
    if (error) throw error;
  },

  async refreshInviteCode(classroomId: string): Promise<Classroom> {
    const { data, error } = await requireSupabase()
      .rpc("refresh_class_invite_code", { p_classroom_id: classroomId })
      .select()
      .single();
    if (error) throw error;
    return mapClassroomRow(asRow(data));
  },

  async joinClassroom(code: string): Promise<Classroom> {
    const { data, error } = await requireSupabase()
      .rpc("join_classroom_with_code", { p_code: code })
      .select()
      .single();
    if (error) throw error;
    return mapClassroomRow(asRow(data));
  },

  async leaveClassroom(classroomId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("leave_classroom", {
      p_classroom_id: classroomId,
    });
    if (error) throw error;
  },

  async removeMember(classroomId: string, userId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("remove_classroom_member", {
      p_classroom_id: classroomId,
      p_user_id: userId,
    });
    if (error) throw error;
  },

  async setMemberRole(classroomId: string, userId: string, role: "teacher" | "student"): Promise<void> {
    const { error } = await requireSupabase().rpc("set_class_member_role", {
      p_classroom_id: classroomId,
      p_user_id: userId,
      p_role: role,
    });
    if (error) throw error;
  },

  async fetchRoster(classroomId: string): Promise<RosterEntry[]> {
    const { data, error } = await requireSupabase().rpc("classroom_roster", {
      p_classroom_id: classroomId,
    });
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapRosterRow);
  },
};

export type ClassroomJoinErrorKind = "not_found" | "already_member" | "other";

/** Classify a join-classroom RPC error into a UI-friendly kind. */
export function classifyJoinError(err: unknown): ClassroomJoinErrorKind {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("urn:auramind:classroom:not_found")) return "not_found";
  if (message.includes("urn:auramind:classroom:already_member")) return "already_member";
  return "other";
}
