import { CreateError, type CourseSource } from '@bonamind/core';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { authedPost } from './api';

/** Limits enforced before upload, matching the API's own (spec §4.2). */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS = 5;
export const PHOTO_MAX_SIDE = 1600;
/** Per photo, and all photos together (kept well under Vercel's ~4.5 MB request body). */
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
export const MAX_PHOTOS_UPLOAD_BYTES = 3 * 1024 * 1024;
const PHOTO_QUALITY = 0.7;

export interface PickedPdf { name: string; size: number; uri: string }
export interface PickedPhoto { uri: string; width: number; height: number }

type Extracted = { success: boolean; data: { text: string; title?: string; pages?: number } };

const HTTP_URL = /^https?:\/\/[^\s/?#]+/i;
const YOUTUBE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)(?:[/?#]|$)/i;

export const isYouTube = (url: string) => YOUTUBE.test(url.trim());
export const isHttpUrl = (text: string) => HTTP_URL.test(text.trim());

const host = (url: string) => url.trim().match(/^https?:\/\/(?:www\.)?([^/:?#]+)/i)?.[1] ?? 'the web';

function textSource(text: string | undefined, title: string, label: string): CourseSource {
  if (!text?.trim()) throw new CreateError('unreadable');
  return { kind: 'text', text, title, label };
}

export function readTopic(topic: string): CourseSource {
  const t = topic.trim();
  if (!t) throw new CreateError('unreadable');
  return { kind: 'topic', topic: t };
}

/** A web page's text, or a YouTube video's transcript, via the existing endpoints. */
export async function readLink(url: string): Promise<CourseSource> {
  const u = url.trim();
  if (!isHttpUrl(u)) throw new CreateError('unreadable');
  const video = isYouTube(u);
  const { data } = await authedPost<Extracted>(video ? '/api/fetch-youtube-transcript' : '/api/fetch-url', { url: u });
  return textSource(data?.text, data?.title || host(u), video ? 'a YouTube video' : host(u));
}

export async function pickPdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  const file = result.canceled ? null : result.assets[0];
  return file ? { name: file.name, size: file.size ?? 0, uri: file.uri } : null;
}

export async function readPdf(file: PickedPdf): Promise<CourseSource> {
  if (file.size > MAX_PDF_BYTES) throw new CreateError('too_large');
  const data = await readAsStringAsync(file.uri, { encoding: 'base64' });
  const { data: out } = await authedPost<Extracted>('/api/extract/document', { name: file.name, data });
  return textSource(out?.text, out?.title || 'Your PDF', 'your PDF');
}

/** Camera (one shot) or library (up to 5); [] when cancelled or not allowed. */
export async function pickPhotos(from: 'camera' | 'library', room = MAX_PHOTOS): Promise<PickedPhoto[]> {
  if (room <= 0) return [];
  let result: ImagePicker.ImagePickerResult;
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return [];
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 1 });
  }
  if (result.canceled) return [];
  return result.assets.slice(0, room).map(({ uri, width, height }) => ({ uri, width, height }));
}

/** Every photo as a JPEG no longer than 1,600 px (HEIC from the camera included), then transcribed. */
export async function readPhotos(photos: PickedPhoto[]): Promise<CourseSource> {
  const images = await Promise.all(photos.slice(0, MAX_PHOTOS).map(async ({ uri, width, height }) => {
    const resize = Math.max(width, height) > PHOTO_MAX_SIDE
      ? [{ resize: width >= height ? { width: PHOTO_MAX_SIDE } : { height: PHOTO_MAX_SIDE } }]
      : [];
    const out = await ImageManipulator.manipulateAsync(uri, resize, { compress: PHOTO_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    return out.base64 ?? '';
  }));
  const bytes = images.map((b64) => Math.floor((b64.length * 3) / 4));
  if (bytes.some((n) => n > MAX_PHOTO_BYTES) || bytes.reduce((a, n) => a + n, 0) > MAX_PHOTOS_UPLOAD_BYTES) {
    throw new CreateError('too_large');
  }
  const { data } = await authedPost<Extracted>('/api/extract/image', { images });
  return textSource(data?.text, 'Your notes', 'your photos');
}
