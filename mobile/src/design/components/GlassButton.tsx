import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useMotion } from '../motion';
import { colors } from '../tokens';

const SIZE = 38;

/**
 * Icon-only toolbar control. Liquid Glass on iOS 26, a blur on older iOS,
 * and a plain ripple surface on Android (no faux glass there).
 */
export function GlassButton({
  symbol, label, onPress, tint = colors.violetMist, lively, disabled,
}: { symbol: SymbolViewProps['name']; label: string; onPress: () => void; tint?: string; lively?: boolean; disabled?: boolean }) {
  const { reduce } = useMotion();
  // `lively`: a slow repeating SF Symbol bounce that says "something's here".
  const animation = lively && !reduce ? { effect: { type: 'bounce' as const }, repeating: true, speed: 0.25 } : undefined;
  const icon = <SymbolView name={symbol} size={19} tintColor={tint} animationSpec={animation} />;
  let surface;
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    surface = <GlassView isInteractive style={styles.round}>{icon}</GlassView>;
  } else if (Platform.OS === 'ios') {
    surface = <BlurView intensity={40} tint="dark" style={styles.round}>{icon}</BlurView>;
  } else {
    surface = <View style={[styles.round, styles.android]}>{icon}</View>;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={8} style={disabled ? styles.disabled : undefined}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}>
      {surface}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  android: { backgroundColor: colors.raised },
  disabled: { opacity: 0.4 },
});
