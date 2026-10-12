import { render, screen } from '@testing-library/react-native';
import { getSupabase } from '../../data/supabase';
import { E2ESessionScreen } from '../E2ESessionScreen';

const mockRefreshSession = jest.fn(async () => ({ data: {}, error: null }));
jest.mock('../../data/supabase', () => ({ getSupabase: jest.fn(() => ({ auth: { refreshSession: mockRefreshSession } })) }));
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    useLocalSearchParams: () => ({ rt: 'refresh-token' }),
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    router: { replace: jest.fn() },
  };
});
jest.mock('../../env', () => ({ env: { e2e: false } }));

it('is inert outside end-to-end builds', async () => {
  await render(<E2ESessionScreen />);
  expect(screen.getByText('redirect:/')).toBeTruthy();
  expect(mockRefreshSession).not.toHaveBeenCalled();
  expect(getSupabase).not.toHaveBeenCalled();
});
