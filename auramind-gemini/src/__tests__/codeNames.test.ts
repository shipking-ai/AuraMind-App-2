/**
 * Web code names follow the rename: ProfAura* → ProfLinnea*, the Capacitor // legacy-name: ok
 * plugins Aura* → Bona*, the AuraMind store/hooks → BonaMind, and the // legacy-name: ok
 * `auramind/` folders → `bonamind/`. // legacy-name: ok
 *
 * Not matched on purpose: the aura glow effect (auraDepth, AURA_DEPTH_LAYERS,
 * AndroidAura, VoiceAura, AuraEasingName), the "Aura Sans"/"Aura Script"
 * typefaces, the Java package path com/auramind/app and src/lib/legacyNames.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '../..');
const OLD_NAME =
  /\b(ProfAura\w*|profAura\w*|PROF_AURA\w*|AuraMind[A-Z]\w*|useAuraMind|AuraChatMode|AURA_CHAT_MODE_KEY|AuraSpeech\w*|auraSpeech\w*|AuraListen\w*|AuraLiveActivity\w*|AuraLiveUpdate\w*|AuraDevice\w*|auraDevice\w*|AuraAi\w*|auraAi\w*|AuraLandingPage|AuraMark)\b|(?<!com)\/auramind\//; // legacy-name: ok
// androidIdentity.test.ts pins the permanent stand-in class names and Wear paths.
const SKIP = new Set(['src/lib/legacyNames.ts', 'src/__tests__/codeNames.test.ts', 'src/__tests__/androidIdentity.test.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

it('uses BonaMind and Prof. Linnea code names throughout the web source', () => {
  const hits: string[] = [];
  for (const file of walk(join(APP_ROOT, 'src'))) {
    const rel = relative(APP_ROOT, file).replace(/\\/g, '/');
    if (SKIP.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (OLD_NAME.test(line)) hits.push(`${rel}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});
