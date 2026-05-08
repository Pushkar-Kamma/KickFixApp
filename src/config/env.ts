/**
 * Supabase project credentials.
 *
 * Loaded from the `.env` file at the repo root via `react-native-dotenv`
 * (see babel.config.js + env.d.ts). The .env file is gitignored.
 *
 * Local dev: copy `.env.example` to `.env` and fill in your values.
 * CI/release: inject via build-time env variables before bundling.
 */
import { SUPABASE_URL as ENV_URL, SUPABASE_ANON_KEY as ENV_KEY } from '@env';

if (!ENV_URL || !ENV_KEY) {
  throw new Error(
    '[env] Missing SUPABASE_URL or SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase credentials.',
  );
}

export const SUPABASE_URL = ENV_URL;
export const SUPABASE_ANON_KEY = ENV_KEY;
