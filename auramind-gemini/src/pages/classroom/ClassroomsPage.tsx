import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import {
  classroomService,
  classifyJoinError,
} from "../../services/classroom/classroomService";
import { useDashboardWorkspace } from "../../contexts/DashboardWorkspaceContext";
import {
  CLASSROOM_COLORS,
  classroomColorClasses,
  classroomRoleLabel,
} from "../../lib/classroom/format";
import type { ClassroomMembership } from "../../types/classroom";
import {
  GraduationCap,
  Plus,
  UserPlus,
  ChevronRight,
  Copy,
  Sparkles,
} from "../../components/icons";

const inputCls =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40";

const labelCls = "nova-label mb-1.5";

function EmptyClasses() {
  const navigate = useNavigate();
  return (
    <div className="nova-card-elevated px-6 py-14 text-center sm:px-12">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15">
        <GraduationCap className="h-9 w-9 text-violet-200/80" aria-hidden />
      </div>
      <p className="nova-label text-violet-200/80">Classroom portal</p>
      <h2 className="nova-display mt-2 text-3xl text-white sm:text-4xl">
        No classes yet
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-300/85">
        Create a class to assign decks and quizzes, or join one with a six-letter
        invite code.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/dashboard/classes?new=1")}
          className="nova-cta"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Create a class
        </button>
        <button
          type="button"
          onClick={() => navigate("/dashboard/classes?join=1")}
          className="nova-cta-ghost"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden /> Join with a code
        </button>
      </div>
    </div>
  );
}

