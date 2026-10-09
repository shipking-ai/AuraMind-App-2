import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface Settings {
  hapticsEnabled: boolean;
  setHapticsEnabled(v: boolean): void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'bonamind.settings',
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: ({ hapticsEnabled }) => ({ hapticsEnabled }),
    },
  ),
);
