import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { getOutbox } from '../../data/app';
import { signOut } from '../../data/auth';
import { useSettings } from '../../design/settings';
import { YouScreen } from '../YouScreen';

jest.mock('../../data/auth', () => ({
  useAuth: () => ({ userId: 'u1', status: 'signed-in', session: { user: { email: 'sam@example.com' } } }),
  signOut: jest.fn(async () => {}),
}));
jest.mock('../../data/hooks', () => ({ useDisplayName: () => ({ data: 'Sam Rivera' }), useSessions: () => ({ data: [] }) }));
jest.mock('../../data/sync', () => ({ useSync: () => ({ online: true, pending: 0, flushNow: jest.fn(async () => {}) }) }));
jest.mock('../../data/app', () => ({ getOutbox: jest.fn() }));
jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://bonamind.app' } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

const pending = (n: number) => (getOutbox as jest.Mock).mockReturnValue({ pending: jest.fn(async () => n) });

beforeEach(() => { jest.clearAllMocks(); useSettings.setState({ hapticsEnabled: true }); });

it('shows who is signed in', async () => {
  pending(0);
  await render(<YouScreen />);
  expect(screen.getByText('Sam Rivera')).toBeTruthy();
});

it('toggles haptics', async () => {
  pending(0);
  await render(<YouScreen />);
  await fireEvent(screen.getByRole('switch', { name: 'Haptics' }), 'valueChange', false);
  expect(useSettings.getState().hapticsEnabled).toBe(false);
});

it('warns before signing out with reviews still queued', async () => {
  pending(2);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<YouScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(alert.mock.calls[0][1]).toBe("You have 2 reviews waiting to sync. They'll upload next time you sign in to this account.");
  expect(signOut).not.toHaveBeenCalled();
});

it('signs straight out when everything has synced', async () => {
  pending(0);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<YouScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(signOut).toHaveBeenCalled());
  expect(alert).not.toHaveBeenCalled();
});
