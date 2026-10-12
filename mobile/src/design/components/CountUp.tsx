import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useMotion } from '../motion';

/** Counts from 0 to `to` with an ease-out; shows `to` at once under Reduce Motion. */
export function CountUp({ to, durationMs = 900, style }: { to: number; durationMs?: number; style?: StyleProp<TextStyle> }) {
  const { reduce } = useMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduce) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / durationMs);
      setShown(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, durationMs, reduce]);
  return <Text style={style} accessibilityLabel={String(to)}>{reduce ? to : shown}</Text>;
}
