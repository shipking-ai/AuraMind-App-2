import { render, screen } from '@testing-library/react-native';
import { withRepeat } from 'react-native-reanimated';
import { useMotion } from '../../motion';
import { AuroraBackground } from '../AuroraBackground';
import { Confetti } from '../Confetti';

jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const node = (id: string) => () => <View testID={id} />;
  return {
    Canvas: ({ children }: any) => <View testID="skia-canvas">{children}</View>,
    Group: ({ children }: any) => <View>{children}</View>,
    Circle: node('Circle'), Rect: node('Rect'), Blur: node('Blur'),
  };
});
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, withRepeat: jest.fn(actual.withRepeat) };
});
jest.mock('../../motion', () => ({ useMotion: jest.fn() }));
const motion = useMotion as jest.Mock;
const count = (id: string) => screen.queryAllByTestId(id).length;

beforeEach(() => { jest.clearAllMocks(); motion.mockReturnValue({ reduce: false, spring: () => ({}) }); });

it('drifts the three glows on the UI thread', async () => {
  await render(<AuroraBackground />);
  expect(withRepeat).toHaveBeenCalledTimes(3);
  expect(count('Circle')).toBe(4);
});

it('holds the aurora still under Reduce Motion', async () => {
  motion.mockReturnValue({ reduce: true, spring: () => ({ duration: 180 }) });
  await render(<AuroraBackground />);
  expect(withRepeat).not.toHaveBeenCalled();
  expect(count('Circle')).toBe(3);
});

it('bursts 40 particles and rains 80', async () => {
  const { rerender } = await render(<Confetti trigger={1} origin={{ x: 100, y: 200 }} mode="burst" />);
  expect(count('Rect')).toBe(40);
  await rerender(<Confetti trigger={2} origin={{ x: 100, y: 200 }} mode="rain" />);
  expect(count('Rect')).toBe(80);
});

it('renders no confetti under Reduce Motion', async () => {
  motion.mockReturnValue({ reduce: true, spring: () => ({ duration: 180 }) });
  await render(<Confetti trigger={1} origin={{ x: 0, y: 0 }} mode="burst" />);
  expect(count('Rect')).toBe(0);
});

it('renders nothing before the first trigger', async () => {
  await render(<Confetti trigger={0} origin={{ x: 0, y: 0 }} mode="burst" />);
  expect(count('Rect')).toBe(0);
});
