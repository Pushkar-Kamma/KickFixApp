# KickFix — Security Posture

## Credentials

**Supabase URL + anon (publishable) key** are loaded at build time from `.env`
via `react-native-dotenv` (see [babel.config.js](../babel.config.js) and
[src/config/env.ts](../src/config/env.ts)).

- `.env` is **gitignored**.
- A redacted [.env.example](../.env.example) is checked in for onboarding.
- The bundle still embeds the values at build time — they are visible inside
  the APK. This is acceptable for a Supabase **publishable** key as long as
  Row-Level Security (RLS) is correctly configured (see below).

### Key rotation policy
- Rotate the publishable key in the Supabase dashboard if there is **any**
  reason to believe a build leaked it (e.g. APK shared without RLS audit,
  source repo accidentally made public).
- After rotating, update `.env`, ship a fresh build, and disable the old key.

## Row-Level Security (RLS) status

**All four user-data tables have RLS enabled** with policies that restrict
access to `auth.uid() = user_id`.

| Table | RLS | Policies |
|---|---|---|
| `profiles` | ✅ | own row only |
| `sessions` | ✅ | own rows only |
| `kicks` | ✅ | own rows only |
| `kick_frames` | ✅ | own rows only — defined in [supabase/migrations/002_kick_frames.sql](../supabase/migrations/002_kick_frames.sql) |

> ⚠️ The migrations for `profiles`, `sessions`, and `kicks` are not in this
> repo (created via the Supabase dashboard during initial bring-up). Capture
> them with `supabase db pull` and commit the result so the RLS posture is
> reproducible from source.

## Local secrets storage

- Supabase auth tokens persist via `react-native-encrypted-storage`
  (Android Keystore / iOS Keychain). Falls back to in-memory if the
  native module isn't linked — session won't survive process restart in
  that case but no plaintext is ever written to disk.
- Cached kick replays + WAL queues use `@react-native-async-storage/async-storage`.
  These contain pose landmarks and engine results — **non-sensitive**, but
  scoped per-userId in case multiple accounts are used on the same device.

## Telemetry / data leaving the device

- Only data the user actively records is sent: `kicks` summary, `kick_frames`
  landmark replays, `sessions` durations, `profiles` (username, height, belt).
- No analytics SDK is bundled. No third-party trackers.
- Crash reporting: not yet integrated. (TODO before production release.)

## Things to harden before public release

1. Add Supabase migrations for `profiles`, `sessions`, `kicks` to the repo.
2. Add CI step that runs `supabase db lint` + a smoke test that confirms
   anon access without `auth.uid()` returns zero rows.
3. Consider switching to short-lived JWTs / signed URLs for the
   `kick_frames` jsonb if it ever grows past current size limits.
4. Add a basic crash reporter (Sentry, Bugsnag) — gated behind a setting.
