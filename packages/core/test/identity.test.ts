import { expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE, TUTOR_NAME } from '../src';

it('names the product and tutor', () => {
  expect(APP_NAME).toBe('BonaMind');
  expect(APP_TAGLINE).toBe('Your AI Learning System');
  expect(TUTOR_NAME).toBe('Prof. Linnea');
});
