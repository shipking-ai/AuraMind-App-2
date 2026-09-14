/**
 * Pull-to-refresh plumbing.
 *
 * Decks and cards are loaded once, in App.tsx, when the session resolves.
 * The Android screens that want to refresh live several providers below it,
 * so rather than threading a callback through NovaHub and the workspace
 * context, App registers the reload here and any surface can trigger it.
 */

type RefreshHandler = () => Promise<void>;

let handler: RefreshHandler | null = null;
let inFlight: Promise<boolean> | null = null;

/** Register the reload. Returns an unregister function for effect cleanup. */
export function registerWorkspaceRefresh(next: RefreshHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/**
 * Reload decks and cards. Resolves true when data was reloaded, false when
 * nothing is registered or the reload failed. Concurrent calls share one
 * request, so a double pull cannot fire two network round-trips.
 */
export function refreshWorkspace(): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  if (inFlight) return inFlight;
  const run = handler;
  inFlight = run()
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
