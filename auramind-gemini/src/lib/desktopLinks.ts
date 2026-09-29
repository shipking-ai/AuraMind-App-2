/**
 * Outside links in the Windows app go to the user's browser.
 *
 * The Rust navigation guard (src-tauri/src/lib.rs, `stays_in_app`) already
 * catches the app window being navigated away — that is how Stripe checkout
 * leaves. It cannot see the other two ways a page opens a URL, which WebView2
 * would otherwise turn into a bare popup window with no address bar:
 *
 *   - window.open(url) — e.g. the Stripe billing portal from Settings
 *   - <a target="_blank"> — e.g. links on the About and legal pages
 *
 * Both are routed through the opener plugin here. Same-origin URLs are left
 * alone so in-app routing keeps working.
 */
import { isDesktopApp } from './platform';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** The URL to hand to the browser, or null if it belongs in the app. */
export function externalUrl(href: string, pageUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) return null;
  if (url.protocol !== 'mailto:' && url.origin === new URL(pageUrl).origin) return null;
  return url;
}

async function openInBrowser(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

let installed = false;

/** Call once at startup. Does nothing outside the Windows app. */
export function installDesktopLinkHandling(): void {
  if (installed || !isDesktopApp()) return;
  installed = true;

  const openInWebView = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const outside = url === undefined ? null : externalUrl(String(url), window.location.href);
    if (outside) {
      void openInBrowser(outside.href).catch(() => undefined);
      return null;
    }
    return openInWebView(url, target, features);
  }) as typeof window.open;

  // Capture phase, so this runs before React's handlers and the default
  // action alike.
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const outside = externalUrl(anchor.getAttribute('href') ?? '', window.location.href);
      if (!outside) return;
      event.preventDefault();
      void openInBrowser(outside.href).catch(() => undefined);
    },
    true,
  );
}
