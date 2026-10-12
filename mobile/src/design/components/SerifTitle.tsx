import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts } from '../tokens';

const SIZES = { large: 40, title: 26, card: 24 } as const;

export function SerifTitle({
  children, size = 'title', italic, color = colors.text, style,
}: { children: ReactNode; size?: keyof typeof SIZES; italic?: boolean; color?: string; style?: StyleProp<TextStyle> }) {
  const fontSize = SIZES[size];
  return (
    <Text
      accessibilityRole="header"
      style={[{ fontFamily: italic ? fonts.displayItalic : fonts.display, fontSize, lineHeight: fontSize * 1.08, color }, style]}
    >
      {children}
    </Text>
  );
}
