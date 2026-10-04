/**
 * BonaMind SVG system.
 *
 * Shared rules for anything added here:
 *   - Draw on a stated grid (96 for icons, 160×120 for illustrations) and
 *     say what the grid is in the component's docblock.
 *   - Stroke, never fill, for line art. `currentColor` only — colour comes
 *     from the parent so these work on any surface and in any theme.
 *   - Round caps and joins throughout; 2px at illustration scale, 3px for
 *     glyphs inside the orb.
 *   - Animation lives in styles/graphics.css, is tied to real state, and
 *     resolves to a readable frame under prefers-reduced-motion.
 *   - Every export takes `size` and `className` and sets role="img" with a
 *     meaningful aria-label.
 */
// Voice
export { VoiceAura, type VoiceAuraProps } from './VoiceAura';
export { VoiceOrb, type VoiceOrbState, type VoiceOrbProps } from './VoiceOrb';
export { MicBlockedArt } from './MicBlockedArt';

// Study loop
export { VerdictMark } from './VerdictMark';
export { RetentionCurve } from './RetentionCurve';
export { StreakTrail } from './StreakTrail';
export { AchievementArt } from './AchievementArt';

// Empty states
export { CaughtUpArt } from './CaughtUpArt';
export { NoDecksArt } from './NoDecksArt';
export { NoResultsArt } from './NoResultsArt';

// Generator
export { AudioIngestArt, DocumentIngestArt } from './IngestArt';

// Failure states
export { OfflineArt } from './OfflineArt';
export { NotFoundArt } from './NotFoundArt';
export { GenericErrorArt } from './GenericErrorArt';
