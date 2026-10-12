import { act, render, screen } from '@testing-library/react-native';
import { useMotion } from '../../motion';
import { LOADING_LINES, LoadingScreen } from '../LoadingScreen';

jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const node = (id: string) => function SkiaNode({ children }: any) { return <View testID={id}>{children}</View>; };
  return {
    Canvas: ({ children }: any) => <View testID="skia-canvas">{children}</View>,
    Group: ({ children }: any) => <View>{children}</View>,
    Circle: node('Circle'), Path: node('Path'), BlurMask: node('BlurMask'),
    LinearGradient: node('LinearGradient'), RadialGradient: node('RadialGradient'),
    Skia: { Path: { MakeFromSVGString: (d: string) => ({ d }) } },
    vec: (x: number, y: number) => ({ x, y }),
  };
});
jest.mock('../../motion', () => ({ useMotion: jest.fn() }));
const motion = useMotion as jest.Mock;
const count = (id: string) => screen.queryAllByTestId(id).length;

beforeEach(() => { jest.useFakeTimers(); motion.mockReturnValue({ reduce: false, spring: () => ({}) }); });
afterEach(() => jest.useRealTimers());

it('names what is loading and reads as a progress indicator', async () => {
  await render(<LoadingScreen title="Getting Biology ready" />);
  expect(screen.getByRole('progressbar', { name: 'Getting Biology ready' })).toBeTruthy();
  expect(screen.getByText('Getting Biology ready')).toBeTruthy();
  expect(screen.getByText(LOADING_LINES[0])).toBeTruthy();
});

it('draws the prism with its comets and orbiting sparks', async () => {
  await render(<LoadingScreen title="Loading" />);
  expect(count('Path')).toBe(4); // outline + inner, plus a comet on each
  expect(count('Circle')).toBe(5); // halo, 3 sparks, core
});

it('changes its line every two seconds', async () => {
  await render(<LoadingScreen title="Loading" />);
  await act(async () => { jest.advanceTimersByTime(2_000); });
  expect(screen.getByText(LOADING_LINES[1])).toBeTruthy();
});

it('holds still under Reduce Motion: no comets, no sparks, one line', async () => {
  motion.mockReturnValue({ reduce: true, spring: () => ({}) });
  await render(<LoadingScreen title="Loading" />);
  expect(count('Path')).toBe(2);
  expect(count('Circle')).toBe(2);
  await act(async () => { jest.advanceTimersByTime(6_000); });
  expect(screen.getByText(LOADING_LINES[0])).toBeTruthy();
});
