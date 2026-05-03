import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { NativeModules } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env';

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const inMemoryMap = new Map<string, string>();
const inMemoryStorage: SupabaseStorage = {
  async getItem(key) {
    return inMemoryMap.get(key) ?? null;
  },
  async setItem(key, value) {
    inMemoryMap.set(key, value);
  },
  async removeItem(key) {
    inMemoryMap.delete(key);
  },
};

// Encrypted storage native module is detected but not functioning on this build.
// Use in-memory storage until native linking is fixed.
// Tradeoff: user must re-login after force-killing the app.
function createEncryptedStorageAdapter(): SupabaseStorage {
  console.log('[Supabase] Using in-memory storage (encrypted storage disabled)');
  return inMemoryStorage;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: createEncryptedStorageAdapter(),
  },
});
