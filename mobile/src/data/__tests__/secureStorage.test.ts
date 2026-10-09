import * as SecureStore from 'expo-secure-store';
import { CHUNK_SIZE, chunkedSecureStorage } from '../secureStorage';

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    __mem: mem,
    getItemAsync: jest.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { mem.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { mem.delete(k); }),
  };
});
const mem: Map<string, string> = (SecureStore as any).__mem;

beforeEach(() => mem.clear());

it('splits a large session across chunks and reads it back', async () => {
  const value = 'x'.repeat(5_000);
  await chunkedSecureStorage.setItem('sb-auth', value);
  expect(CHUNK_SIZE).toBe(1800);
  expect(mem.get('sb-auth.n')).toBe('3');
  expect([...mem.keys()].filter((k) => /^sb-auth\.\d+$/.test(k))).toHaveLength(3);
  expect(await chunkedSecureStorage.getItem('sb-auth')).toBe(value);
});

it('removes every chunk', async () => {
  await chunkedSecureStorage.setItem('sb-auth', 'y'.repeat(4_000));
  await chunkedSecureStorage.removeItem('sb-auth');
  expect(mem.size).toBe(0);
  expect(await chunkedSecureStorage.getItem('sb-auth')).toBeNull();
});

it('drops stale chunks when a value shrinks', async () => {
  await chunkedSecureStorage.setItem('sb-auth', 'a'.repeat(5_000));
  await chunkedSecureStorage.setItem('sb-auth', 'b');
  expect(mem.has('sb-auth.1')).toBe(false);
  expect(await chunkedSecureStorage.getItem('sb-auth')).toBe('b');
});
