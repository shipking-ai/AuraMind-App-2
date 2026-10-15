/**
 * ProfLinneaAvatar — circular avatar wrapper around the ProfLinnea SVG.
 *
 * Distribution plan ("ProfLinnea everywhere"):
 *   - AppShell sidebar user block — replaces the violet pill with the user's
 *     initial; if the user has uploaded a portrait, we show that instead so
 *     we never erase a personal choice (per design review E).
 *   - Empty-state illustrations on /dashboard/study, /dashboard/leaderboard
 *     etc. — centred at 96-128px with a tasty gradient halo.
 *   - Login / Onboarding welcome screens.
 *
 * Why a wrapper rather than just <ProfLinnea />:
 *   - Adds the circular clip + halo gradient that the rest of the app uses
 *     for "small portrait in a circle" surfaces.
 *   - Gives us a single place to wire `audioLevel` from useMicVolume so any
 *     mounted avatar reacts to dictation without callers having to thread
 *     the prop themselves.
 */
import ProfLinnea, { type ProfLinneaVariant, type ProfLinneaMood } from '../chat/ProfLinnea';

interface Props {
  size?: number;
  mood?: ProfLinneaMood;
  variant?: ProfLinneaVariant;
  /** Real user-uploaded avatar URL — if present, we show that, NOT ProfLinnea. */
  avatarUrl?: string | null;
  /** 1-2 letter initial fallback when no avatar URL is set. */
  initial?: string;
  /** Show the outer halo ring (true on welcome cards). */
  halo?: boolean;
  /** When present, orbit stars expand outward in proportion to mic level. */
  audioLevel?: number;
  className?: string;
}

export default function ProfLinneaAvatar({
  size = 56,
  mood = 'default',
  variant = 'badge',
  avatarUrl,
  initial,
  halo = false,
  audioLevel,
  className = '',
}: Props) {
  // Respect user-chosen portraits (per design review E: do not erase them).
  if (avatarUrl) {
    return (
      <div className={`relative ${className}`} style={{ width: size, height: size }}>
        <img
          src={avatarUrl}
          alt="Profile"
          className="w-full h-full rounded-full object-cover ring-2 ring-[#7C3AED]/30"
        />
      </div>
    );
  }

  const displayInitial = (initial ?? 'A').slice(0, 2).toUpperCase();

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label={`Prof. Linnea${displayInitial ? ` — initials ${displayInitial}` : ''}`}
    >
      {halo && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: '0 0 0 1px rgba(124,58,237,0.35), 0 0 30px rgba(124,58,237,0.25)',
          }}
        />
      )}
      <div
        className="absolute inset-0 rounded-full overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#06B6D4]"
        style={{ padding: Math.max(2, Math.round(size * 0.1)) }}
      >
        <div className="w-full h-full rounded-full bg-[#0A0A0F] flex items-center justify-center">
          <ProfLinnea variant={variant} size={Math.round(size * 0.78)} mood={mood} audioLevel={audioLevel} />
        </div>
      </div>
    </div>
  );
}
