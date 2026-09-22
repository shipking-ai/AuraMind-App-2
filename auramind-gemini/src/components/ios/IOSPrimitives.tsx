/**
 * iOS building blocks for the AuraMind iPhone app. Each mirrors a UIKit /
 * SwiftUI control closely enough that the app reads as native: navigation
 * bar with a collapsing large title, inset grouped lists, switches, steppers,
 * segmented controls, action sheets, sheets with a grabber, and activity
 * rings. Styles live in src/styles/ios-native.css.
 */
import React, { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, type LucideIcon } from "../icons";
import { iosSelection, iosTap } from "./iosHaptics";

export const IOS_SCROLLER_ID = "nova-main-content";

const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/**
 * Sheets render at the root of the iOS app (not inside the scroller, whose
 * stacking context sits under the tab bar) but still inside .ios-app, so the
 * design tokens apply.
 */
function IOSPortal({ children }: { children: React.ReactNode }) {
  const target = typeof document !== "undefined" ? document.querySelector(".ios-app") : null;
  return target ? createPortal(children, target) : <>{children}</>;
}

/** True once the page has scrolled past the large title. */
export function useLargeTitleCollapsed(threshold = 44): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = document.getElementById(IOS_SCROLLER_ID);
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setCollapsed(el.scrollTop > threshold);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return collapsed;
}

export function IOSNavBar({
  title,
  eyebrow,
  leading,
  trailing,
}: {
  title: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const collapsed = useLargeTitleCollapsed();
  return (
    <>
      <header className={`ios-navbar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="ios-navbar-row">
          <div className="ios-navbar-side">{leading}</div>
          <span className="ios-navbar-inline-title" aria-hidden={!collapsed}>
            {title}
          </span>
          <div className="ios-navbar-side is-trailing">{trailing}</div>
        </div>
      </header>
      <div className="ios-large-title-block">
        {eyebrow && <div className="ios-eyebrow">{eyebrow}</div>}
        <h1 className="ios-large-title">{title}</h1>
      </div>
    </>
  );
}

export function IOSBarButton({
  label,
  icon: Icon,
  onClick,
  glass,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  glass?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`ios-bar-button ${glass ? "ios-bar-glass-button ios-glass" : ""}`}
      onClick={() => {
        iosTap();
        onClick();
      }}
    >
      {Icon && <Icon className="h-[22px] w-[22px]" aria-hidden />}
      {children}
    </button>
  );
}

export function IOSSection({
  title,
  caption,
  footer,
  action,
  children,
}: {
  title?: string;
  caption?: string;
  footer?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ios-section">
      {title && (
        <div className="ios-section-header">
          <h2 className="ios-section-title">{title}</h2>
          {action}
        </div>
      )}
      {caption && <div className="ios-section-caption">{caption}</div>}
      <div className="ios-list">{children}</div>
      {footer && <div className="ios-section-footer">{footer}</div>}
    </section>
  );
}

export function IOSIconTile({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span className="ios-icon-tile" style={{ background: color }} aria-hidden>
      <Icon />
    </span>
  );
}

export function IOSRow({
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onClick,
  destructive,
  separatorInset,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  /** Where the hairline above the next row starts, in px from the left. */
  separatorInset?: number;
}) {
  const style =
    separatorInset !== undefined
      ? ({ "--ios-sep-inset": `${separatorInset}px` } as React.CSSProperties)
      : undefined;
  const content = (
    <>
      {leading}
      <div className="ios-row-body">
        <div className="ios-row-title">{title}</div>
        {subtitle && <div className="ios-row-subtitle">{subtitle}</div>}
      </div>
      {value && <span className="ios-row-value">{value}</span>}
      {trailing}
      {chevron && <ChevronRight className="ios-chevron" aria-hidden />}
    </>
  );
  const className = `ios-row ${destructive ? "ios-row-destructive" : ""}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => {
          iosTap();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export function IOSSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ios-switch"
      onClick={() => {
        iosSelection();
        onChange(!checked);
      }}
    />
  );
}

export function IOSStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) {
      iosSelection();
      onChange(clamped);
    }
  };
  return (
    <div className="ios-stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => set(value - step)}
        disabled={value <= min}
      >
        −
      </button>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => set(value + step)}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}

