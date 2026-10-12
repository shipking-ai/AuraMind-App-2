import { Canvas, Rect } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useMotion } from '../motion';
import { confettiColors } from '../tokens';

type Mode = 'burst' | 'rain';
type Particle = { dx: number; dy: number; x0: number; spin: number; color: string };

const COUNT: Record<Mode, number> = { burst: 40, rain: 80 };
const DURATION: Record<Mode, number> = { burst: 1_000, rain: 2_600 };

function makeParticles(mode: Mode, width: number): Particle[] {
  return Array.from({ length: COUNT[mode] }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const d = 80 + Math.random() * 140;
    return mode === 'burst'
      ? { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 50, x0: 0, spin: Math.random() * 12 - 6, color: confettiColors[i % confettiColors.length] }
      : { dx: Math.random() * 80 - 40, dy: 0, x0: Math.random() * width, spin: Math.random() * 16 - 8, color: confettiColors[i % confettiColors.length] };
  });
}

function Piece({ p, t, mode, origin, height }: { p: Particle; t: SharedValue<number>; mode: Mode; origin: { x: number; y: number }; height: number }) {
  const x = useDerivedValue(() => (mode === 'burst' ? origin.x + p.dx * t.value : p.x0 + p.dx * t.value));
  const y = useDerivedValue(() => (mode === 'burst' ? origin.y + p.dy * t.value + 120 * t.value * t.value : -20 + (height + 40) * t.value));
  const opacity = useDerivedValue(() => (mode === 'burst' ? 1 - t.value : 1 - t.value * t.value));
  const transform = useDerivedValue(() => [{ rotate: p.spin * t.value }]);
  return <Rect x={x} y={y} width={7} height={11} color={p.color} opacity={opacity} transform={transform} />;
}

/** Fires once per change of `trigger`. Renders nothing under Reduce Motion. */
export function Confetti({ trigger, origin, mode }: { trigger: number; origin: { x: number; y: number }; mode: Mode }) {
  const { reduce } = useMotion();
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(1);
  // New particles for each trigger; `trigger` is the deliberate key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const particles = useMemo(() => makeParticles(mode, width), [trigger, mode, width]);

  useEffect(() => {
    if (reduce || trigger <= 0) return;
    t.value = 0;
    t.value = withTiming(1, { duration: DURATION[mode], easing: Easing.out(Easing.quad) });
  }, [trigger, mode, reduce, t]);

  if (reduce || trigger <= 0) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => <Piece key={`${trigger}-${i}`} p={p} t={t} mode={mode} origin={origin} height={height} />)}
    </Canvas>
  );
}
