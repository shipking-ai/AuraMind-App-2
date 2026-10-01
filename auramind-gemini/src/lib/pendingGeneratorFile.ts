/**
 * Hands a file to the generator across a navigation. The drop overlay, the
 * Explorer verb and the tray picker all end here: if the generator is
 * mounted it gets the file now, otherwise it picks it up on mount.
 */
let pending: File | null = null;
const listeners = new Set<(file: File) => void>();

export function offerGeneratorFile(file: File): void {
  if (listeners.size > 0) listeners.forEach((listener) => listener(file));
  else pending = file;
}

export function takePendingGeneratorFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}

export function onGeneratorFile(cb: (file: File) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
