import { renderHook } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { springs } from '../tokens';
import { useMotion } from '../motion';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: jest.fn() }));
const reduced = useReducedMotion as jest.Mock;

it('swaps every spring for a short crossfade when Reduce Motion is on', async () => {
  reduced.mockReturnValue(true);
  const { result } = await renderHook(() => useMotion());
  expect(result.current.reduce).toBe(true);
  expect(result.current.spring('flip')).toEqual({ duration: 180 });
});

it('uses the named spring otherwise', async () => {
  reduced.mockReturnValue(false);
  const { result } = await renderHook(() => useMotion());
  expect(result.current.spring('flip')).toBe(springs.flip);
});
