/**
 * Files AuraMind can turn into a course: the generator's document and audio
 * inputs. The same lists live in src-tauri/src/handoff.rs (Explorer/tray)
 * and src-tauri/windows/installer-hooks.nsh (Explorer verbs);
 * courseFiles.test.ts fails if any of them drift.
 */
export const DOC_EXTS = ['pdf', 'pptx', 'docx', 'doc', 'txt', 'md'] as const;
export const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'webm'] as const;
export type CourseFileKind = 'document' | 'audio';

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function courseFileKind(name: string): CourseFileKind | null {
  const ext = extensionOf(name);
  if ((DOC_EXTS as readonly string[]).includes(ext)) return 'document';
  if ((AUDIO_EXTS as readonly string[]).includes(ext)) return 'audio';
  return null;
}

export function fileFromHandoff(h: { name: string; mime: string; base64: string }): File {
  const bytes = Uint8Array.from(atob(h.base64), (c) => c.charCodeAt(0));
  return new File([bytes], h.name, { type: h.mime });
}

export function unsupportedMessage(name: string): string {
  const ext = extensionOf(name);
  return ext ? `AuraMind can't make a course from .${ext} files.` : "AuraMind can't make a course from that file.";
}
