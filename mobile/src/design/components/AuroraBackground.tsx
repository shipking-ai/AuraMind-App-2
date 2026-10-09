import { Blur, Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing, interpolateColor, useAnimatedReaction, useDerivedValue, useSharedValue,
  withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useMotion } from '../motion';
import { colors } from '../tokens';

type Point = { x: number; y: number } | null;

const DRIFT_MS = [9_000, 11_000, 13_000] as const;
const FOLLOW_MS = 1_200;

/**
 * The Aurora: three slow glows (violet, cyan, pink) drifting on the GPU, a
 * fourth that trails the finger, and a violet that warms toward pink as a
 * session goes well. Everything animates on the UI thread through shared
 * values; Reduce Motion draws the glows once and stops.
 */
export function AuroraBackground({
  intensity = 0.6, warmth, touch,
}: { intensity?: number; warmth?: SharedValue<number>; touch?: SharedValue<Point> }) {
  const { width, height } = useWindowDimensions();
  const { reduce } = useMotion();
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);
  const fx = useSharedValue(width * 0.3);
  const fy = useSharedValue(height * 0.55);

  useEffect(() => {
    if (reduce) return;
    const ease = Easing.inOut(Easing.sin);
    [p1, p2, p3].forEach((p, i) => { p.value = withRepeat(withTiming(1, { duration: DRIFT_MS[i], easing: ease }), -1, true); });
  }, [reduce, p1, p2, p3]);

  useAnimatedReaction(
    () => touch?.value ?? null,
    (pt) => {
      if (!pt || reduce) return;
      fx.value = withTiming(pt.x, { duration: FOLLOW_MS });
      fy.value = withTiming(pt.y, { duration: FOLLOW_MS });
    },
    [reduce],
  );

  const vx = useDerivedValue(() => width * 0.85 - 50 * p1.value);
  const vy = useDerivedValue(() => height * 0.08 + 60 * p1.value);
  const cx = useDerivedValue(() => -width * 0.05 + 60 * p2.value);
  const cy = useDerivedValue(() => height * 0.35 + 40 * p2.value);
  const kx = useDerivedValue(() => width * 0.9 - 40 * p3.value);
  const ky = useDerivedValue(() => height * 0.95 - 50 * p3.value);
  const violet = useDerivedValue(() => interpolateColor(warmth?.value ?? 0, [0, 1], [colors.violet, colors.pink]));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={intensity}>
        <Blur blur={42} />
        <Circle cx={vx} cy={vy} r={width * 0.6} color={violet} opacity={0.9} />
        <Circle cx={cx} cy={cy} r={width * 0.5} color={colors.cyan} opacity={0.5} />
        <Circle cx={kx} cy={ky} r={width * 0.5} color={colors.pink} opacity={0.45} />
        {!reduce && <Circle cx={fx} cy={fy} r={width * 0.4} color={colors.violetBright} opacity={0.55} />}
      </Group>
    </Canvas>
  );
}

/** A screen with the aurora behind it; touches anywhere steer the trailing glow. */
export function AuroraScreen({
  children, intensity, warmth,
}: { children: ReactNode; intensity?: number; warmth?: SharedValue<number> }) {
  const touch = useSharedValue<Point>(null);
  const capture = Gesture.Manual()
    .onTouchesDown((e) => { const t = e.allTouches[0]; if (t) touch.value = { x: t.x, y: t.y }; })
    .onTouchesMove((e) => { const t = e.allTouches[0]; if (t) touch.value = { x: t.x, y: t.y }; });
  return (
    <GestureDetector gesture={capture}>
      <View style={styles.screen}>
        <AuroraBackground intensity={intensity} warmth={warmth} touch={touch} />
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.night } });
