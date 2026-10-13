/**
 * Notification Store — Module-level shared notification system.
 *
 * Both QuizGenerationNotifier (pushes) and TopAppBar (reads) share
 * this store so the header bell shows real notifications.
 */

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  timestamp: number;
  read: boolean;
  type: NotificationType;
  actionUrl?: string;        // Navigate here on click
  actionLabel?: string;      // Label for the action button
}

type Subscriber = (notifications: AppNotification[]) => void;

// ─── State ───────────────────────────────────────────────────────

const STORAGE_KEY = 'bonamind:app-notifications';

let notifications: AppNotification[] = [];
const subscribers = new Set<Subscriber>();

// ─── Persistence ─────────────────────────────────────────────────

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only keep notifications from the last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return parsed.filter((n: AppNotification) => n.timestamp > cutoff);
  } catch {
    return [];
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
  } catch { /* ignore */ }
}

// ─── Init ────────────────────────────────────────────────────────

notifications = loadFromStorage();

// ─── Subscriber ──────────────────────────────────────────────────

function notifySubscribers(): void {
  const snapshot = [...notifications];
  subscribers.forEach((fn) => {
    try { fn(snapshot); } catch { /* swallow */ }
  });
}

// ─── Public API ──────────────────────────────────────────────────

/** Add a new notification. Returns the notification id. */
export function addNotification(
  opts: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
): string {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  notifications.unshift({
    ...opts,
    id,
    timestamp: Date.now(),
    read: false,
  });

  // Trim to max 50
  if (notifications.length > 50) notifications = notifications.slice(0, 50);

  saveToStorage();
  notifySubscribers();
  return id;
}

/** Get all notifications (returns live reference — use snapshot for rendering). */
export function getNotifications(): AppNotification[] {
  return [...notifications];
}

/** Get unread count. */
export function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length;
}

/** Mark a notification as read. */
export function markAsRead(id: string): void {
  const idx = notifications.findIndex((x) => x.id === id);
  if (idx === -1) return;
  notifications = [
    ...notifications.slice(0, idx),
    { ...notifications[idx], read: true },
    ...notifications.slice(idx + 1),
  ];
  saveToStorage();
  notifySubscribers();
}

/** Mark all as read. */
export function markAllAsRead(): void {
  const changed = notifications.some((n) => !n.read);
  if (!changed) return;
  notifications = notifications.map((n) => ({ ...n, read: true }));
  saveToStorage();
  notifySubscribers();
}

/** Remove a notification. */
export function removeNotification(id: string): void {
  notifications = notifications.filter((n) => n.id !== id);
  saveToStorage();
  notifySubscribers();
}

/** Subscribe to notification changes. Returns unsubscribe function. */
export function subscribeToNotifications(cb: Subscriber): () => void {
  subscribers.add(cb);
  // Immediately notify with current state
  setTimeout(() => cb([...notifications]), 0);
  return () => { subscribers.delete(cb); };
}



