import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import EncryptedStorage from 'react-native-encrypted-storage';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env';

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// In-memory fallback used if EncryptedStorage hangs or errors.
const inMemoryMap = new Map<string, string>();
const inMemoryStorage: SupabaseStorage = {
  async getItem(key) { return inMemoryMap.get(key) ?? null; },
  async setItem(key, value) { inMemoryMap.set(key, value); },
  async removeItem(key) { inMemoryMap.delete(key); },
};

// Race a promise against a timeout. If the native side hangs (rare but observed
// at cold start on some devices) we fall back gracefully instead of locking auth.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function createEncryptedStorageAdapter(): SupabaseStorage {
  return {
    async getItem(key) {
      try {
        return await withTimeout(EncryptedStorage.getItem(key), 3000, null);
      } catch {
        return inMemoryStorage.getItem(key);
      }
    },
    async setItem(key, value) {
      try {
        await withTimeout(EncryptedStorage.setItem(key, value), 3000, undefined);
        // Mirror to memory so reads in this session don't depend on disk
        await inMemoryStorage.setItem(key, value);
      } catch {
        await inMemoryStorage.setItem(key, value);
      }
    },
    async removeItem(key) {
      try {
        await withTimeout(EncryptedStorage.removeItem(key), 3000, undefined);
      } catch {
        // ignore
      }
      await inMemoryStorage.removeItem(key);
    },
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: createEncryptedStorageAdapter(),
  },
});
