import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AUDIO_EXTS, DOC_EXTS, courseFileKind, extensionOf, fileFromHandoff, unsupportedMessage,
} from '../lib/courseFiles';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');
const rustList = (src: string, name: string) =>
  [...(src.match(new RegExp(`${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);

describe('course files', () => {
  it('classifies by the real last extension, case-insensitively', () => {
    expect(courseFileKind('Notes.PDF')).toBe('document');
    expect(courseFileKind('lecture.m4a')).toBe('audio');
    expect(courseFileKind('evil.pdf.exe')).toBeNull();
    expect(courseFileKind('no-extension')).toBeNull();
    expect(extensionOf('a.b.DocX')).toBe('docx');
  });

  it('matches the Rust handoff lists', () => {
    const rs = read('src-tauri/src/handoff.rs');
    expect(rustList(rs, 'DOC_EXTS')).toEqual([...DOC_EXTS]);
    expect(rustList(rs, 'AUDIO_EXTS')).toEqual([...AUDIO_EXTS]);
  });

  it('matches the Explorer verbs the installer registers', () => {
    const nsh = read('src-tauri/windows/installer-hooks.nsh');
    const install = nsh.slice(nsh.indexOf('NSIS_HOOK_POSTINSTALL'), nsh.indexOf('NSIS_HOOK_POSTUNINSTALL'));
    const verbs = [...install.matchAll(/AuraMindVerb "(\w+)"/g)].map((m) => m[1]).sort();
    expect(verbs).toEqual([...DOC_EXTS, ...AUDIO_EXTS].sort());
  });

  it("matches the generator's own file inputs", () => {
    const page = read('src/pages/generator/GeneratorPage.tsx');
    expect(page).toContain(`accept="${DOC_EXTS.map((e) => `.${e}`).join(',')}"`);
    for (const ext of AUDIO_EXTS) expect(page).toContain(`.${ext}`);
  });

  it('rebuilds a File from the Rust handoff', async () => {
    const file = fileFromHandoff({ name: 'a.txt', mime: 'text/plain', base64: 'aGk=' });
    expect(file.name).toBe('a.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('hi');
  });

  it('names the rejected extension', () => {
    expect(unsupportedMessage('setup.exe')).toBe("AuraMind can't make a course from .exe files.");
    expect(unsupportedMessage('README')).toBe("AuraMind can't make a course from that file.");
  });
});
