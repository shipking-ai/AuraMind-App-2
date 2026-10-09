import { expect, it } from 'vitest';
import { listFiles, scan } from './scan';

it('core source never touches browser or React Native globals', () => {
  const hits = scan(
    listFiles(['packages/core/src']),
    /\b(window|document|localStorage|sessionStorage|navigator)\b|import\.meta\.env|process\.env|from ['"]react(-native)?['"]/,
  );
  expect(hits).toEqual([]);
});
