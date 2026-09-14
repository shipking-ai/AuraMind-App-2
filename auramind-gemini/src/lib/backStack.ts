/**
 * Transient UI that the Android back gesture should close first.
 *
 * On Android, back dismisses the topmost sheet or dialog before it ever
 * navigates. A WebView has no idea a sheet is open, so without this the
 * gesture would pop the route underneath and leave the sheet floating over
 * the wrong screen. Open surfaces push a close handler; NativeRuntime asks
 * this stack before it does anything else with a back press.
 */

const stack: Array<() => void> = [];

/** Register a close handler. Returns the function that unregisters it. */
export function pushBackHandler(close: () => void): () => void {
  stack.push(close);
  return () => {
    const index = stack.lastIndexOf(close);
    if (index !== -1) stack.splice(index, 1);
  };
}

/** Close the topmost surface. True when a back press was consumed. */
export function consumeBackPress(): boolean {
  const close = stack.pop();
  if (!close) return false;
  close();
  return true;
}
