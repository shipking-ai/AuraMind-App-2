/**
 * A one-line bus for "every free AI tier is spent right now".
 *
 * The server proxy fails over across Groq → Cerebras → Gemini → OpenRouter
 * and only returns 429 once all of them are exhausted. That is the moment
 * worth telling the user about, because Puter can rescue it: Puter bills the
 * *user's* own account, so a signed-in user keeps generating at no cost to us.
 *
 * Why an event rather than a prop or a context: the 429 originates deep in
 * `groqClient`, which is called from services, hooks and components all over
 * the app. Threading a callback through every one of those call sites to
 * reach a single banner would touch far more code than the banner is worth.
 *
 * Puter's sign-in is a popup, and browsers only allow those from a real user
 * gesture — so this can never auto-recover. All it can do is surface a button
 * for the user to click. That constraint is why this is a notification and
 * not a retry.
 */

export const AI_QUOTA_EXHAUSTED_EVENT = 'bonamind:ai-quota-exhausted';

/** Fired when every configured free provider has refused with a 429. */
export function notifyAiQuotaExhausted(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AI_QUOTA_EXHAUSTED_EVENT));
}

/** Subscribe to quota-exhausted events. Returns an unsubscribe function. */
export function onAiQuotaExhausted(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AI_QUOTA_EXHAUSTED_EVENT, handler);
  return () => window.removeEventListener(AI_QUOTA_EXHAUSTED_EVENT, handler);
}