export function ClassroomsPage() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = workspace?.user?.id;
  const [params, setParams] = useSearchParams();

  const [memberships, setMemberships] = useState<ClassroomMembership[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinPrefill, setJoinPrefill] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(CLASSROOM_COLORS[0]);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await classroomService.fetchMyClassrooms(userId);
      setMemberships(rows);
    } catch (err) {
      console.error("[ClassroomsPage] Could not load classrooms:", err);
      toast.error("Could not load your classrooms.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep-link handling: ?new=1 opens the create dialog, ?join=CODE opens the
  // join dialog pre-filled with the shared invite code.
  useEffect(() => {
    const newFlag = params.get("new");
    if (newFlag === "1") {
      setCreateOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
      return;
    }
    const joinFlag = params.get("join");
    if (joinFlag) {
      const hasCode = /^[A-Za-z0-9]{6}$/.test(joinFlag);
      setJoinPrefill(joinFlag.toUpperCase());
      if (!hasCode) setJoinError("That invite link looks incomplete.");
      setJoinOpen(true);
      params.delete("join");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateOpen = () => {
    setTitle("");
    setSubject("");
    setDescription("");
    setColor(CLASSROOM_COLORS[0]);
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const created = await classroomService.createClassroom({
        title: title.trim(),
        subject: subject.trim() || undefined,
        description: description.trim() || undefined,
        color,
      });
      toast.success("Class created");
      setCreateOpen(false);
      await load();
      navigate(`/dashboard/classes/${created.id}`);
    } catch (err) {
      console.error("[ClassroomsPage] Could not create classroom:", err);
      toast.error("Could not create the class. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoinOpen = () => {
    setCode(joinPrefill);
    setJoinError(null);
    setJoinOpen(true);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setJoinError(null);
    try {
      const joined = await classroomService.joinClassroom(code);
      toast.success(`Joined ${joined.title}`);
      setJoinOpen(false);
      await load();
      navigate(`/dashboard/classes/${joined.id}`);
    } catch (err) {
      const kind = classifyJoinError(err);
      setJoinError(
        kind === "not_found"
          ? "No class uses that invite code. Double-check the spelling."
          : kind === "already_member"
            ? "You are already in this class."
            : "Could not join the class. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (membership: ClassroomMembership) => {
    const cls = membership.classroom!;
    const text = `Join my AuraMind class "${cls.title}" with code ${cls.inviteCode}\n${window.location.origin}/dashboard/classes?join=${cls.inviteCode}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Class invite copied");
    } catch {
      toast.error("Could not copy the invite.");
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nova-label text-violet-200/80">Classroom portal</p>
          <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">
            Classes
          </h1>
          <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-zinc-400">
            Run study groups like a real course board — assign decks, track who
            is keeping up, and find the terms your class keeps missing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={handleJoinOpen}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Join with code
          </Button>
          <Button onClick={handleCreateOpen}>
            <Plus className="h-4 w-4" aria-hidden />
            New class
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.04]"
            />
          ))}
        </div>
      ) : memberships.length === 0 ? (
        <EmptyClasses />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((membership, i) => {
            const cls = membership.classroom!;
            const gradient = classroomColorClasses(cls.color);
            return (
<motion.div
                key={cls.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/dashboard/classes/${cls.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/dashboard/classes/${cls.id}`);
                  }
                }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.05,
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
                whileHover={{ y: -4 }}
                className="nova-card group overflow-hidden p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
              >
                <div
                  className={`bg-gradient-to-br px-5 pb-16 pt-5 ${gradient}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <GraduationCap className="h-5 w-5" aria-hidden />
                    <span className="rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/80">
                      {classroomRoleLabel(membership.role)}
                    </span>
                  </div>
                </div>
                <div className="-mt-10 px-5 pb-5">
                  <h2 className="truncate text-base font-semibold text-white group-hover:text-violet-100">
                    {cls.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    {cls.subject && (
                      <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5">
                        {cls.subject}
                      </span>
                    )}
                    {cls.description && (
                      <span className="truncate">{cls.description}</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyInvite(membership);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-mono text-xs font-bold tracking-[0.18em] text-violet-100 transition-colors hover:bg-white/[0.09]"
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                      {cls.inviteCode}
                    </button>
<span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-violet-200 opacity-0 transition-opacity group-hover:opacity-100">
                      Open <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Create tile */}
          <motion.button
            type="button"
            onClick={handleCreateOpen}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: memberships.length * 0.05, duration: 0.4 }}
            whileHover={{ y: -4 }}
            className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] p-6 text-zinc-400 transition-colors hover:border-violet-400/40 hover:bg-white/[0.04] hover:text-white"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05]">
              <Plus className="h-5 w-5" aria-hidden />
            </div>
            <span className="text-sm font-semibold">Create a class</span>
          </motion.button>
        </div>
      )}

      {/* ─── Create class dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <CreateClassForm
          title={title}
          subject={subject}
          description={description}
          color={color}
          busy={busy}
          onTitle={setTitle}
          onSubject={setSubject}
          onDescription={setDescription}
          onColor={setColor}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      </Dialog>

      {/* ─── Join class dialog ─── */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-sm border border-white/10 bg-[#0E1420] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Join a class</DialogTitle>
            <DialogDescription>
              Enter the invite code your teacher shared.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="mt-2 space-y-4">
            <div>
              <label htmlFor="join-code" className={labelCls}>
                Invite code
              </label>
              <input
                id="join-code"
                className={`${inputCls} text-center font-mono text-lg uppercase tracking-[0.35em]`}
                placeholder="ABC234"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
                }
                autoFocus
                required
              />
              {joinError && (
                <p className="mt-2 text-xs text-rose-300" role="alert">
                  {joinError}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Sparkles className="h-3 w-3" aria-hidden />
                Codes use 6 letters &amp; numbers — no 0, O, 1, or I.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Joining…" : "Join class"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClassForm({
  title,
  subject,
  description,
  color,
  busy,
  onTitle,
  onSubject,
  onDescription,
  onColor,
  onCancel,
  onSubmit,
}: {
  title: string;
  subject: string;
  description: string;
  color: string;
  busy: boolean;
  onTitle: (v: string) => void;
  onSubject: (v: string) => void;
  onDescription: (v: string) => void;
  onColor: (v: string) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <DialogContent className="max-w-md border border-white/10 bg-[#0E1420] text-white">
      <DialogHeader>
        <DialogTitle className="text-white">Create a class</DialogTitle>
        <DialogDescription>
          Think of it as a course board — you will invite students with a code.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="mt-2 space-y-4">
        <div>
          <label htmlFor="class-title" className={labelCls}>
            Class name
          </label>
          <input
            id="class-title"
            className={inputCls}
            placeholder="e.g. AP Biology — Period 3"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="class-subject" className={labelCls}>
              Subject
            </label>
            <input
              id="class-subject"
              className={inputCls}
              placeholder="e.g. Biology"
              value={subject}
              onChange={(e) => onSubject(e.target.value)}
            />
          </div>
          <div>
            <span className={labelCls}>Theme color</span>
            <div className="flex gap-2 pt-0.5">
              {CLASSROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => onColor(c)}
                  className={`h-7 w-7 rounded-full transition-all ${
                    color === c
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0E1420]"
                      : "ring-1 ring-white/20"
                  } bg-gradient-to-br ${classroomColorClasses(c)}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="class-description" className={labelCls}>
            Description <span className="text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="class-description"
            className={`${inputCls} min-h-[72px] resize-y`}
            placeholder="What is this class about?"
            value={description}
            onChange={(e) => onDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create class"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
export default ClassroomsPage;
