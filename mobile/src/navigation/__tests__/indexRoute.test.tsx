import { render, screen } from '@testing-library/react-native';
import Index from '../../app/index';

let mockStatus = 'signed-out';
jest.mock('../../data/auth', () => ({ useAuth: () => ({ status: mockStatus, userId: null }) }));
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> };
});

// A redirect into a Stack.Protected screen the guard refuses is dropped, which
// left a signed-out launch on this blank route instead of the welcome screen.
it('sends a signed-out launch to the welcome screen', async () => {
  mockStatus = 'signed-out';
  await render(<Index />);
  expect(screen.getByText('redirect:/welcome')).toBeTruthy();
});

it('sends a signed-in launch to Today', async () => {
  mockStatus = 'signed-in';
  await render(<Index />);
  expect(screen.getByText('redirect:/today')).toBeTruthy();
});
