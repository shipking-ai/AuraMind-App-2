import * as SecureStore from 'expo-secure-store';

/**
 * Keychain/Keystore-backed storage for the Supabase session. Secure-store
 * values are capped at about 2 KB and a session is larger, so values are
 * split into chunks `${key}.0..n-1` with the count under `${key}.n`.
 */
export const CHUNK_SIZE = 1800;

const countKey = (k: string) => `${k}.n`;
const chunkKey = (k: string, i: number) => `${k}.${i}`;

async function removeChunks(key: string): Promise<void> {
  const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    if (!n) return null;
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);
    const n = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(n));
  },
  removeItem: removeChunks,
};
