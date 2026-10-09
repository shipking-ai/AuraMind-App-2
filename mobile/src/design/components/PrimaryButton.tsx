import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic } from '../haptics';
import { useMotion } from '../motion';
import { colors, fonts, radius } from '../tokens';

const SWEEP_EVERY_MS = 2_600;

/** The one violet call to action per screen: a light sweep, a press squish, a tap. */
export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { reduce, spring } = useMotion();
  const scale = useSharedValue(1);
  const sweep = useSharedValue(-1);
  const width = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    sweep.value = withRepeat(withSequence(withTiming(-1, { duration: 0 }), withDelay(400, withTiming(1.4, { duration: 1_200 })), withTiming(1.4, { duration: SWEEP_EVERY_MS - 1_600 })), -1);
  }, [reduce, sweep]);

  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * width.value }, { skewX: '-20deg' }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { haptic('light'); onPress(); }}
      onPressIn={() => scale.set(withSpring(0.97, spring('pop')))}
      onPressOut={() => scale.set(withSpring(1, spring('pop')))}
    >
      <Animated.View style={[styles.button, press]} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
        {!reduce && <Animated.View pointerEvents="none" style={[styles.shine, shine]} />}
        <View>
          <Text style={styles.label}>{label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.violet, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center', overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', backgroundColor: 'rgba(255,255,255,0.28)' },
  label: { color: '#fff', fontFamily: fonts.uiBold, fontSize: 16 },
});
