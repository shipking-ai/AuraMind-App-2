import { renderHook } from '@testing-library/react-native';
import { useCloseOnLeave } from '../useCloseOnLeave';

it('saves the studied part when the screen goes away by any route (back gesture included)', async () => {
  const session = { close: jest.fn(async () => {}) };
  const { unmount } = await renderHook(() => useCloseOnLeave(session));
  expect(session.close).not.toHaveBeenCalled();
  await unmount();
  expect(session.close).toHaveBeenCalledTimes(1);
});
