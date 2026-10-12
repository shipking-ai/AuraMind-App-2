import { render, screen } from '@testing-library/react-native';
import { useMotion } from '../../motion';
import { CountUp } from '../CountUp';
import { GlassButton } from '../GlassButton';
import { OfflinePill } from '../OfflinePill';
import { ProgressBar } from '../ProgressBar';

jest.mock('../../motion', () => ({ useMotion: jest.fn(), REDUCED_TIMING: { duration: 180 } }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const motion = useMotion as jest.Mock;

beforeEach(() => motion.mockReturnValue({ reduce: false, spring: () => ({ damping: 16, stiffness: 180 }) }));

it('CountUp shows the final value at once when motion is reduced', async () => {
  motion.mockReturnValue({ reduce: true, spring: () => ({ duration: 180 }) });
  await render(<CountUp to={12} />);
  expect(screen.getByText('12')).toBeTruthy();
});

it('ProgressBar clamps to 100%', async () => {
  await render(<ProgressBar value={1.4} color="#A78BFA" />);
  expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
});

it('GlassButton is a labelled button', async () => {
  await render(<GlassButton symbol={{ ios: 'sparkles', android: 'auto_awesome' }} label="Ask Prof. Linnea" onPress={() => {}} />);
  expect(screen.getByRole('button', { name: 'Ask Prof. Linnea' })).toBeTruthy();
});

it('OfflinePill shows only while offline', async () => {
  const { rerender } = await render(<OfflinePill visible />);
  expect(screen.getByText('Offline · reviews will sync')).toBeTruthy();
  await rerender(<OfflinePill visible={false} />);
  expect(screen.queryByText('Offline · reviews will sync')).toBeNull();
});
