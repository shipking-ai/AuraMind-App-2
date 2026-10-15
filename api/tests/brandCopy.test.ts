/**
 * Emails, push titles, the User-Agent and server logs say BonaMind and
 * Prof. Linnea. `auramind://` links (still accepted and, until the rename's // legacy-name: ok
 * third PR, still sent) and the `com.auramind.app` ID are lowercase and
 * aren't matched.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const API_ROOT = resolve(__dirname, '..');
const OLD = /AuraMind|AURAMIND|Prof(?:\. ?| )Aura\b|(?<![A-Za-z0-9_\-./])(Aura|AURA)(?![A-Za-z0-9_])/; // legacy-name: ok

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'tests' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

it('says BonaMind and Prof. Linnea in everything the API sends or prints', () => {
  const hits: string[] = [];
  for (const file of sources(API_ROOT)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (OLD.test(line)) hits.push(`${relative(API_ROOT, file).replace(/\\/g, '/')}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});
