import * as Haptics from 'expo-haptics';
import { haptic } from '../haptics';
import { useSettings } from '../settings';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('stays silent when haptics are off', () => {
  useSettings.getState().setHapticsEnabled(false);
  haptic('success');
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});

it('maps each kind to the Taptic Engine', () => {
  useSettings.getState().setHapticsEnabled(true);
  haptic('success');
  haptic('warning');
  haptic('light');
  haptic('selection');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(Haptics.selectionAsync).toHaveBeenCalled();
});
