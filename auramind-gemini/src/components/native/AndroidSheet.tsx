import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { pushBackHandler } from "../../lib/backStack";
import { hapticTap } from "./androidHaptics";

/**
 * Material 3 modal bottom sheet for the Android shell.
 *
 * What makes it read as native rather than a centered web dialog:
 *  - it rises from the bottom edge, above the gesture bar
 *  - a drag handle, and dragging down (or flinging) dismisses it
 *  - the system back gesture closes it instead of navigating (backStack)
 *
 * `busy` locks every dismissal path, so a half-finished delete cannot be
 * swiped away mid-request.
 */
export function AndroidSheet({
  open,
  onClose,
  title,
  eyebrow,
  description,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  });

  const requestClose = () => {
    if (busyRef.current) return;
    onCloseRef.current();
  };

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus into the sheet so screen readers and hardware keyboards land
    // inside it. The panel itself by default: focusing the first action paints
    // a focus ring on it for touch users. Fields opt in with data-autofocus.
    const frame = requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
      target?.focus();
    });
    const unregisterBack = pushBackHandler(requestClose);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      unregisterBack();
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
    // requestClose reads refs, so the effect only needs to follow `open`.
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      hapticTap();
      requestClose();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="android-sheet-layer" role="presentation">
          <motion.div
            className="android-sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={requestClose}
          />
          <motion.div
            ref={panelRef}
            className="android-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag={busy || reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <span className="android-sheet-handle" aria-hidden="true" />
            {eyebrow && <p className="android-eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="android-sheet-title">
              {title}
            </h2>
            {description && <p className="android-sheet-description">{description}</p>}
            <div className="android-sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** A full-width row inside a sheet: icon, label, optional supporting text. */
export function AndroidSheetAction({
  icon: Icon,
  label,
  detail,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  tone?: "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`android-sheet-action ${tone === "danger" ? "is-danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        hapticTap();
        onClick();
      }}
    >
      <span className="android-sheet-action-icon">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="android-sheet-action-label">{label}</span>
        {detail && <span className="android-sheet-action-detail">{detail}</span>}
      </span>
    </button>
  );
}

export default AndroidSheet;
