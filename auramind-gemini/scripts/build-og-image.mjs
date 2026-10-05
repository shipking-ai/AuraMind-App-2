/**
 * Rasterises the Open Graph SVG to the PNG that link previews actually load.
 *
 * og:image / twitter:image point at og-image.png. Crawlers — X/Twitter above
 * all — will not render an SVG for a card, so renaming the SVG alone changes
 * nothing a person sees when a link is shared. The PNG is a committed binary
 * with no generator script in the repo, which is exactly how it kept saying the
 * old name after the rename.
 *
 * Rendering it here means the next rename does not have to remember this step,
 * and the check below fails loudly if the wordmark ever drifts from the SVG
 * again.
 *
 * sharp bundles librsvg, so this needs no system tooling.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200;
const H = 630;

const svgPath = path.join(ROOT, 'public/favicons,logos/og-image.svg');
const pngPath = path.join(ROOT, 'public/favicons,logos/og-image.png');

/**
 * Read APP_NAME out of app-identity.ts with a regex rather than importing it.
 *
 * The file is TypeScript and this is a plain Node script; a dynamic import only
 * works on Node versions with type-stripping enabled, and silently yields
 * `undefined` elsewhere — which would quietly skip the guard below and leave
 * the share card free to drift again. That is the exact failure this script
 * exists to prevent.
 */
function readAppName() {
  const src = readFileSync(path.join(ROOT, 'app-identity.ts'), 'utf8');
  const m = src.match(/export const APP_NAME\s*(?::[^=]+)?=\s*'([^']+)'/);
  if (!m) throw new Error('build-og-image: could not read APP_NAME from app-identity.ts');
  return m[1];
}

const APP_NAME = readAppName();

const svg = readFileSync(svgPath, 'utf8');
const name = (svg.match(/<text[^>]*>([^<]+)<\/text>/) || [])[1];
if (!name) {
  console.error(`[og] no <text> wordmark found in ${svgPath}`);
  process.exit(1);
}

if (!name.includes(APP_NAME)) {
  console.error(`[og] SVG wordmark "${name}" does not contain APP_NAME "${APP_NAME}".`);
  console.error('[og] Fix the <text> in og-image.svg, then re-run this script.');
  process.exit(1);
}

const buf = await sharp(Buffer.from(svg), { density: 384 })
  .resize(W, H, { fit: 'fill' })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(pngPath, buf);

console.log(`[og] og-image.svg -> og-image.png  ${W}x${H}  ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`[og] wordmark "${name}" matches APP_NAME`);