export function IOSSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const n = options.length;
  return (
    <div className="ios-segmented" role="tablist" aria-label={label}>
      <div
        className="ios-segmented-thumb"
        aria-hidden
        style={{
          inset: "auto",
          top: 2,
          bottom: 2,
          left: 2,
          width: `calc((100% - 4px) / ${n})`,
          transform: `translateX(${index * 100}%)`,
          transition: "transform 0.28s cubic-bezier(0.3, 1.2, 0.5, 1)",
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => {
            if (option.value !== value) {
              iosSelection();
              onChange(option.value);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface IOSAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function IOSActionSheet({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title?: string;
  actions: IOSAction[];
  onClose: () => void;
}) {
  return (
    <IOSPortal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="ios-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              key="sheet"
              className="ios-action-sheet"
              role="dialog"
              aria-label={title ?? "Actions"}
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              exit={{ y: "110%" }}
              transition={SPRING}
            >
              <div className="ios-action-group ios-glass">
                {title && <div className="ios-action-title">{title}</div>}
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={`ios-action ${action.destructive ? "is-destructive" : ""}`}
                    onClick={() => {
                      iosTap();
                      onClose();
                      action.onSelect();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="ios-action-group ios-glass">
                <button type="button" className="ios-action is-cancel" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </IOSPortal>
  );
}

export function IOSSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <IOSPortal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="ios-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              key="sheet"
              className="ios-sheet ios-glass"
              role="dialog"
              aria-labelledby={titleId}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SPRING}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) onClose();
              }}
            >
              <div className="ios-sheet-grabber" aria-hidden />
              <div className="ios-sheet-header">
                <span id={titleId} className="ios-sheet-title">
                  {title}
                </span>
                <button
                  type="button"
                  className="ios-bar-button"
                  style={{ fontWeight: 600 }}
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
              <div className="ios-sheet-body">{children}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </IOSPortal>
  );
}

/** A checkmarked choice list inside a sheet (like a Settings picker). */
export function IOSChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="ios-section" style={{ marginBottom: 0 }}>
      <div className="ios-list">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ios-row"
            style={{ "--ios-sep-inset": "16px" } as React.CSSProperties}
            onClick={() => {
              iosSelection();
              onChange(option.value);
            }}
          >
            <div className="ios-row-body">
              <div className="ios-row-title">{option.label}</div>
            </div>
            {option.value === value && <Check className="ios-check" aria-label="Selected" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Activity rings, as in Apple Fitness: concentric progress arcs on dimmed
 * tracks, round caps, drawn in on first render.
 */
export function ActivityRings({
  rings,
  size = 132,
  stroke = 16,
}: {
  rings: Array<{ progress: number; color: string; label: string }>;
  size?: number;
  stroke?: number;
}) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const gap = 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={rings
        .map((r) => `${r.label} ${Math.round(Math.min(1, r.progress) * 100)}%`)
        .join(", ")}
      style={{ flexShrink: 0 }}
    >
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap);
        const c = 2 * Math.PI * r;
        const p = Math.min(1, Math.max(0, ring.progress));
        return (
          <g key={ring.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeOpacity={0.22}
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={drawn ? c * (1 - p) : c}
              style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2, 0.9, 0.3, 1)" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** A stable, pleasant gradient per deck, chosen from its id. */
const DECK_GRADIENTS = [
  "linear-gradient(135deg, #8b5cf6, #6366f1)",
  "linear-gradient(135deg, #f472b6, #db2777)",
  "linear-gradient(135deg, #22d3ee, #0ea5e9)",
  "linear-gradient(135deg, #34d399, #059669)",
  "linear-gradient(135deg, #fbbf24, #f97316)",
  "linear-gradient(135deg, #a78bfa, #ec4899)",
  "linear-gradient(135deg, #60a5fa, #7c3aed)",
];

export function deckGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DECK_GRADIENTS[h % DECK_GRADIENTS.length];
}
