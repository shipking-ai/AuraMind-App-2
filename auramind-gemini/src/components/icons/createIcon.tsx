// BonaMind icon factory — our own, dependency-free icon system.
//
// This replaces the runtime dependency on `lucide-react`. Icon *shapes* were
// vendored from the ISC-licensed lucide set into `icons.generated.ts`; this
// file owns the rendering. Every icon is a 24×24 stroke-based SVG rendered
// with `currentColor`, so icons inherit text colour exactly like before.
//
// The public surface intentionally mirrors what callers used from lucide:
//   - each icon is a forwardRef component accepting `size`, `className`, and
//     any SVG attribute;
//   - `LucideIcon` is exported as the component type so existing prop types
//     keep compiling without edits at the call sites.

import {
  createElement,
  forwardRef,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
  type SVGAttributes,
} from 'react';

/** A single SVG element in an icon: [tagName, attributes]. */
export type IconNode = [elementName: string, attrs: Record<string, string | number>][];

/** What an icon draws. Either shape tuples (generated) or JSX (hand-drawn). */
export type IconDefinition = IconNode | ReactNode;

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  /** Pixel size (width & height). Defaults to 24. */
  size?: string | number;
  /** Scale stroke width with size instead of a fixed 2. */
  absoluteStrokeWidth?: boolean;
}

/** Component type for an icon. Drop-in replacement for lucide's LucideIcon. */
export type LucideIcon = ForwardRefExoticComponent<
  IconProps & RefAttributes<SVGSVGElement>
>;

function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

/** True when the definition is an array of `[tag, attrs]` shape tuples. */
function isIconNode(def: IconDefinition): def is IconNode {
  return (
    Array.isArray(def) &&
    def.length > 0 &&
    Array.isArray(def[0]) &&
    typeof (def[0] as unknown[])[0] === 'string'
  );
}

/** Base <svg> shell shared by every icon. */
export const Icon = forwardRef<SVGSVGElement, IconProps>(
  (
    { size = 24, absoluteStrokeWidth, className, children, ...rest },
    ref,
  ) =>
    createElement(
      'svg',
      {
        ref,
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: absoluteStrokeWidth ? Number(size) / 24 : 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        ...rest,
      },
      children,
    ),
);
Icon.displayName = 'Icon';

/**
 * Builds an icon component from a shape definition.
 *
 * `definition` is either:
 *   - an `IconNode` (array of `[tag, attrs]` tuples) — the vendored/generated
 *     form; or
 *   - raw JSX (`<path …/>`, a fragment, etc.) — the hand-drawn form used by
 *     the bespoke set in `./set`.
 *
 * `iconName` is the PascalCase name (e.g. "Flame"); it is used for the
 * displayName and to derive a stable `aura-icon-<kebab>` class so icons can
 * still be targeted from CSS/tests the way `lucide-<name>` used to be.
 */
export function createIcon(iconName: string, definition: IconDefinition): LucideIcon {
  const children = isIconNode(definition)
    ? definition.map(([tag, attrs]) => createElement(tag, attrs))
    : definition;

  const Component = forwardRef<SVGSVGElement, IconProps>(
    ({ className, ...rest }, ref) =>
      createElement(
        Icon,
        {
          ref,
          className: ['aura-icon', `aura-icon-${toKebab(iconName)}`, className]
            .filter(Boolean)
            .join(' '),
          ...rest,
        },
        children,
      ),
  );
  Component.displayName = iconName;
  return Component;
}
