import { Linking } from 'react-native';
import { allowTurnstileNavigation } from '../TurnstileGate';

jest.mock('react-native-webview', () => 'WebView');
jest.mock('../../env', () => ({ env: { turnstileSiteKey: 'k' } }));

// jest-expo already mocks Linking.openURL; clear its calls between tests.
beforeEach(() => jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(true));

// Turnstile runs its challenge in about:srcdoc and about:blank frames. The
// old https-only origin whitelist refused about:srcdoc, so the widget showed
// "Unable to connect to website" and never issued a token.
it('lets the challenge load its own frames', () => {
  expect(allowTurnstileNavigation({ url: 'about:srcdoc', isTopFrame: false })).toBe(true);
  expect(allowTurnstileNavigation({ url: 'about:blank', isTopFrame: false })).toBe(true);
  expect(allowTurnstileNavigation({ url: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x', isTopFrame: false })).toBe(true);
});

it('loads the widget page itself', () => {
  expect(allowTurnstileNavigation({ url: 'https://bonamind.app/', isTopFrame: true })).toBe(true);
  expect(allowTurnstileNavigation({ url: 'about:blank', isTopFrame: true })).toBe(true);
});

it('opens links the widget offers (Privacy, Help) in the browser, not in the tiny web view', () => {
  expect(allowTurnstileNavigation({ url: 'https://www.cloudflare.com/privacypolicy/', isTopFrame: true })).toBe(false);
  expect(Linking.openURL).toHaveBeenCalledWith('https://www.cloudflare.com/privacypolicy/');
});

it('never follows a non-https top-level link', () => {
  expect(allowTurnstileNavigation({ url: 'javascript:alert(1)', isTopFrame: true })).toBe(false);
  expect(Linking.openURL).not.toHaveBeenCalled();
});
