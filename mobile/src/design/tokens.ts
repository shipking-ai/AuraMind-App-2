/**
 * BonaMind design tokens: Aurora (the night canvas and its glows) + Paper
 * (the cream cards you read and study). Components read colors, type and
 * motion only from here.
 */
export const colors = {
  night: '#0A0A0F',
  surface: '#15151E',
  raised: '#1A1A24',
  hairline: 'rgba(255,255,255,0.09)',
  violet: '#7C3AED',
  violetBright: '#8B5CF6',
  violetSoft: '#A78BFA',
  violetMist: '#C4B5FD',
  cyan: '#22D3EE',
  pink: '#EC4899',
  paper: '#F5EFE3',
  ink: '#1C1917',
  inkMuted: '#78716C',
  good: '#34D399',
  again: '#F87171',
  hard: '#FCD34D',
  streak: '#FB923C',
  text: '#F0EFFE',
  textMuted: '#9090A8',
} as const;

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  ui: 'BonaSans',
  uiBold: 'BonaSans-Bold',
  script: 'BonaScript',
} as const;

export const radius = { card: 24, tile: 18, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Named springs (Reanimated WithSpringConfig). */
export const springs = {
  rise: { damping: 14, stiffness: 160 },
  flip: { damping: 12, stiffness: 140 },
  pop: { damping: 10, stiffness: 220 },
  sheet: { damping: 18, stiffness: 200 },
  settle: { damping: 16, stiffness: 180 },
} as const;

export type SpringName = keyof typeof springs;

/** Accent palette for confetti and celebration. */
export const confettiColors = [colors.violetSoft, colors.cyan, '#F472B6', colors.hard, colors.good, colors.paper] as const;
