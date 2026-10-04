/**
 * BonaMind effects library — hand-rolled, first-party replacements for the
 * most-used components from Magic UI / bklit UI / React Bits / Kokonut,
 * plus direct integrations of `animejs` v4 (the only animation lib we
 * have a runtime dep on for this layer).
 *
 * Every export here is a thin React wrapper around an anime.js v4 API.
 * The full v4 surface covered:
 *   - animate()         → AnimeCelebration, StaggerList, DrawPath, MorphShape, MotionPath, TextSplit, TextScramble
 *   - stagger()         → StaggerList
 *   - createTimeline()  → AnimeCelebration
 *   - createSpring()    → AnimeCelebration, easingPresets
 *   - createDraggable() → useDraggable
 *   - createTimer()     → useTimer
 *   - createScope()     → Scope
 *   - createAnimatable()→ useAnimatable
 *   - createDrawable()  → DrawPath
 *   - createMotionPath()→ MotionPath
 *   - morphTo()         → MorphShape
 *   - splitText()       → TextSplit
 *   - scrambleText()    → TextScramble
 *   - scrollObserver    → useScrollReveal
 *   - utils.random      → animeUtils
 *   - cubicBezier       → easingPresets
 *   - createSteps/steps → easingPresets
 *
 * Why hand-rolled (instead of pulling from `npx shadcn add @bklit/...`):
 *   - The shadcn CLI copies components into YOUR `components/` folder. Same
 *     outcome, but writing the primitives here keeps the API surface
 *     aligned with BonaMind's design tokens + theming + reduced-motion
 *     policy in one place. No copy drift over time.
 *   - No new runtime dependencies beyond `framer-motion` + `recharts` +
 *     `animejs` (all already in the project). Cuts bundle weight and
 *     lockfile churn.
 *   - We get total control over prefers-reduced-motion behavior (every
 *     effect here is a no-op when reduced motion is on).
 *
 * Adding a new effect: drop the file in this folder, re-export from this
 * barrel, and reference it via `Effects.<Name>`. The pattern is uniform.
 */

// ─── Pre-existing effects ──────────────────────────────────────────────────
export { Confetti, type ConfettiProps, type ConfettiHandle, type ConfettiOverrides } from './Confetti';
export { TextEffect, type TextEffectProps } from './TextEffect';
export { ClickSparkles, type ClickSparklesProps } from './ClickSparkles';
export { Marquee, type MarqueeProps } from './Marquee';
export { ParticleField, type ParticleFieldProps } from './ParticleField';
export { useReducedMotion } from './useReducedMotion';
export { AreaChart, LineChart, type AreaChartProps, type LineChartProps, type ChartSeries } from './charts';

// ─── anime.js v4 integrations ──────────────────────────────────────────────
export {
  AnimeCelebration,
  type AnimeCelebrationProps,
  type AnimeCelebrationHandle,
} from './AnimeCelebration';
export { StaggerList, type StaggerListProps } from './StaggerList';
export {
  useDraggable,
  type UseDraggableOptions,
  type DraggableAxis,
} from './useDraggable';
export {
  useTimer,
  type UseTimerOptions,
  type UseTimerHandle,
} from './useTimer';
export {
  useScrollReveal,
  type UseScrollRevealOptions,
  type UseScrollRevealHandle,
} from './useScrollReveal';
export { useAnimatable, type UseAnimatableOptions } from './useAnimatable';
export { Scope, type ScopeProps, type ScopeHandle } from './Scope';
export { DrawPath, type DrawPathProps } from './DrawPath';
export { MorphShape, type MorphShapeProps } from './MorphShape';
export { MotionPath, type MotionPathProps } from './MotionPath';
export {
  TextSplit,
  type TextSplitProps,
  type TextSplitHandle,
} from './TextSplit';
export { TextScramble, type TextScrambleProps } from './TextScramble';
export {
  random,
  stagger,
  createSeededRandom,
  randomPick,
  shuffle,
  clamp,
  lerp,
  damp,
  mapRange,
  wrap,
  snap,
  degToRad,
  radToDeg,
  type AuraEasingName,
} from './animeUtils';
// Namespace export so callers can do `import { animeUtils } from '@/lib/effects'`.
export * as animeUtils from './animeUtils';

// ─── SVG morph path data ───────────────────────────────────────────────────
export { MORPH_PATHS, type MorphPathPair } from './morphPaths';
export {
  easingPresets,
  gentle,
  snappy,
  decelerate,
  accelerate,
  sharp,
  standard,
  bouncy,
  wobbly,
  flat,
  stepsFactory,
  type EasingPresetName,
} from './easingPresets';
