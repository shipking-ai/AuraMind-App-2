import { colors, fonts } from '../design/tokens';

/** iOS large title that collapses into the glass nav bar on scroll. */
export const largeTitleOptions = {
  headerLargeTitle: true,
  headerTransparent: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerTintColor: colors.violetMist,
  headerTitleStyle: { fontFamily: fonts.uiBold, color: colors.text },
  headerLargeTitleStyle: { fontFamily: fonts.display, color: colors.text },
  contentStyle: { backgroundColor: 'transparent' },
} as const;
