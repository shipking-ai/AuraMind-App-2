import { expect, it } from 'vitest';
import { listFiles, scan } from './scan';

/**
 * Everything new is BonaMind. The only permitted legacy name is the Android
 * package id, which Google Play keys the existing listing to forever.
 */
const ROOTS = ['packages/core/src', 'packages/core/test', 'mobile/app', 'mobile/src', 'mobile/e2e', 'mobile/app.config.ts'];
const ALLOW: { file: string; line: RegExp }[] = [
  { file: 'mobile/app.config.ts', line: /['"]com.auramind.app['"]/ },
  { file: 'packages/core/test/brandNames.test.ts', line: /.*/ },
];

it('contains no legacy brand names', () => {
  const hits = scan(listFiles(ROOTS), /auramind|prof\.?\s*aura\b/i).filter(
    (h) => !ALLOW.some((a) => a.file === h.file && a.line.test(h.text)),
  );
  expect(hits).toEqual([]);
});
