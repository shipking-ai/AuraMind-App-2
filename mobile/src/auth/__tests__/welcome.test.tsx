import { fireEvent, render, screen } from '@testing-library/react-native';
import { signInWithPassword } from '../../data/auth';
import { env } from '../../env';
import { WelcomeScreen } from '../WelcomeScreen';

jest.mock('../../env', () => ({ env: { appleSignIn: false, turnstileSiteKey: 'k', apiBaseUrl: 'https://bonamind.app' } }));
jest.mock('../../data/auth', () => ({
  signInWithPassword: jest.fn(async () => ({ error: undefined })),
  sendEmailCode: jest.fn(async () => ({ error: undefined })),
  verifyEmailCode: jest.fn(async () => ({ error: undefined })),
}));
jest.mock('../oauth', () => ({ signInWithGoogle: jest.fn() }));
jest.mock('../apple', () => ({ signInWithApple: jest.fn() }));
let mockGateMounts = 0;
jest.mock('../TurnstileGate', () => {
  const { useEffect } = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    TurnstileGate: ({ onToken, onExpire, onError }: { onToken(t: string): void; onExpire(): void; onError(): void }) => {
      useEffect(() => { mockGateMounts += 1; }, []);
      return (
        <>
          <Pressable onPress={() => onToken('tok')}><Text>captcha ok</Text></Pressable>
          <Pressable onPress={onExpire}><Text>captcha expire</Text></Pressable>
          <Pressable onPress={onError}><Text>captcha fail</Text></Pressable>
        </>
      );
    },
  };
});
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
const passwordSignIn = signInWithPassword as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); mockGateMounts = 0; });

async function openEmail() {
  await render(<WelcomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'hunter22');
}

it('greets with the brand and offers Google but not Apple when Apple is off', async () => {
  await render(<WelcomeScreen />);
  expect(screen.getByText('BonaMind')).toBeTruthy();
  expect(screen.getByText('Your AI Learning System')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  expect(env.appleSignIn).toBe(false);
});

it('will not sign in before the human check passes', async () => {
  await openEmail();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(passwordSignIn).not.toHaveBeenCalled();
  expect(screen.getByText('Complete the check above first.')).toBeTruthy();
});

it('explains a wrong password and keeps the email', async () => {
  passwordSignIn.mockResolvedValueOnce({ error: 'invalid_credentials' });
  await openEmail();
  await fireEvent.press(screen.getByText('captcha ok'));
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText("That email and password don't match. Try again or use a code.")).toBeTruthy();
  expect(passwordSignIn).toHaveBeenCalledWith('sam@example.com', 'hunter22', 'tok');
  expect(screen.getByLabelText('Email').props.value).toBe('sam@example.com');
});

it('explains a failed human check but leaves the widget to retry itself', async () => {
  await openEmail();
  await fireEvent.press(screen.getByText('captcha fail'));
  expect(screen.getByText("We couldn't verify you're human. Try again.")).toBeTruthy();
  // Rebuilding the web view on every widget error fought Turnstile's own retry
  // and made the check flash and restart.
  expect(mockGateMounts).toBe(1);
  await fireEvent.press(screen.getByText('captcha ok'));
  expect(screen.queryByText("We couldn't verify you're human. Try again.")).toBeNull();
});

it('drops an expired token without an error and without a rebuild', async () => {
  await openEmail();
  await fireEvent.press(screen.getByText('captcha ok'));
  await fireEvent.press(screen.getByText('captcha expire'));
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(passwordSignIn).not.toHaveBeenCalled();
  expect(screen.getByText('Complete the check above first.')).toBeTruthy();
  expect(mockGateMounts).toBe(1);
});

it('re-arms the check after a sign-in attempt spends the token', async () => {
  passwordSignIn.mockResolvedValueOnce({ error: 'invalid_credentials' });
  await openEmail();
  await fireEvent.press(screen.getByText('captcha ok'));
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText("That email and password don't match. Try again or use a code.");
  expect(mockGateMounts).toBe(2);
});

it('says so when Google sign-in fails instead of doing nothing', async () => {
  const { signInWithGoogle } = jest.requireMock('../oauth');
  signInWithGoogle.mockResolvedValueOnce({ error: 'no_code' });
  await render(<WelcomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(await screen.findByText('Something went wrong. Try again in a moment.')).toBeTruthy();
});

it('shows and hides the password on request', async () => {
  await openEmail();
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
});
