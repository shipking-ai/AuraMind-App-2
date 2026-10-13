import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  X,
  Plus,
  Pin,
  PinOff,
  Trash2,
  MessageSquare,
  Edit2,
  Check,
  Search,
  Sparkles,
  Download,
  CheckSquare,
  Square,
} from "@/components/icons";
import type { Message } from "../../hooks/useAIChat";

export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  preview: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  deckName?: string;
}

const STORAGE_KEY = "bonamind.aurachat.sessions.v1";
const ACTIVE_KEY = "bonamind.aurachat.active.v1";

function safeRead(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(sessions: ChatSession[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* quota exceeded etc. */
  }
}

function titleFromMessages(msgs: Message[]): string {
  const firstUser = msgs.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  return firstUser.content.length > 48 ? firstUser.content.slice(0, 48) + "…" : firstUser.content;
}

function previewFromMessages(msgs: Message[]): string {
  const last = msgs.filter((m) => m.content).slice(-1)[0];
  if (!last) return "Empty conversation";
  return last.content.length > 72 ? last.content.slice(0, 72) + "…" : last.content;
}

export function fmtRelTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Bucket a session into a recency label. */
function bucketFromTs(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 86_400_000) return "Today";
  if (diff < 172_800_000) return "Yesterday";
  if (diff < 604_800_000) return "This week";
  if (diff < 2_592_000_000) return "This month";
  return "Older";
}
const BUCKET_ORDER = ["Pinned", "Today", "Yesterday", "This week", "This month", "Older"] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

/** Filter by a search query (case-insensitive over title + preview + deck + every message). */
function filterByQuery(sessions: ChatSession[], q: string): ChatSession[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return sessions;
  return sessions.filter((s) => {
    if (s.title.toLowerCase().includes(needle)) return true;
    if ((s.preview || "").toLowerCase().includes(needle)) return true;
    if ((s.deckName || "").toLowerCase().includes(needle)) return true;
    return s.messages.some((m) => (m.content || "").toLowerCase().includes(needle));
  });
}

