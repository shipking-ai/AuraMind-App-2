/**
 * NoDecksArt — the first thing a new account sees.
 *
 * This state's job is not to say "empty", it is to say "the next thing is
 * cheap". So the drawing shows a card being *made*: an outline slot with
 * a plus, and the two source shapes BonaMind can build from (an audio
 * waveform and a document) feeding into it.
 *
 * 160×120 grid, shared with the other illustrations.
 */
export function NoDecksArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="No decks yet — create one from audio or a document"
    >
      {/* Source: audio. Bars, matching the VoiceOrb's level-meter language. */}
      <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.55}>
        <path d="M16 52v10" />
        <path d="M23 46v22" />
        <path d="M30 50v14" />
      </g>

      {/* Source: document. */}
      <g stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" opacity={0.55}>
        <path d="M14 78h20a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" />
        <path d="M19 86h10M19 92h14M19 98h8" strokeLinecap="round" />
      </g>

      {/* Feed lines converge on the slot. Dashed = not yet real. */}
      <g
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="3 5"
        opacity={0.4}
      >
        <path d="M38 57h18a6 6 0 0 1 6 6v2" />
        <path d="M44 90h12a6 6 0 0 0 6-6v-2" />
      </g>

      {/* The empty deck slot. Dashed border is the standard "drop target"
          idiom; keeping it means the graphic doubles as an affordance. */}
      <rect
        x={74}
        y={34}
        width={64}
        height={52}
        rx={7}
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="6 5"
        opacity={0.75}
      />
      <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M106 50v20" />
        <path d="M96 60h20" />
      </g>
    </svg>
  );
}
