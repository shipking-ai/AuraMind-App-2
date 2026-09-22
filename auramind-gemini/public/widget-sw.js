/*
 * Windows 11 widget board support, imported into the generated service worker
 * (see workbox.importScripts in src/lib/pwa.ts).
 *
 * Edge renders a PWA widget from an Adaptive Card template plus data. The
 * service worker owns the data: the app posts the current due state whenever
 * it changes, the worker stores it in a cache so it survives the worker being
 * shut down, and every widget lifecycle event re-renders from that store.
 *
 * The count itself is never computed here. Due-ness is an FSRS question the
 * app already answers, and a second implementation in a service worker would
 * drift from it — exactly the trap the Android widget avoids the same way.
 */

const WIDGET_TAG = 'auramind-due';
const STATE_CACHE = 'auramind-widget-state';
const STATE_URL = '/__auramind-widget-state';
const TEMPLATE_URL = '/widgets/due-template.json';

const EMPTY_STATE = { due: 0, deck: '', streak: 0 };

async function readState() {
  try {
    const cache = await caches.open(STATE_CACHE);
    const stored = await cache.match(STATE_URL);
    if (!stored) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...(await stored.json()) };
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(state) {
  const cache = await caches.open(STATE_CACHE);
  await cache.put(
    STATE_URL,
    new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }),
  );
}

/** The card's fields. Kept dumb: no scheduling logic, only wording. */
function toCardData(state) {
  const due = Math.max(0, Math.floor(Number(state.due) || 0));
  const deck = (state.deck || '').trim();
  const streak = Math.max(0, Math.floor(Number(state.streak) || 0));
  return {
    due: String(due),
    headline: due === 0 ? 'All caught up' : due === 1 ? '1 card due' : `${due} cards due`,
    detail: due === 0
      ? 'Nothing is waiting for review.'
      : deck
        ? `Starting with ${deck}`
        : 'Ready when you are.',
    streakLine: streak > 1 ? `${streak}-day streak` : '',
    actionTitle: due === 0 ? 'Open AuraMind' : 'Study now',
    actionUrl: due === 0 ? '/dashboard' : '/dashboard/study',
  };
}

async function renderWidgets() {
  if (!self.widgets) return;
  try {
    const widget = await self.widgets.getByTag(WIDGET_TAG);
    if (!widget) return;
    const template = await (await fetch(TEMPLATE_URL)).text();
    const data = JSON.stringify(toCardData(await readState()));
    await self.widgets.updateByTag(WIDGET_TAG, { template, data });
  } catch {
    // The board is an accessory; a failed render must never break the worker.
  }
}

self.addEventListener('widgetinstall', (event) => event.waitUntil(renderWidgets()));
self.addEventListener('widgetresume', (event) => event.waitUntil(renderWidgets()));

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'auramind-widget-state') return;
  event.waitUntil(writeState(event.data.state ?? EMPTY_STATE).then(renderWidgets));
});

// Tapping "Study now" opens the app through the normal client path.
self.addEventListener('widgetclick', (event) => {
  if (event.action !== 'study') return;
  event.waitUntil(self.clients.openWindow('/dashboard/study'));
});
