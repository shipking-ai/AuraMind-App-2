import * as ImageManipulator from 'expo-image-manipulator';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { isYouTube, readLink, readPdf, readPhotos, readTopic } from '../sources';

jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://www.bonamind.app' } }));
jest.mock('../../data/supabase', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn(async () => 'UERGLQ==') }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async () => ({ base64: 'anBlZw==', uri: 'file://out.jpg', width: 1600, height: 1200 })),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const ok = (data: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const lastPath = () => String(fetchMock.mock.calls.at(-1)[0]).replace('https://www.bonamind.app', '');
const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

it('reads a topic, refusing a blank one', () => {
  expect(readTopic('  The French Revolution ')).toEqual({ kind: 'topic', topic: 'The French Revolution' });
  expect(() => readTopic('   ')).toThrow(expect.objectContaining({ kind: 'unreadable' }));
});

it('recognises YouTube links', () => {
  expect(isYouTube('https://youtu.be/abc')).toBe(true);
  expect(isYouTube('https://www.youtube.com/watch?v=abc')).toBe(true);
  expect(isYouTube('https://m.youtube.com/watch?v=abc')).toBe(true);
  expect(isYouTube('https://example.com/youtube.com')).toBe(false);
});

it('routes YouTube links to the transcript endpoint', async () => {
  ok({ text: 'transcript', title: 'A talk' });
  await readLink('https://youtu.be/abc');
  expect(lastPath()).toBe('/api/fetch-youtube-transcript');
  ok({ text: 'page', title: 'A page' });
  await readLink('https://example.com/a');
  expect(lastPath()).toBe('/api/fetch-url');
  expect(lastBody()).toEqual({ url: 'https://example.com/a' });
});

it('turns a link fetch into a text source titled by the page', async () => {
  ok({ text: 'Cells divide.', title: 'Mitosis' });
  await expect(readLink('https://example.com/mitosis')).resolves.toEqual({ kind: 'text', text: 'Cells divide.', title: 'Mitosis', label: 'example.com' });
  ok({ text: 'Cells divide.', title: 'Mitosis talk' });
  await expect(readLink('https://youtu.be/abc')).resolves.toMatchObject({ label: 'a YouTube video' });
});

it('requires an http(s) URL and readable text', async () => {
  await expect(readLink('notaurl')).rejects.toMatchObject({ kind: 'unreadable' });
  ok({ text: '', title: 'Empty' });
  await expect(readLink('https://example.com/empty')).rejects.toMatchObject({ kind: 'unreadable' });
});

it('refuses a PDF over 3 MB before uploading', async () => {
  await expect(readPdf({ name: 'a.pdf', size: 3 * 1024 * 1024 + 1, uri: 'file://a' })).rejects.toMatchObject({ kind: 'too_large' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('uploads a PDF as base64 and returns its text', async () => {
  ok({ text: 'Mitochondria make ATP.', title: 'Cells', pages: 2 });
  await expect(readPdf({ name: 'Cells.pdf', size: 1000, uri: 'file://cells.pdf' })).resolves.toEqual({ kind: 'text', text: 'Mitochondria make ATP.', title: 'Cells', label: 'your PDF' });
  expect(readAsStringAsync).toHaveBeenCalledWith('file://cells.pdf', { encoding: 'base64' });
  expect(lastPath()).toBe('/api/extract/document');
  expect(lastBody()).toEqual({ name: 'Cells.pdf', data: 'UERGLQ==' });
});

it('resizes photos to a 1600px JPEG', async () => {
  ok({ text: 'notes' });
  await readPhotos([{ uri: 'file://heic-1', width: 4032, height: 3024 }, { uri: 'file://heic-2', width: 3024, height: 4032 }]);
  expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(1, 'file://heic-1', [{ resize: { width: 1600 } }], { compress: 0.7, format: 'jpeg', base64: true });
  expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(2, 'file://heic-2', [{ resize: { height: 1600 } }], { compress: 0.7, format: 'jpeg', base64: true });
  expect(lastPath()).toBe('/api/extract/image');
  expect(lastBody()).toEqual({ images: ['anBlZw==', 'anBlZw=='] });
});

it('never upscales a small photo but still converts it to JPEG', async () => {
  ok({ text: 'notes' });
  await readPhotos([{ uri: 'file://small', width: 800, height: 600 }]);
  expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith('file://small', [], { compress: 0.7, format: 'jpeg', base64: true });
});

it('turns photos into a text source', async () => {
  ok({ text: 'Photosynthesis makes glucose.' });
  await expect(readPhotos([{ uri: 'file://p', width: 100, height: 100 }])).resolves.toEqual({ kind: 'text', text: 'Photosynthesis makes glucose.', title: 'Your notes', label: 'your photos' });
});

// The phone checks sizes before uploading (spec §4.2), so a big photo gets a
// clear message without a round trip, and Vercel's ~4.5 MB body limit is never hit.
it('refuses a photo over 1.5 MB before uploading', async () => {
  (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({ base64: 'A'.repeat(Math.ceil((1.5 * 1024 * 1024 * 4) / 3) + 8), uri: 'x', width: 1600, height: 1200 });
  await expect(readPhotos([{ uri: 'file://big', width: 4000, height: 3000 }])).rejects.toMatchObject({ kind: 'too_large' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('refuses photos that together exceed the upload limit', async () => {
  const each = 'A'.repeat(Math.ceil((1.2 * 1024 * 1024 * 4) / 3));
  (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ base64: each, uri: 'x', width: 1600, height: 1200 });
  await expect(readPhotos(Array.from({ length: 4 }, (_, i) => ({ uri: `file://p${i}`, width: 4000, height: 3000 })))).rejects.toMatchObject({ kind: 'too_large' });
  expect(fetchMock).not.toHaveBeenCalled();
  (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ base64: 'anBlZw==', uri: 'x', width: 1600, height: 1200 });
});
