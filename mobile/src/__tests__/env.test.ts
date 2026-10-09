import { readFileSync } from 'fs';
import { join } from 'path';

it('reads env only through static property access', () => {
  const src = readFileSync(join(__dirname, '../env.ts'), 'utf8');
  expect(src).not.toMatch(/process\.env\[/);
  expect(src).not.toMatch(/SERVICE_ROLE|SECRET|GROQ|STRIPE_SECRET|RESEND/);
});

it('defaults the API to the production site', () => {
  jest.isolateModules(() => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(require('../env').env.apiBaseUrl).toBe('https://bonamind.app');
  });
});
