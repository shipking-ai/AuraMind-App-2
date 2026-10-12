import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMotion } from '../motion';
import { colors, fonts, space } from '../tokens';

/** What the loader says while it works; one line every LINE_MS. */
export const LOADING_LINES = [
  'Shuffling your due cards',
  'Checking what you remember',
  'Lining up the tricky ones',
  'Warming up the aurora',
] as const;
const LINE_MS = 2_000;

// The BonaMind prism, in its 512-unit design space (same as the app icon).
const OUTER = 'M256 79L424 256L256 433L88 256Z';
const INNER = 'M256 151L357 256L256 361L155 256Z';
const MARK = ['#72F4FF', '#8E89FF', '#D38BFF', '#FF9ACD'];
const SIZE = 168;
const SCALE = SIZE / 512;
const C = 256;

const TRACE_MS = 2_400;
const ORBIT_MS = 6_000;
const BREATH_MS = 1_600;
const COMET = 0.22; // length of the travelling highlight, as a fraction of the outline

/** A point on the orbit ring, in design space. */
function orbitPoint(t: number, phase: number, axis: 'x' | 'y') {
  'worklet';
  const a = (t + phase) * Math.PI * 2;
  return axis === 'x' ? C + 232 * Math.cos(a) : C + 232 * Math.sin(a) * 0.92;
}

function Spark({ orbit, phase }: { orbit: SharedValue<number>; phase: number }) {
  const cx = useDerivedValue(() => orbitPoint(orbit.value, phase, 'x'));
  const cy = useDerivedValue(() => orbitPoint(orbit.value, phase, 'y'));
  return (
    <Circle cx={cx} cy={cy} r={9} color={colors.violetMist}>
      <BlurMask blur={4} style="solid" />
    </Circle>
  );
}

/** The animated prism: a comet runs the outline, the core breathes, sparks orbit. */
function Prism({ still }: { still: boolean }) {
  const outer = useMemo(() => Skia.Path.MakeFromSVGString(OUTER), []);
  const inner = useMemo(() => Skia.Path.MakeFromSVGString(INNER), []);
  const trace = useSharedValue(0);
  const orbit = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    trace.set(withRepeat(withTiming(1, { duration: TRACE_MS, easing: Easing.inOut(Easing.cubic) }), -1));
    orbit.set(withRepeat(withTiming(1, { duration: ORBIT_MS, easing: Easing.linear }), -1));
    breath.set(withRepeat(withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [still, trace, orbit, breath]);

  const cometStart = useDerivedValue(() => Math.max(0, trace.value * (1 + COMET) - COMET));
  const cometEnd = useDerivedValue(() => Math.min(1, trace.value * (1 + COMET)));
  // The inner diamond's comet runs the other way, half a lap behind.
  const innerT = useDerivedValue(() => 1 - ((trace.value + 0.5) % 1));
  const innerStart = useDerivedValue(() => Math.max(0, innerT.value - COMET));
  const innerEnd = useDerivedValue(() => innerT.value);
  const coreR = useDerivedValue(() => 26 + 7 * breath.value);
  const haloR = useDerivedValue(() => 150 + 40 * breath.value);
  const haloOpacity = useDerivedValue(() => 0.35 + 0.3 * breath.value);

  if (!outer || !inner) return null;
  return (
    <Canvas style={styles.canvas}>
      <Group transform={[{ scale: SCALE }]}>
        <Circle cx={C} cy={C} r={haloR} opacity={haloOpacity}>
          <RadialGradient c={vec(C, C)} r={220} colors={['rgba(211,139,255,0.55)', 'rgba(124,58,237,0.18)', 'rgba(124,58,237,0)']} />
          <BlurMask blur={30} style="normal" />
        </Circle>

        {/* The mark itself, slightly dimmed so the comets read as light. */}
        <Group opacity={0.55}>
          <Path path={outer} style="stroke" strokeWidth={56} strokeJoin="round">
            <LinearGradient start={vec(112, 394)} end={vec(406, 112)} colors={MARK} />
          </Path>
          <Path path={inner} style="stroke" strokeWidth={23} strokeJoin="round">
            <LinearGradient start={vec(112, 394)} end={vec(406, 112)} colors={MARK} />
          </Path>
        </Group>

        {!still && (
          <>
            <Path path={outer} style="stroke" strokeWidth={56} strokeJoin="round" strokeCap="round" start={cometStart} end={cometEnd} color="#FFFFFF" opacity={0.9}>
              <BlurMask blur={10} style="solid" />
            </Path>
            <Path path={inner} style="stroke" strokeWidth={23} strokeJoin="round" strokeCap="round" start={innerStart} end={innerEnd} color="#E9D5FF" opacity={0.8}>
              <BlurMask blur={6} style="solid" />
            </Path>
            <Spark orbit={orbit} phase={0} />
            <Spark orbit={orbit} phase={1 / 3} />
            <Spark orbit={orbit} phase={2 / 3} />
          </>
        )}

        <Circle cx={C} cy={C} r={still ? 28 : coreR}>
          <RadialGradient c={vec(C - 9, C - 11)} r={40} colors={['#FFFFFF', '#F1FEFF', '#8CEBFF']} />
          <BlurMask blur={4} style="solid" />
        </Circle>
      </Group>
    </Canvas>
  );
}

/**
 * Full-screen loading state over the aurora: the animated prism, a title, and
 * a line that changes every two seconds so a slow network still feels alive.
 */
export function LoadingScreen({ title }: { title: string }) {
  const { reduce } = useMotion();
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setLine((i) => (i + 1) % LOADING_LINES.length), LINE_MS);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={title}>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(500)}>
          <Prism still={reduce} />
        </Animated.View>
        <Animated.Text entering={reduce ? undefined : FadeIn.delay(150).duration(600)} style={styles.title}>{title}</Animated.Text>
        <View style={styles.lineBox}>
          <Animated.Text
            key={line}
            entering={reduce ? undefined : FadeIn.duration(450)}
            exiting={reduce ? undefined : FadeOut.duration(300)}
            style={styles.line}
          >
            {LOADING_LINES[line]}
          </Animated.Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  canvas: { width: SIZE, height: SIZE },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  lineBox: { height: 24, alignSelf: 'stretch', alignItems: 'center' },
  line: { position: 'absolute', color: colors.violetMist, fontFamily: fonts.displayItalic, fontSize: 18 },
});
