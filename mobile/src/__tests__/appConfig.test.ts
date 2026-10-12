import { APP_NAME as CORE_APP_NAME } from '@bonamind/core';
import config, { APP_NAME } from '../../app.config';

it('uses the BonaMind identity and the permanent store ids', () => {
  expect(APP_NAME).toBe(CORE_APP_NAME);
  expect(config.name).toBe('BonaMind');
  expect(config.scheme).toBe('bonamind');
  expect(config.ios?.bundleIdentifier).toBe('com.bonamind.app');
  expect(config.android?.package).toBe('com.auramind.app');
  expect(config.userInterfaceStyle).toBe('dark');
});

it('only adds the Apple sign-in entitlement when enabled', () => {
  expect(config.ios?.usesAppleSignIn).toBe(false);
  expect(JSON.stringify(config.plugins)).not.toContain('expo-apple-authentication');
});
