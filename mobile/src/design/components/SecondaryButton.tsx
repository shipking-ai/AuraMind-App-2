import { Pressable, StyleSheet, Text } from 'react-native';
import { haptic } from '../haptics';
import { colors, fonts, radius } from '../tokens';

/** A quiet full-width action: a hairline capsule on the night canvas. */
export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={() => { if (disabled) return; haptic('light'); onPress(); }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  disabled: { opacity: 0.5 },
  label: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
});
