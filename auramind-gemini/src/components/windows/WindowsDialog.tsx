/**
 * A Windows-style modal dialog: Tab stays inside, Esc closes, the backdrop
 * optionally closes, and focus returns to `returnFocusTo` (or whatever had it
 * before) when it goes away.
 */
import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface WindowsDialogProps {
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  returnFocusTo?: HTMLElement | null;
}

export function WindowsDialog({ title, children, actions, onClose, closeOnBackdrop = false, returnFocusTo }: WindowsDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`win-dialog-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const before = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => { if (before && document.contains(before)) before.focus(); };
    // Mount/unmount only: the element to return to is fixed when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div
      className="win-scrim"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="win-dialog" onKeyDown={onKeyDown}>
        <h2 id={titleId} className="win-dialog-title">{title}</h2>
        {children}
        <div className="win-dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
