import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '../../..');

const SKIP_DIRS = new Set(['node_modules', '.expo', 'ios', 'android', 'dist', 'build', '__golden__']);
const SKIP_FILE = /\.(ttf|otf|woff2?|png|jpe?g|gif|webp|mp4|lottie)$|^OFL-.*\.txt$/;

function walk(path: string, out: string[]): void {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    out.push(path);
    return;
  }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(join(path, name), out);
  }
}

/** Every text file under the given repo-relative roots, as repo-relative posix paths. */
export function listFiles(roots: string[]): string[] {
  const out: string[] = [];
  for (const r of roots) walk(join(REPO_ROOT, r), out);
  return out
    .filter((f) => !SKIP_FILE.test(f.split(sep).pop() ?? ''))
    .map((f) => relative(REPO_ROOT, f).split(sep).join('/'));
}

export interface Hit { file: string; line: number; match: string; text: string }

export function scan(files: string[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  for (const file of files) {
    readFileSync(join(REPO_ROOT, file), 'utf8').split('\n').forEach((text, i) => {
      for (const m of text.matchAll(re)) hits.push({ file, line: i + 1, match: m[0], text });
    });
  }
  return hits;
}
