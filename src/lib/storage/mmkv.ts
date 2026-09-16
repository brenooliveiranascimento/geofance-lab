import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const memoryStorage = new Map<string, string>();
const memoryFallback: StateStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => { memoryStorage.set(key, value); },
  removeItem: (key) => { memoryStorage.delete(key); },
};

function createStorage(): StateStorage {
  try {
    const storage = createMMKV({ id: 'app-store' });
    storage.set('__test__', '1');
    storage.remove('__test__');
    return {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => { storage.remove(key); },
    };
  } catch (e) {
    console.warn('[MMKV] Native module not available, using memory fallback:', e);
    return memoryFallback;
  }
}

export const mmkvStorage: StateStorage = createStorage();
