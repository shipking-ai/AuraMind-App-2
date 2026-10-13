import { fireEvent, render, screen } from '@testing-library/react-native';
import { SegmentedControl } from '../SegmentedControl';

jest.mock('../../motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('../../haptics', () => ({ haptic: jest.fn() }));

const OPTIONS = [{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }, { value: 'deep', label: 'Deep' }] as const;

// The track carries accessibilityRole="tablist" without being one accessible
// element (that would merge the tabs for VoiceOver), so tests query the tabs.
it('marks the current option selected among its tabs', async () => {
  await render(<SegmentedControl options={[...OPTIONS]} value="standard" onChange={() => {}} />);
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  expect(screen.getByRole('tab', { name: 'Standard' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('tab', { name: 'Deep' }).props.accessibilityState).toMatchObject({ selected: false });
});

it('reports the option tapped', async () => {
  const onChange = jest.fn();
  await render(<SegmentedControl options={[...OPTIONS]} value="standard" onChange={onChange} />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Deep' }));
  expect(onChange).toHaveBeenCalledWith('deep');
});
