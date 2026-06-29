// Testing-only helper: ensures every app launch yields a valid Supabase session.
// If no session exists, creates an anonymous user + a default profile row.
// Used by RootNavigator on the `KickFix_Without_Login` branch to bypass auth UI
// for closed testing on Google Play.

import { supabase } from './supabase';
import { upsertProfile, getProfile } from '../services/profiles';

const DEFAULT_BELT = 'Blue';
const DEFAULT_HEIGHT_CM = 170;

function randomTesterUsername(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Guest ${n}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

/**
 * Returns the current Supabase session, creating an anonymous one if needed.
 * Returns null if anonymous sign-in fails (caller should fall back to AuthStack).
 */
export async function ensureAnonSession() {
  // 1. Already signed in?
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 5000, 'getSession');
    if (data.session?.user) return data.session;
  } catch {
    return null;
  }

  // 2. Sign in anonymously
  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInAnonymously(),
      8000,
      'signInAnonymously',
    );
    if (error || !data.session?.user) return null;

    const userId = data.session.user.id;

    // 3. Ensure profile exists. Don't fail the whole flow if this errors —
    //    user can still use the app; profile screen will let them retry.
    try {
      const { data: existing } = await withTimeout(
        getProfile(userId),
        5000,
        'getProfile',
      );
      if (!existing?.username) {
        await withTimeout(
          upsertProfile(userId, {
            username: randomTesterUsername(),
            belt_level: DEFAULT_BELT,
            height_cm: DEFAULT_HEIGHT_CM,
          }),
          5000,
          'upsertProfile',
        );
      }
    } catch {
      // ignore — session still valid, dashboard will load
    }

    return data.session;
  } catch {
    return null;
  }
}
