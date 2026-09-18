import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, BarChart3 } from "../icons";
import type {
  AssignmentProgress,
  AssignmentStatus,
} from "../../types/classroom";
import {
  classroomRoleLabel,
  completionPercent,
  statusLabel,
} from "../../lib/classroom/format";
import type { RosterEntry } from "../../types/classroom";

function StatusChip({ status }: { status: AssignmentStatus }) {
  const cls =
    status === "completed"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : status === "in_progress"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
        : "border-white/[0.1] bg-white/[0.05] text-zinc-400";

  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "in_progress"
        ? Clock
        : BarChart3;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "text-emerald-300";
  if (accuracy >= 50) return "text-amber-300";
  return "text-rose-300";
}

interface ClassProgressProps {
  progress: AssignmentProgress[];
  roster: RosterEntry[];
}

export function ClassProgress({
  progress,
  roster,
}: ClassProgressProps) {
  // Build an index: userId → progress
  const byUser = new Map(progress.map((p) => [p.userId, p]));

  const rows = roster.map((entry) => ({
    ...entry,
    progress: byUser.get(entry.userId) ?? null,
  }));

  // Summary counts
  const completedCount = rows.filter((r) => r.progress?.status === "completed").length;
  const inProgressCount = rows.filter((r) => r.progress?.status === "in_progress").length;

  // Most missed across all students
  const termMisses = new Map<string, number>();
  for (const p of progress) {
    for (const m of p.mostMissed ?? []) {
      termMisses.set(m.front, (termMisses.get(m.front) ?? 0) + m.misses);
    }
  }
  const topMissed = [...termMisses.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        No students enrolled yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tabular-nums">
        <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-zinc-300">
          {rows.length} enrolled
        </span>
        {completedCount > 0 && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-200">
            {completedCount} completed
          </span>
        )}
        {inProgressCount > 0 && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-amber-200">
            {inProgressCount} in progress
          </span>
        )}
      </div>

      {topMissed.length > 0 && (
        <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.04] px-4 py-3 text-[11px] text-rose-200/80">
          <span className="font-semibold text-rose-200">Most missed terms: </span>
          {topMissed.map(([term, count], i) => (
            <span key={term}>
              {i > 0 && ", "}
              {term}{" "}
              <span className="tabular-nums text-rose-300/60">({count})</span>
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {rows.map((row, i) => {
          const pct = completionPercent(row.progress);
          const accuracy = row.progress?.accuracy ?? null;
          const misses = row.progress?.misses ?? 0;

          return (
            <motion.li
              key={row.userId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: i * 0.03,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05]"
            >
              {/* Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-[11px] font-bold text-white">
                {row.displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>

              {/* Name + role */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">
                  {row.displayName}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {classroomRoleLabel(row.role)}
                </div>
              </div>

              {/* Progress bar + pct */}
              <div className="hidden w-24 flex-shrink-0 sm:block">
                <div className="mb-1 flex justify-between text-[10px] font-bold tabular-nums text-zinc-500">
                  <span>{pct}%</span>
                  {row.progress?.cardsReviewed != null &&
                    row.progress?.cardsTotal != null && (
                      <span className="text-zinc-600">
                        {row.progress.cardsReviewed}/{row.progress.cardsTotal}
                      </span>
                    )}
                </div>
                <div className="nova-track h-1.5 rounded-full bg-white/[0.08]">
                  <div
                    className="nova-track-fill h-full rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Accuracy */}
              <div className="w-16 text-right">
                {accuracy != null ? (
                  <span className={`text-sm font-semibold tabular-nums ${accuracyColor(accuracy)}`}>
                    {accuracy}%
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-600">—</span>
                )}
              </div>

              {/* Misses */}
              <div className="w-12 text-right">
                {misses > 0 ? (
                  <span className="text-[11px] font-semibold tabular-nums text-rose-300">
                    {misses} miss
                    {misses > 1 ? "es" : ""}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-600">—</span>
                )}
              </div>

              {/* Status chip */}
              <div className="hidden w-28 flex-shrink-0 justify-end sm:flex">
                {row.progress ? (
                  <StatusChip status={row.progress.status} />
                ) : (
                  <span className="text-[10px] text-zinc-600">Not started</span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}