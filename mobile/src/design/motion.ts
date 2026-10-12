import { useReducedMotion } from 'react-native-reanimated';
import { springs, type SpringName } from './tokens';

/** Reduce Motion replaces every spring with this short crossfade. */
export const REDUCED_TIMING = { duration: 180 } as const;

export function useMotion() {
  const reduce = useReducedMotion();
  return {
    reduce,
    spring: (name: SpringName): (typeof springs)[SpringName] | typeof REDUCED_TIMING =>
      reduce ? REDUCED_TIMING : springs[name],
  };
}
