import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check } from '@/components/icons';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  type AppNotification,
} from '../../../services/notifications/notificationStore';

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const typeDot: Record<AppNotification['type'], string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-violet-400',
};

export function useUnreadCount(): number {
  const [unread, setUnread] = useState(() => getUnreadCount());
  useEffect(() => subscribeToNotifications(list => {
    setUnread(list.filter(n => !n.read).length);
  }), []);
  return unread;
}

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<AppNotification[]>(() => getNotifications());

  useEffect(() => {
    if (!open) return;
    setItems(getNotifications());
    return subscribeToNotifications(setItems);
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const openItem = (n: AppNotification) => {
    markAsRead(n.id);
    onClose();
    if (n.actionUrl) navigate(n.actionUrl);
  };

  const unread = items.filter(n => !n.read).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="Notifications"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-full z-[100] mt-2 w-80 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14141d] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-[13px] font-semibold text-white">
              Notifications{unread > 0 && <span className="ml-1.5 text-[11px] font-bold text-violet-300">{unread} new</span>}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-white"
              >
                <Check className="h-3 w-3" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-zinc-500">
                You&apos;re all caught up.
              </div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeDot[n.type]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-white">{n.title}</span>
                    {n.description && (
                      <span className="block truncate text-[11px] text-zinc-400">{n.description}</span>
                    )}
                    <span className="mt-0.5 block text-[10px] tabular-nums text-zinc-500">
                      {timeAgo(n.timestamp)}
                      {n.actionLabel ? ` · ${n.actionLabel}` : ''}
                    </span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />}
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