/** Group into buckets while preserving the existing pinned-first sort. */
function groupSessions(sessions: ChatSession[]): Array<[Bucket, ChatSession[]]> {
  const buckets: Record<Bucket, ChatSession[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    "This week": [],
    "This month": [],
    Older: [],
  };
  for (const s of sessions) {
    if (s.pinned) buckets.Pinned.push(s);
    else buckets[bucketFromTs(s.updatedAt) as Exclude<Bucket, "Pinned">].push(s);
  }
  for (const k of Object.keys(buckets) as Bucket[]) {
    buckets[k].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return BUCKET_ORDER.filter((b) => buckets[b].length > 0).map((b) => [b, buckets[b]]);
}

interface Props {
  /** Live in-memory chat */
  messages: Message[];
  deckName?: string;
  /** Called when user clicks a past session and wants to resume it */
  onResume: (session: ChatSession) => void;
  /** Optional: called when user clicks "new chat" */
  onNewChat?: () => void;
  /** Optional: parent listens to the full sessions list (for "continue last" CTAs etc.). */
  onSessionsChange?: (sessions: ChatSession[]) => void;
  /** When false, remove local history and avoid persisting new messages. */
  persistHistory?: boolean;
}

export default function ConversationHistory({
  messages,
  deckName,
  onResume,
  onNewChat,
  onSessionsChange,
  persistHistory = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(() => safeRead());
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_KEY);
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!persistHistory) {
      if (sessions.length > 0) setSessions([]);
      if (activeId !== null) setActiveId(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(ACTIVE_KEY);
      } catch {
        // Storage is best effort.
      }
      onSessionsChange?.([]);
      return;
    }
    onSessionsChange?.(sessions);
  }, [activeId, onSessionsChange, persistHistory, sessions]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  // Auto-save current session whenever the in-memory messages change
  useEffect(() => {
    if (!persistHistory || messages.length === 0) return;
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === activeId);
      const title = titleFromMessages(messages);
      const preview = previewFromMessages(messages);
      const now = Date.now();
      let next: ChatSession[];
      if (idx >= 0) {
        next = prev.map((s, i) =>
          i === idx ? { ...s, title, preview, messages, updatedAt: now, deckName } : s,
        );
      } else {
        const id = `sess-${now}-${Math.random().toString(36).slice(2, 7)}`;
        next = [
          {
            id,
            title,
            preview,
            messages,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            deckName,
          },
          ...prev,
        ];
        setActiveId(id);
        try {
          window.localStorage.setItem(ACTIVE_KEY, id);
        } catch {
          /* intentionally ignored */
        }
      }
      next.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      safeWrite(next);
      return next;
    });
  }, [activeId, deckName, messages, persistHistory]);

  const filtered = useMemo(() => filterByQuery(sessions, query), [sessions, query]);
  const grouped = useMemo(() => groupSessions(filtered), [filtered]);

  const startNew = useCallback(() => {
    setActiveId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_KEY);
    setSelected(new Set());
    onNewChat?.();
    setOpen(false);
  }, [onNewChat]);

  const remove = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        safeWrite(next);
        return next;
      });
      if (activeId === id) {
        setActiveId(null);
        try {
          window.localStorage.removeItem(ACTIVE_KEY);
        } catch {
          /* intentionally ignored */
        }
        onNewChat?.();
      }
    },
    [activeId, onNewChat],
  );

  const togglePin = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
      next.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      safeWrite(next);
      return next;
    });
  }, []);

  const startRename = useCallback((s: ChatSession) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const v = renameValue.trim();
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === renamingId ? { ...s, title: v || s.title } : s));
      safeWrite(next);
      return next;
    });
    setRenamingId(null);
  }, [renamingId, renameValue]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllSelect = useCallback((rows: ChatSession[]) => {
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allSelected) return new Set([...prev].filter((x) => !ids.has(x)));
      const merged = new Set(prev);
      ids.forEach((id) => merged.add(id));
      return merged;
    });
  }, []);

  const bulkDelete = useCallback(() => {
    if (selected.size === 0) return;
    setSessions((prev) => {
      const next = prev.filter((s) => !selected.has(s.id));
      safeWrite(next);
      return next;
    });
    if (activeId && selected.has(activeId)) {
      setActiveId(null);
      try {
        window.localStorage.removeItem(ACTIVE_KEY);
      } catch {
        /* intentionally ignored */
      }
      onNewChat?.();
    }
    setSelected(new Set());
  }, [selected, activeId, onNewChat]);

  const bulkPin = useCallback(() => {
    if (selected.size === 0) return;
    setSessions((prev) => {
      const allPinned = prev.filter((s) => selected.has(s.id)).every((s) => s.pinned);
      const next = prev.map((s) => (selected.has(s.id) ? { ...s, pinned: !allPinned } : s));
      next.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      safeWrite(next);
      return next;
    });
  }, [selected]);

  const exportSelected = useCallback(() => {
    const targets = sessions.filter((s) => selected.has(s.id));
    if (targets.length === 0) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            sessionCount: targets.length,
            sessions: targets,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonamind-chat-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [selected, sessions]);

  const hasAnySessions = sessions.length > 0;
  const matchesAny = filtered.length > 0;
  const lastActivityLabel = hasAnySessions
    ? fmtRelTime(sessions[0]?.updatedAt ?? Date.now())
    : null;

  return (
    <>
      <button
        data-chat-tour="history"
        onClick={() => setOpen((v) => !v)}
        title="Chat history"
        aria-label="Open chat history"
        className="relative w-9 h-9 shrink-0 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#8A8AA3] hover:text-[#F0EFFE] hover:border-[#3A3A4F] transition-all"
      >
        <History size={13} />
        {sessions.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[#7C3AED] text-white text-[9px] font-bold flex items-center justify-center">
            {sessions.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: -360, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -360, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[360px] bg-[#0E0E14] border-r border-[#2A2A3A] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#2A2A3A]/60">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-[#A78BFA]" />
                  <h3 className="text-[#F0EFFE] text-sm font-semibold">Chat History</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={startNew}
                    className="px-2.5 py-1 rounded-md bg-[#15151D] border border-[#2A2A3A] hover:border-[#7C3AED]/40 text-[10px] text-[#F0EFFE] flex items-center gap-1 transition-all"
                  >
                    <Plus size={11} />
                    New
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Close history"
                    className="w-7 h-7 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#7A7A96] hover:text-[#F0EFFE] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search
                    size={11}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A7A96] pointer-events-none"
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search past chats…"
                    className="w-full bg-[#15151D] border border-[#2A2A3A] rounded-lg pl-8 pr-3 py-2 text-xs text-[#F0EFFE] placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/40"
                  />
                </div>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-3">
                {!hasAnySessions ? (
                  <div className="text-center py-12 px-6">
                    <Sparkles size={28} className="text-[#3A3A4F] mx-auto mb-3" />
                    <p className="text-[#7A7A96] text-xs">No chat history yet.</p>
                    <p className="text-[#3A3A4F] text-[10px] mt-1">
                      Chat sessions save automatically as you go.
                    </p>
                  </div>
                ) : !matchesAny ? (
                  <div className="text-center py-10 px-6">
                    <Search size={26} className="text-[#3A3A4F] mx-auto mb-3" />
                    <p className="text-[#7A7A96] text-xs">
                      No chats match &ldquo;<span className="text-[#9090A8]">{query}</span>&rdquo;.
                    </p>
                    <button
                      onClick={() => setQuery("")}
                      className="text-[10px] text-violet-400 hover:text-violet-300 mt-1.5"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  grouped.map(([bucket, bucketSessions]) => (
                    <div key={bucket} className="space-y-1">
                      <div className="px-2 pt-2 pb-1 flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A96]">
                          {bucket}
                        </span>
                        <span className="flex-1 h-px bg-[#1A1A24]" />
                        <span className="text-[9px] text-[#3A3A4F]">{bucketSessions.length}</span>
                      </div>
                      {bucketSessions.map((s) => {
                        const isActive = s.id === activeId;
                        const isRenaming = renamingId === s.id;
                        const isSelected = selected.has(s.id);
                        return (
                          <div
                            key={s.id}
                            className={`group rounded-xl border transition-all px-3 py-2.5 cursor-pointer ${
                              isActive
                                ? "bg-[#15151D] border-[#7C3AED]/40"
                                : "bg-transparent border-transparent hover:bg-[#15151D] hover:border-[#2A2A3A]"
                            } ${isSelected ? "ring-1 ring-[#A78BFA]/30" : ""}`}
                            onClick={(e) => {
                              if (isRenaming) return;
                              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                toggleSelect(s.id);
                                return;
                              }
                              setActiveId(s.id);
                              try {
                                window.localStorage.setItem(ACTIVE_KEY, s.id);
                              } catch {
                                /* intentionally ignored */
                              }
                              onResume(s);
                              setOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(s.id);
                                }}
                                className="w-5 h-5 mt-0.5 rounded flex items-center justify-center text-[#7A7A96] hover:text-[#A78BFA] hover:bg-[#1A1A24] shrink-0"
                                title={isSelected ? "Deselect" : "Select"}
                              >
                                {isSelected ? (
                                  <CheckSquare size={11} className="text-[#A78BFA]" />
                                ) : (
                                  <Square size={11} />
                                )}
                              </button>
                              {s.pinned && (
                                <Pin size={11} className="text-[#A78BFA] mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitRename();
                                      if (e.key === "Escape") setRenamingId(null);
                                    }}
                                    onBlur={commitRename}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full bg-transparent border-b border-[#7C3AED] text-sm text-[#F0EFFE] outline-none"
                                  />
                                ) : (
                                  <p className="text-sm text-[#F0EFFE] font-medium truncate">
                                    {s.title}
                                  </p>
                                )}
                                <p className="text-[10px] text-[#7A7A96] line-clamp-2 mt-0.5">
                                  {s.preview}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 text-[9px] text-[#3A3A4F]">
                                  <span>{fmtRelTime(s.updatedAt)}</span>
                                  {s.deckName && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate max-w-[120px]">{s.deckName}</span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span>
                                    {s.messages.length} msg
                                    {s.messages.length === 1 ? "" : "s"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePin(s.id);
                                  }}
                                  title={s.pinned ? "Unpin" : "Pin"}
                                  className="w-6 h-6 rounded text-[#7A7A96] hover:text-[#A78BFA] hover:bg-[#1A1A24] flex items-center justify-center"
                                >
                                  {s.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(s);
                                  }}
                                  title="Rename"
                                  className="w-6 h-6 rounded text-[#7A7A96] hover:text-[#F0EFFE] hover:bg-[#1A1A24] flex items-center justify-center"
                                >
                                  {isRenaming ? <Check size={11} /> : <Edit2 size={11} />}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    remove(s.id);
                                  }}
                                  title="Delete"
                                  className="w-6 h-6 rounded text-[#7A7A96] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer — bulk actions + last activity */}
              <div className="p-3 border-t border-[#2A2A3A]/60 text-[9px] text-[#3A3A4F] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleAllSelect(filtered)}
                    title={
                      selected.size === filtered.length && filtered.length > 0
                        ? "Deselect all"
                        : "Select all"
                    }
                    className="w-5 h-5 rounded flex items-center justify-center text-[#7A7A96] hover:text-[#A78BFA] hover:bg-[#1A1A24]"
                  >
                    {selected.size === filtered.length && filtered.length > 0 ? (
                      <CheckSquare size={10} />
                    ) : (
                      <Square size={10} />
                    )}
                  </button>
                  <span>
                    {sessions.length} session
                    {sessions.length === 1 ? "" : "s"}
                    {selected.size > 0 && ` · ${selected.size} selected`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {selected.size > 0 && (
                    <>
                      <button
                        onClick={bulkPin}
                        className="px-1.5 py-0.5 rounded text-[#A78BFA] hover:bg-[#7C3AED]/15 transition-colors"
                        title="Pin / unpin selected"
                      >
                        <Pin size={9} className="inline mr-0.5 -mt-0.5" />
                        Pin
                      </button>
                      <button
                        onClick={exportSelected}
                        className="px-1.5 py-0.5 rounded text-[#A8A8C0] hover:bg-[#1A1A24] transition-colors"
                        title="Export selected as JSON"
                      >
                        <Download size={9} className="inline mr-0.5 -mt-0.5" />
                        Export
                      </button>
                      <button
                        onClick={bulkDelete}
                        className="px-1.5 py-0.5 rounded text-red-400 hover:bg-red-500/15 transition-colors"
                        title="Delete selected"
                      >
                        <Trash2 size={9} className="inline mr-0.5 -mt-0.5" />
                        Delete
                      </button>
                    </>
                  )}
                  {lastActivityLabel && !selected.size && (
                    <span className="text-[#3A3A4F]">last activity {lastActivityLabel}</span>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
