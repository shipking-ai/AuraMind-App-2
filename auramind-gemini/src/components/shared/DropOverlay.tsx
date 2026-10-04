import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { courseFileKind, unsupportedMessage } from '../../lib/courseFiles';
import { offerGeneratorFile } from '../../lib/pendingGeneratorFile';

const hasFiles = (e: DragEvent | React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Drag a document or recording anywhere over BonaMind to make a course.
 * Plain HTML5 drag-and-drop, so the website gets it as well as the Windows
 * app (which keeps dragDropEnabled: false so WebView2 delivers File objects).
 */
export function DropOverlay() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    // Without this the browser opens a file dropped outside the overlay.
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); depth.current = 0; setActive(false); };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!active) return null;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = 0;
    setActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!courseFileKind(file.name)) {
      toast.error(unsupportedMessage(file.name));
      return;
    }
    offerGeneratorFile(file);
    navigate('/dashboard/generator');
  };

  return (
    <div
      data-testid="drop-overlay"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#060a16]/70 backdrop-blur-sm"
    >
      <div className="pointer-events-none absolute inset-4 rounded-3xl border-2 border-dashed border-violet-400/60 shadow-[inset_0_0_120px_rgba(139,92,246,0.35)]" />
      <div className="pointer-events-none text-center">
        <p className="text-2xl font-semibold text-white">Drop to make a course</p>
        <p className="mt-2 text-sm text-violet-200/80">PDF, slides, Word, text or a recording</p>
      </div>
    </div>
  );
}
