/**
 * scripts/generate-android-assets.mjs
 *
 * Renders the BonaMind brand mark (public/favicons,logos/favicon.svg) into
 * every Android launcher/splash size and the Google Play store icon.
 *
 *   node scripts/generate-android-assets.mjs
 *
 * Outputs:
 *   android/app/src/main/res/mipmap-*  ic_launcher.png (legacy launcher icon)
 *   android/app/src/main/res/mipmap-*  ic_launcher_round.png (legacy round)
 *   android/app/src/main/res/mipmap-*  ic_launcher_foreground.png (adaptive)
 *   android/app/src/main/res/mipmap-*  ic_launcher_monochrome.png (themed)
 *   android/app/src/main/res/drawable* splash.png (launch splash)
 *   public/favicons,logos/icon-*.png (PWA icons)
 *   ../store/graphics/android/icon-512.png (Play Store icon, no alpha)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ANDROID_RES = resolve(ROOT, 'android', 'app', 'src', 'main', 'res');
const PUBLIC_BRAND_DIR = resolve(ROOT, 'public', 'favicons,logos');
const STORE_DIR = resolve(ROOT, '..', 'store', 'graphics', 'android');

const SVG = readFileSync(resolve(PUBLIC_BRAND_DIR, 'favicon.svg'), 'utf8');
const FOREGROUND_SVG = readFileSync(resolve(PUBLIC_BRAND_DIR, 'prof-aura-foreground.svg'), 'utf8');
const MONOCHROME_SVG = readFileSync(resolve(PUBLIC_BRAND_DIR, 'prof-aura-monochrome.svg'), 'utf8');

const BG_COLOR = '#211349';          // adaptive icon background (matches the selected Prism Aperture tile)
const SPLASH_BG = '#0a0a0a';         // app background (PWA theme_color)
const SPLASH_LOGO_FRACTION = 0.42;   // logo width relative to min(splash dim)

// Android's adaptive icon foreground is a 108dp canvas with a 66dp safe zone.
// The source foreground SVG already owns that canvas, so it is not inset twice.

const mipmapDensities = [
  { dir: 'mipmap-mdpi', size: 48, fg: 108 },
  { dir: 'mipmap-hdpi', size: 72, fg: 162 },
  { dir: 'mipmap-xhdpi', size: 96, fg: 216 },
  { dir: 'mipmap-xxhdpi', size: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', size: 192, fg: 432 },
];

async function writePng(buffer, file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
  console.log(`✓ ${file}`);
}

async function writeIco(images, file) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(images.length * 16);
  let offset = header.length + entries.length;
  images.forEach(({ size, buffer }, index) => {
    const entryOffset = index * 16;
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset);
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    entries.writeUInt8(0, entryOffset + 2);
    entries.writeUInt8(0, entryOffset + 3);
    entries.writeUInt16LE(1, entryOffset + 4);
    entries.writeUInt16LE(32, entryOffset + 6);
    entries.writeUInt32LE(buffer.length, entryOffset + 8);
    entries.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  });

  await writePng(Buffer.concat([header, entries, ...images.map(({ buffer }) => buffer)]), file);
}

async function generate() {
  // Browser favicons can keep a subtle rounded tile, while launcher and
  // Play Store artwork must be full-bleed so the platform can apply its own
  // mask and shadow exactly once.
  const squareSvg = SVG
    .replace(/x="20" y="20" width="472" height="472" rx="136"/g, 'x="0" y="0" width="512" height="512" rx="0"')
    .replace(/x="21" y="21" width="470" height="470" rx="135"/, 'x="0" y="0" width="512" height="512" rx="0"');

  // ── Browser/PWA fallbacks ────────────────────────────────────────
  // The SVG is the primary favicon; these PNGs keep older browsers,
  // install prompts, and PWA manifests on the same Prof. Aura artwork.
  const webIcons = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['favicon-180.png', 180],
    ['apple-touch-icon.png', 180],
    ['favicon-512.png', 512],
    ['icon-192.png', 192],
    ['icon-384.png', 384],
    ['icon-512.png', 512],
  ];
  for (const [name, size] of webIcons) {
    const source = name.startsWith('icon-') ? squareSvg : SVG;
    const png = await sharp(Buffer.from(source), { density: 96 })
      .resize(size, size)
      .png()
      .toBuffer();
    await writePng(png, resolve(PUBLIC_BRAND_DIR, name));
  }
  const icoImages = await Promise.all(
    [16, 32].map(async (size) => ({
      size,
      buffer: await sharp(Buffer.from(SVG), { density: 96 })
        .resize(size, size)
        .png()
        .toBuffer(),
    })),
  );
  await writeIco(icoImages, resolve(PUBLIC_BRAND_DIR, 'favicon.ico'));

  // ── Legacy launcher icons (full-bleed brand tile) ────────────────
  for (const { dir, size } of mipmapDensities) {
    const png = await sharp(Buffer.from(squareSvg), { density: 96 })
      .resize(size, size)
      .png()
      .toBuffer();
    await writePng(png, resolve(ANDROID_RES, dir, 'ic_launcher.png'));
    await writePng(png, resolve(ANDROID_RES, dir, 'ic_launcher_round.png'));
  }

  // ── Adaptive foreground + Android 13 themed layer ────────────────
  for (const { dir, fg } of mipmapDensities) {
    const foreground = await sharp(Buffer.from(FOREGROUND_SVG), { density: 96 })
      .resize(fg, fg)
      .png()
      .toBuffer();
    await writePng(foreground, resolve(ANDROID_RES, dir, 'ic_launcher_foreground.png'));

    const monochrome = await sharp(Buffer.from(MONOCHROME_SVG), { density: 96 })
      .resize(fg, fg)
      .png()
      .toBuffer();
    await writePng(monochrome, resolve(ANDROID_RES, dir, 'ic_launcher_monochrome.png'));
  }

  // ── Adaptive icon background color resource ──────────────────────
  const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`;
  writeFileSync(resolve(ANDROID_RES, 'values', 'ic_launcher_background.xml'), colorXml);
  console.log('✓ values/ic_launcher_background.xml');

  // ── Splash images (dark bg + centered logo, all densities) ───────
  const splashGlobs = [
    'drawable/splash.png',
    'drawable-port-mdpi/splash.png',
    'drawable-port-hdpi/splash.png',
    'drawable-port-xhdpi/splash.png',
    'drawable-port-xxhdpi/splash.png',
    'drawable-port-xxxhdpi/splash.png',
    'drawable-land-mdpi/splash.png',
    'drawable-land-hdpi/splash.png',
    'drawable-land-xhdpi/splash.png',
    'drawable-land-xxhdpi/splash.png',
    'drawable-land-xxxhdpi/splash.png',
  ];
  for (const rel of splashGlobs) {
    const target = resolve(ANDROID_RES, rel);
    let meta;
    try {
      meta = await sharp(target).metadata();
    } catch {
      console.warn(`skip ${rel} (missing)`);
      continue;
    }
    const w = meta.width;
    const h = meta.height;
    const logoSize = Math.round(Math.min(w, h) * SPLASH_LOGO_FRACTION);
    const logo = await sharp(Buffer.from(SVG), { density: 96 })
      .resize(logoSize, logoSize)
      .png()
      .toBuffer();
    const splash = await sharp({
      create: { width: w, height: h, channels: 3, background: SPLASH_BG },
    })
      .composite([{ input: logo, gravity: 'centre' }])
      .png()
      .toBuffer();
    await writePng(splash, target);
  }

  // ── Play Store icon: full square (no transparency) 512×512 ───────
  const storeIcon = await sharp(Buffer.from(squareSvg), { density: 96 })
    .resize(512, 512)
    .png()
    .toBuffer();
  await writePng(storeIcon, resolve(STORE_DIR, 'icon-512.png'));

  // ── Play Store feature graphic: 1024×500 ─────────────────────────
  const brand = SVG
    .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" x="64" y="110" width="280" height="280"')
    .replace(/^<\?xml[^>]*\?>\s*/, '');
  const featureSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="fg-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1A1030"/>
      <stop offset="100%" stop-color="#0E0820"/>
    </linearGradient>
    <radialGradient id="fg-glow" cx="30%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#7C3AED" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#EC4899" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="500" fill="url(#fg-bg)"/>
  <circle cx="360" cy="250" r="420" fill="url(#fg-glow)"/>
  <rect x="0" y="0" width="1024" height="6" fill="#7C3AED"/>
  <text x="420" y="248" font-family="Segoe UI, Arial, sans-serif" font-size="78" font-weight="600" fill="#F0EFFE">BonaMind</text>
  <text x="422" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#9090A8">AI flashcards with FSRS spaced repetition</text>
  <text x="422" y="342" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#9090A8">Study smarter, remember longer.</text>
  ${brand}
</svg>`;
  const feature = await sharp(Buffer.from(featureSvg), { density: 96 })
    .resize(1024, 500)
    .png()
    .toBuffer();
  await writePng(feature, resolve(STORE_DIR, 'feature-1024x500.png'));

  console.log('\nAndroid launcher/splash assets + store assets generated.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
