import { Rating } from '@bonamind/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';

const OPTIONS: { rating: Rating; label: string; color: string }[] = [
  { rating: Rating.AGAIN, label: 'Again', color: colors.again },
  { rating: Rating.HARD, label: 'Hard', color: colors.hard },
  { rating: Rating.GOOD, label: 'Good', color: colors.good },
  { rating: Rating.EASY, label: 'Easy', color: colors.violetSoft },
];

/** All four ratings, for a long-press (and the only way to pick Hard). */
export function RatingBar({ onRate, onDismiss }: { onRate(rating: Rating): void; onDismiss(): void }) {
  const { reduce } = useMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.springify().damping(14)}
      exiting={reduce ? undefined : FadeOutDown.duration(160)}
      style={styles.bar}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Close ratings" onPress={onDismiss} style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            onPress={() => onRate(o.rating)}
            style={({ pressed }) => [styles.option, { borderColor: o.color }, pressed && styles.pressed]}
          >
            <Text style={[styles.text, { color: o.color }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: -76 },
  row: { flexDirection: 'row', gap: space.sm },
  option: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.tile, borderWidth: 1.5, backgroundColor: colors.raised },
  pressed: { transform: [{ scale: 0.94 }] },
  text: { fontFamily: fonts.uiBold, fontSize: 14 },
});
