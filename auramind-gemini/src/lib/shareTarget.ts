import { registerPlugin } from '@capacitor/core';
import { Capacitor } from './nativeShim';

/**
 * Content shared into BonaMind from another app.
 *
 * The native half is
 * `android/app/src/main/java/com/auramind/app/ShareTargetPlugin.java`.
 */
export interface SharedContent {
  /** MIME type the sender declared, e.g. `text/plain`, `application/pdf`. */
  type: string;
  /** Present for text shares: a URL, a highlighted passage, a note. */
  text?: string;
  /** The sender's title — a browser puts the page title here. */
  title?: string;
  /**
   * Present for file shares. The read grant lasts only for this launch, so
   * act on it now rather than storing it.
   */
  uri?: string;
}

interface ShareTargetPluginShape {
  consume(): Promise<{ share: SharedContent | null }>;
  addListener(
    event: 'shareReceived',
    handler: (share: SharedContent) => void,
  ): Promise<{ remove: () => void }>;
}

const ShareTarget = registerPlugin<ShareTargetPluginShape>('ShareTarget');

/**
 * Take the pending share, if there is one.
 *
 * Two delivery paths exist because a share can arrive before anything is
 * listening: Android launches the activity and hands over the intent long
 * before React has mounted. `consume()` covers the cold start; the
 * `shareReceived` event covers a share arriving while the app is already open,
 * when nothing is polling.
 *
 * Consuming clears it. A share is a one-shot instruction, and replaying a
 * stale one on the next launch would silently recreate a deck the user has
 * already made.
 */
export async function consumePendingShare(): Promise<SharedContent | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { share } = await ShareTarget.consume();
    return share ?? null;
  } catch {
    // The plugin is absent on web and on older builds. A share is an
    // enhancement; failing to read one must never block startup.
    return null;
  }
}

/**
 * Shares that arrive while the app is already running.
 *
 * addListener is deliberately not awaited. Capacitor's custom-plugin proxy
 * hands back the listener handle synchronously on native, and an `await`
 * inside try/catch is downlevelled to a `.catch()` chain — which a plain
 * object does not have, so the whole screen died with
 * "addListener(...).catch is not a function". Normalising both shapes keeps
 * this working whichever the bridge returns.
 */
export async function onShareReceived(
  handler: (share: SharedContent) => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  try {
    const maybeHandle: unknown = ShareTarget.addListener('shareReceived', handler);
    const handle =
      maybeHandle && typeof (maybeHandle as PromiseLike<unknown>).then === 'function'
        ? await (maybeHandle as Promise<{ remove: () => void }>)
        : (maybeHandle as { remove?: () => void });
    return () => {
      try {
        handle?.remove?.();
      } catch {
        // Nothing to do if the bridge has already gone away.
      }
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Turn a share into the generator's inputs.
 *
 * A shared URL and a shared passage want different treatment: the first is a
 * source to fetch, the second is already the material. Detecting which is
 * worth doing here rather than making the user pick, since the sender has
 * already told us by what it put in the payload.
 */
export function describeShare(share: SharedContent): {
  mode: 'url' | 'text' | 'file';
  value: string;
  title?: string;
} {
  if (share.uri) {
    return { mode: 'file', value: share.uri, title: share.title };
  }
  const text = (share.text ?? '').trim();
  // A bare URL is a source to pull from. A passage that merely *contains* a
  // link is still a passage, so this only matches when the whole share is one.
  if (/^https?:\/\/\S+$/i.test(text)) {
    return { mode: 'url', value: text, title: share.title };
  }
  return { mode: 'text', value: text, title: share.title };
}

/**
 * A share in flight between the root listener and the generator screen.
 *
 * The root has to consume the native share to know whether to navigate, but
 * the generator is what needs the payload — and consuming clears it. Rather
 * than have both read the plugin and race, the root consumes once and parks
 * the result here for the generator to pick up on mount.
 *
 * Module state rather than router state on purpose: a share can arrive before
 * the router exists (cold start), and this survives the navigation that
 * follows without being serialised into a URL that cannot hold a page of text.
 */
let staged: SharedContent | null = null;

export function stageShare(share: SharedContent): void {
  staged = share;
}

/** Read and clear the staged share. */
export function takeStagedShare(): SharedContent | null {
  const share = staged;
  staged = null;
  return share;
}
