import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../haptics';
import { useMotion } from '../motion';
import { colors, fonts, radius } from '../tokens';

const PAD = 3;

/** A pill track whose violet thumb springs to the chosen option. */
export function SegmentedControl<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange(v: T): void }) {
  const { reduce, spring } = useMotion();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const width = useSharedValue(0);
  const at = useSharedValue(index);

  useEffect(() => {
    at.set(reduce ? withTiming(index, { duration: 180 }) : withSpring(index, spring('pop')));
  }, [index, reduce, spring, at]);

  const thumb = useAnimatedStyle(() => {
    const w = (width.value - PAD * 2) / options.length;
    return { width: w, transform: [{ translateX: at.value * w }] };
  });

  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      onLayout={(e) => width.set(e.nativeEvent.layout.width)}
    >
      <Animated.View pointerEvents="none" style={[styles.thumb, thumb]} />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) { haptic('selection'); onChange(o.value); } }}
            style={styles.option}
          >
            <Text style={[styles.label, selected && styles.selected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: PAD, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.pill, backgroundColor: colors.violet },
  option: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  label: { color: colors.textMuted, fontFamily: fonts.uiBold, fontSize: 14 },
  selected: { color: '#fff' },
});
