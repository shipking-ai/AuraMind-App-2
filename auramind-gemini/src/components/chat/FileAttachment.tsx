/**
 * FileAttachment — drag/drop + click-to-attach for the chat input.
 *
 * Surface:
 *   - Inline at the bottom-left of the chat input bar (paperclip button).
 *   - Drop target = wrap the entire chat textarea in a drop zone so the
 *     user can drag a file from anywhere on the page.
 *   - Image files (image/*) get a thumbnail preview; everything else gets
 *     a labeled chip with the file name and size.
 *
 * Storage: we send the file as a base64 data URL embedded in the next
 * outgoing message. The user can preview it inline; Prof. Linnea receives
 * it as part of the message body. We intentionally don't ship to Supabase
 * Storage yet — that needs signed-URL plumbing and isn't worth a round-
 * trip for a study-tool's typical attachment (PDF + screenshots only).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, X, FileText } from '@/components/icons';

export interface AttachmentDraft {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  isImage: boolean;
  /** Data URL when isImage=true; otherwise a plain text placeholder. */
  dataUrl: string;
  /** Short string snippet for non-image docs that we can't inline-render. */
  extractedTextSnippet?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPT = 'image/*,.pdf,.txt,.md,.csv,application/json';

let _idSeq = 0;
function nextId() { return `att-${Date.now()}-${++_idSeq}`; }

interface Props {
  attachments: AttachmentDraft[];
  setAttachments: (next: AttachmentDraft[]) => void;
}

export default function FileAttachment({ attachments, setAttachments }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const next: AttachmentDraft[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        next.push({
          id: nextId(),
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
          isImage: false,
          dataUrl: '',
          extractedTextSnippet: '(skipped: file > 5MB — drop a smaller version)',
        });
        continue;
      }
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        next.push({
          id: nextId(),
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
          isImage: true,
          dataUrl,
        });
      } else {
        // Text-y doc: read first 1.5KB so Prof. Linnea can quote it.
        const text = await file.text().catch(() => '');
        next.push({
          id: nextId(),
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'text/plain',
          isImage: false,
          dataUrl: '',
          extractedTextSnippet: text.slice(0, 1500),
        });
      }
    }
    setAttachments([...attachments, ...next]);
  }, [attachments, setAttachments]);

  // Drop-zone wiring — attach to document so the user can drop anywhere.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setIsDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      // Only unclutter when leaving the document, not when crossing child nodes.
      if (e.relatedTarget === null) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setIsDragging(false);
      void handleFiles(e.dataTransfer.files);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  const remove = (id: string) => setAttachments(attachments.filter(a => a.id !== id));

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Attach an image, PDF, or text file"
        aria-label="Attach file"
        className="m-2 w-11 h-11 rounded-xl bg-[#1A1A24] border border-[#2A2A3A] text-[#A8A8C0] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40 flex items-center justify-center shrink-0 transition-all"
      >
        <Paperclip size={14} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          // Reset so re-attaching the same filename still fires `change`.
          e.target.value = '';
        }}
      />

      {/* Drop overlay — covers the screen with a soft violet wash when the
          user is dragging a file over the page. */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[60] backdrop-blur-sm bg-[#7C3AED]/[0.08] flex items-center justify-center"
          >
            <div className="rounded-2xl border-2 border-dashed border-[#7C3AED]/60 px-10 py-8 bg-[#0A0A0F]/80 text-center">
              <Paperclip className="mx-auto text-[#A78BFA] mb-3" size={28} />
              <p className="text-sm font-medium text-[#F0EFFE]">Drop to attach to your next message</p>
              <p className="text-[10px] text-[#7A7A96] mt-1">Up to 5MB · images / PDF / text / markdown</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline attachment chips above the input bar. */}
      {attachments.length > 0 && (
        <div className="px-6 py-2 flex flex-wrap gap-2 border-t border-[#2A2A3A]/40 bg-[#0A0A0F]">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#15151D] border border-[#2A2A3A]"
            >
              {a.isImage ? (
                <img
                  src={a.dataUrl}
                  alt=""
                  className="w-7 h-7 rounded object-cover border border-[#2A2A3A]"
                />
              ) : (
                <FileText size={14} className="text-[#A78BFA] shrink-0" />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-[#F0EFFE] max-w-[160px] truncate">{a.name}</span>
                <span className="text-[9px] text-[#7A7A96]">{formatBytes(a.sizeBytes)}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                className="w-5 h-5 rounded text-[#3A3A4F] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                aria-label={`Remove ${a.name}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** Coerce a list of attachments into a single prompt-string for Prof. Linnea. */
export function attachmentsToPrompt(attachments: AttachmentDraft[]): string {
  if (attachments.length === 0) return '';
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.isImage) {
      parts.push(`[Attached image: ${a.name}]\n${a.dataUrl}`);
    } else if (a.extractedTextSnippet) {
      parts.push(`[Attached file: ${a.name} (${a.mimeType})]\n${a.extractedTextSnippet}`);
    } else {
      parts.push(`[Attached file: ${a.name} (${a.mimeType}, empty)]`);
    }
  }
  return parts.join('\n\n');
}
