/**
 * scripts/generate-ios-assets.mjs
 *
 * Renders the AuraMind brand mark (public/favicons,logos/favicon.svg) into the
 * iOS app icon and launch splash, matching generate-android-assets.mjs.
 *
 *   node scripts/generate-ios-assets.mjs
 *
 * Outputs (names match the Contents.json files `cap add ios` generated):
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 *       1024×1024, full-bleed and opaque — App Store Connect rejects an app
 *       icon with an alpha channel, and iOS applies its own rounded mask.
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png
 *       logo centred on the app background.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ASSETS = resolve(ROOT, 'ios', 'App', 'App', 'Assets.xcassets');
const SVG = readFileSync(resolve(ROOT, 'public', 'favicons,logos', 'favicon.svg'), 'utf8');

const SPLASH_BG = '#0a0a0a';
const SPLASH_SIZE = 2732;
const SPLASH_LOGO_FRACTION = 0.22;

// Same full-bleed transform the Android store icon uses: drop the rounded
// tile inset so the platform mask is applied exactly once.
const squareSvg = SVG
  .replace(/x="20" y="20" width="472" height="472" rx="136"/g, 'x="0" y="0" width="512" height="512" rx="0"')
  .replace(/x="21" y="21" width="470" height="470" rx="135"/, 'x="0" y="0" width="512" height="512" rx="0"');

function write(buffer, file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
  console.log(`✓ ${file}`);
}

const icon = await sharp(Buffer.from(squareSvg), { density: 300 })
  .resize(1024, 1024)
  .flatten({ background: SPLASH_BG })
  .removeAlpha()
  .png()
  .toBuffer();
write(icon, resolve(ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'));

const logoSize = Math.round(SPLASH_SIZE * SPLASH_LOGO_FRACTION);
const logo = await sharp(Buffer.from(SVG), { density: 300 }).resize(logoSize, logoSize).png().toBuffer();
const splash = await sharp({
  create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 3, background: SPLASH_BG },
})
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toBuffer();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  write(splash, resolve(ASSETS, 'Splash.imageset', name));
}
