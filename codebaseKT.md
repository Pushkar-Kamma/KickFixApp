# KickFixApp — Codebase KT (Developer Handoff)

This document explains **what the KickFixApp repo is**, how the app works end-to-end, and what each important file/module does. It is intended to let a developer **continue development immediately** without needing prior context.

> **Status (June 2026):** KickFix is a working **MVP being prepared for Google Play closed testing.** Authentication, onboarding, the full 3-tab UI, all three kick analyzers (Quick + Full analysis), Supabase persistence, offline sync, fighter analytics, goals/streaks, Sentry crash reporting, and release signing are all implemented. Remaining work is store-listing polish, accuracy tuning, and the V2 roadmap (see §15–16).
>
> **Document history:** This file was originally written by a previous developer describing a much earlier state (a single `KickAnalyzer.ts`, emoji tabs, auth-only Supabase). It has since been **fully updated** to the current architecture. Companion file `sessionKT.md` records the incremental decisions/changes from the build-out session; `THRESHOLDS.md` lists every detection constant and criterion threshold.

---

## 1) Project intent

**KickFix** is a **React Native CLI** (not Expo) mobile app that acts as a **premium, AI-powered martial-arts kick coach**.

The core loop:

1. The user picks a kick type (**Roundhouse**, **Front Snap**, or **Side Kick**) and an analysis mode (**Quick** or **Full**).
2. They set the phone up (front camera) and throw kicks. **MediaPipe Pose** streams 33 landmarks/frame, in both **image-space** (normalized) and **world-space** (meters).
3. A lightweight state machine detects each kick's start/end and buffers the frames (pre-roll + recoil trail).
4. A kick-specific analyzer scores the kick **0–100**, assigns a **verdict/tier**, and emits specific coaching cues from biomechanical criteria.
5. **Quick mode** shows a live HUD (score + one headline cue); **Full mode** opens a slow-motion skeleton replay with a per-criterion scorecard.
6. Results persist to **Supabase** (summary + compact landmark frames) and power a **dashboard**, **kick history**, **fighter-attribute radar**, **goals**, and **streaks**.

Pervasive design principle: **thresholds are body-relative ratios, not pixels**, so analysis stays consistent regardless of how far the user stands from the camera.

---

## 2) Tech stack & dependency versions

From `package.json` (RN **0.75.4**, React **18.3.1**, Hermes on, New Arch off):

### Runtime / core

- **react-native** `0.75.4`, **react** `18.3.1`
- **Pose provider:** `@thinksys/react-native-mediapipe` `^0.0.19` (33-landmark BlazePose, image + world coords)
- **Backend/auth:** `@supabase/supabase-js` `^2.103.2`
- **Crash reporting:** `@sentry/react-native` `^8.11.1`
- **Splash:** `react-native-bootsplash` `^7.3.1`
- **Vector graphics:** `react-native-svg` `^15.15.4` (radar chart + skeleton replay)

### Storage

- **Secure session storage:** `react-native-encrypted-storage` `^4.0.3`
- **Local cache / WAL / settings:** `@react-native-async-storage/async-storage` `^1.24.0`
- **Polyfill:** `react-native-url-polyfill` `^3.0.0`

### Navigation (React Navigation v6)

- `@react-navigation/native` `^6.1.18`, `@react-navigation/native-stack` `^6.11.0`, `@react-navigation/bottom-tabs` `^6.6.1`

### RN infra libs

- `react-native-gesture-handler` `^2.20.2`, `react-native-reanimated` `^3.15.5`, `react-native-screens` `^3.35.0`, `react-native-safe-area-context` `^4.14.0`

### Tooling

- **TypeScript** `5.0.4`, **ESLint** `^8.19.0` (`@react-native`), **Jest** `^29.6.3`, **Prettier** `2.8.8`
- **patch-package** `^8.0.1` (postinstall; patches `@supabase/auth-js` exports for Metro)
- **react-native-dotenv** `^3.4.11` (loads `.env` via the `@env` import)
- **sharp** `^0.34.5` (dev-only; icon / store-asset generation scripts)

Node engine: `>= 18`

---

## 3) App entrypoints (boot sequence)

### `index.js`

1. imports `react-native-gesture-handler` (must be first) and `react-native-url-polyfill/auto`
2. **initializes Sentry** (`Sentry.init`, DSN from `@env`, `enabled: !__DEV__`, `tracesSampleRate: 0.1`, `sendDefaultPii: false`) — before any app code
3. registers the root component with `AppRegistry`

### `App.tsx`

- wraps the tree in `SafeAreaProvider`
- renders `<RootNavigator />`
- exported as `Sentry.wrap(App)` to capture React render errors
- **No theme provider** — theme tokens are imported directly where needed

(Historical note: an earlier build temporarily rendered a `ThemeCompare` screen here for color picking. That is gone.)

---

## 4) Navigation architecture

React Navigation v6 with type-safe param lists in `src/types/index.ts`. Barrel: `src/navigation/index.ts`. `headerShown: false` everywhere; screens render their own headers.

### 4.1 Param lists (`src/types/index.ts`)

- `RootStackParamList`: `{ Auth, ProfileSetup, MainTabs }`
- `AuthStackParamList`: `{ Welcome, Login, SignUp, OTP, ForgotPassword, ForgotPasswordOTP, NewPassword, PasswordUpdated }`
- `MainTabParamList`: `{ Home, Train, ProfileTab }`
- `HomeStackParamList`: `{ Dashboard, SetGoals, KickHistory, FighterAttributes }`
- `TrainStackParamList`: `{ TrainSelect, Camera: { kickMode, analysisMode? }, KickReview: { kickId } }`
- `ProfileStackParamList`: `{ Profile, EditUsername, EditProfile }`

### 4.2 Root auth + profile gate (`src/navigation/RootNavigator.tsx`)

Three-state gate, rendered after a bootsplash with a **4 s safety timeout**:

1. **No session →** `AuthStack`
2. **Session but no profile (no `username`) →** `ProfileSetupScreen` (onboarding)
3. **Session + profile →** `MainTabs`

Details:

- Reads a cached `kickfix.hasProfile` flag from EncryptedStorage for an instant first render, then refreshes profile status in the background (non-blocking).
- If there's no session, calls `ensureAnonSession()` (`src/lib/anonAuth.ts`) to sign in **anonymously** and seed a default profile — supporting the `KickFix_Without_Login` testing build. Falls through to `AuthStack` only if anon sign-in fails.
- Subscribes to `supabase.auth.onAuthStateChange`; hides the native splash (`BootSplash.hide`) once auth state resolves.

### 4.3 Stacks

- **`AuthStack.tsx`** — `Welcome` (rotating martial-arts quotes), `SignIn`, `SignUp` → `OTP`, and the full recovery chain (`ForgotPassword` → `ForgotPasswordOTP` → `NewPassword` → `PasswordUpdated`).
- **`AppTabs.tsx`** — bottom tabs **Home / Train / Profile** with custom geometric (non-emoji) icons and an active-tab red underline. Each tab hosts a native stack:
  - **`HomeStack.tsx`** — `Dashboard`, `SetGoals`, `KickHistory`, `FighterAttributes`
  - **`TrainStack.tsx`** — `TrainSelect`, `Camera`, `KickReview`
  - **`ProfileStack.tsx`** — `Profile`, `EditUsername`, `EditProfile`

---

## 5) The analysis engine (`src/engine/`)

This is the core IP. The current engine is a **full rewrite** of the original `logic.py` / `KickAnalyzer.ts` approach. It operates on **`PoseFrame[]`** (image **and** world landmarks) instead of the old 2-D `Point[]`.

### 5.1 `biomech.ts` — shared math + types

- **Types:** `Landmark {x,y,z,visibility?,presence?}`, `Vec3`, `PoseFrame { image: Landmark[]; world: Landmark[]; t: number }`, and the `J` joint-index map (BlazePose 33: `L_HIP=23`, `L_KNEE=25`, `L_ANKLE=27`, …).
  - **image-space** landmarks are normalized 0–1 — stable, pixel-tracked; used for *detection* and *display*.
  - **world-space** landmarks are in **meters** relative to hip midpoint — rotation/scale invariant; used for true 3-D angles/velocities where reliable.
- **Vector math:** `sub/add/scale/dot/norm/dist/mid`, `angle3D(a,b,c)` (degrees at vertex B).
- **Derivatives:** `deriveScalar(values,times)` / `deriveVec3(pos,times)` → per-second velocities; `argmax`.
- **Quality gate:** `frameUsable(image, visMin=0.5, presMin=0.5)` validates 8 **critical** joints (L/R hip, knee, ankle, shoulder). Bad frames are dropped.
- **Leg detection:** `detectKickingLeg(imageFrames)` — at ~60% through the buffer the **higher** ankle (lower `y`) is the kicking leg. `displayLeg(leg)` flips Left↔Right because the **front camera mirrors** the image.
- **Scale-awareness:** every threshold is a **ratio** (fraction of frame height, hip width, or leg length) — never a raw pixel. This keeps results consistent across camera distances.

### 5.2 The three analyzers

`FrontSnapAnalyzer.ts`, `SideKickAnalyzer.ts`, `RoundhouseAnalyzer.ts` each take `PoseFrame[]` and return a rich **`KickResult`**:

```ts
{
  score: number;            // 0–100
  verdict: 'SNAP'|'PUSH'|'LOW'|'SLOPPY'|'GOOD';
  tier: 'Elite'|'Advanced'|'Intermediate'|'Novice';
  headlineCue: string;      // top failure cue, or '' if clean
  leg: 'Left'|'Right';
  peakFrameIdx: number;     // peak extension (min ankle.y)
  chamberFrameIdx: number;  // tightest knee fold before peak
  criteria: CriterionResult[];  // every check + value/unit/target/cue/severity
  metrics: { peakKneeAngleDeg, peakKneeAngularVelDegPerSec, peakFootSpeedMS,
             extensionMs, chamberMs, totalMs, recoilToExtensionRatio };
}
```

**Shared scoring:** start at **100**, subtract per failed criterion by severity — **critical = 15, major = 8, minor = 4, info = 0** — clamp 0–100. Tiers: ≥90 Elite, ≥75 Advanced, ≥60 Intermediate, else Novice. **Peak frame** = min ankle `y` (more reliable than knee-angle argmax); **chamber frame** = min knee angle before peak.

| Analyzer | Kick | # criteria | Signature checks |
|---|---|---|---|
| `FrontSnapAnalyzer.ts` | Front Snap (Ap Chagi) | **19** | peak extension 165–185° (critical), ankle ≥ hip height (critical), snap velocity ≥600°/s (critical), recoil ratio ≥0.7 (critical), knee-at-hip chamber, vertical torso |
| `SideKickAnalyzer.ts` | Side Kick (Yeop Chagi) | **13** | hip turnover ≥60° (critical), body line shoulder–hip–ankle ≥120° (critical), peak extension + ankle≥hip (critical), recoil ratio ≥0.4 (image-space) |
| `RoundhouseAnalyzer.ts` | Roundhouse (Dollyo Chagi) | **13** | shin horizontal `|kneeY−ankleY|<0.07` (critical), knee-leads-ankle (anti soccer-kick), hip rotation 30–90°, arc trajectory, lean 35–65° |

Notes:

- Front Snap uses **world-space** recoil (m/s); Side Kick & Roundhouse use **image-space** recoil because world-space Z is noisy when the user is side-on.
- "Knee at hip" chamber, "ankle ≥ hip at apex", and recoil checks recur across all three with kick-specific tolerances. Exact numbers live in **`THRESHOLDS.md`**.

### 5.3 `KickAnalyzer.ts` — ⚠️ legacy / dead code

The **old** `Point[]`-based engine (`analyzeRoundhouse/SideKick/FrontSnap`, `ERROR_DEDUCTIONS`, `computeScore`, `kickAnkleSeparationThreshold`, `isVisibleEnough`). **Not imported by any runtime screen.** Safe to delete once confirmed; kept only for reference. Likewise `reference/logic.py` is the original Python and is not bundled.

### 5.4 `pendingKick.ts` — in-memory frame bridge

Lets `KickReview` open **instantly** without waiting for the Supabase write: `setPendingKick(key,…)` / `takePendingKick(key)` / `peekPendingKick` / `reconcilePendingKick(tempKey, realDbId)`; entries expire after 60 s.

---

## 6) Camera runtime pipeline (`src/screens/CameraScreen.tsx`)

The training loop. Uses the **front camera** so the user can watch themselves.

### 6.1 Ingestion

`<RNMediapipe onLandmark={…}>` fires per frame with `{ landmarks, worldLandmarks, … }`. Each frame becomes a `PoseFrame` and passes through `frameUsable()`. Losing tracking mid-kick **aborts** the kick (flash "Lost tracking — kick aborted") and bumps telemetry.

### 6.2 Detection state machine (image-space)

`IDLE → RECORDING → COOLDOWN → IDLE`. Detection uses **image-space** landmarks because MediaPipe world-space jitters ±5–10° on a planted leg. Key constants:

| Constant | Value | Meaning |
|---|---|---|
| `PRE_ROLL` | 5 | frames kept before onset (captures chamber prep) |
| `MIN_KICK_FRAMES` | 8 | shorter buffers are noise (`tooShortKicks`) |
| `COOLDOWN_FRAMES` | 6 | forced idle after a kick |
| `KNEE_VEL_ONSET` | 0.06 | image-Y knee rise/frame that triggers onset |
| `END_ANKLE_GROUND_OFFSET` | 0.15 | ankle back below hip+offset ⇒ kick ended |
| `POST_END_TRAIL_FRAMES` | 10 | extra frames buffered after end (recoil) |
| `MAX_KICK_FRAMES` | 120 | hard cap (~4 s) |

Onset = `isStanding` (hip above knees) **and** knee rises faster than `KNEE_VEL_ONSET`. End = lowest ankle returns below `hip + END_ANKLE_GROUND_OFFSET`; then buffer `POST_END_TRAIL_FRAMES` more frames and finalize.

### 6.3 Analyze → gate → persist

1. `detectKickingLeg()`, then route to the analyzer for the selected `kickMode`.
2. **Quality gate:** `result.score < 45` ⇒ **silently discarded** (no counter, no DB row); bumps `telemetry.rejectedKicks`. Suppresses false positives but also hides genuinely bad kicks — a known tradeoff (see §15).
3. Otherwise `totalKicks++`; **score ≥ 70 = good kick** (streak++), else bad (streak reset).
4. **Persistence** (deferred via `InteractionManager`, non-blocking): `saveKick()` (summary) → on success `reconcilePendingKick()` + `saveKickFrames()` (landmarks). On failure → `queueKickSave()` (offline WAL) and flash "Saved locally — will sync when online".
5. **Quick mode** stays on-camera and shows the HUD; **Full mode** stashes frames via `setPendingKick()` and navigates to `KickReview` immediately.

Session lifecycle: `createSession()` on entry, `endSession(id,{total,good,bad,maxStreak})` on unmount. FPS shown (~1 Hz). Both modes run the **same** engine.

### 6.4 Full-analysis replay (`src/screens/KickReviewScreen.tsx`)

Loads frames from `takePendingKick()` (instant) or `loadKickFrames()` (cache→Supabase), re-runs the analyzer, and renders a **slow-mo skeleton replay** (`SkeletonReplay`, `PLAYBACK_FPS = 8`) with play/pause, ±1-frame scrub, **jump-to-peak**, **jump-to-chamber**, a 9-tile metrics grid, and the full pass/fail criterion scorecard (sorted by severity). It re-draws recorded landmarks — **no video is ever stored**.

---

## 7) Data layer — services, caching & offline (`src/services/`, `src/lib/`)

The app is **local-first**: screens render from AsyncStorage caches instantly, then refresh from Supabase in the background, and **write-ahead logs (WALs)** retry failed writes when back online.

### 7.1 Supabase client (`src/lib/supabase.ts`)

`createClient` with `persistSession`, `autoRefreshToken`, `detectSessionInUrl:false`, and a **custom storage adapter**: EncryptedStorage (Keychain/Keystore) with a **3 s per-op timeout**, mirrored to an in-memory `Map`, falling back to pure in-memory if encrypted storage is unavailable. `anonAuth.ts` provides `ensureAnonSession()` for the no-login testing build.

### 7.2 Credentials (`src/config/env.ts`)

Imports `SUPABASE_URL` / `SUPABASE_ANON_KEY` (and `SENTRY_DSN` in `index.js`) from `@env` (**react-native-dotenv**). `.env` is git-ignored; values are injected at build time. The previously-committed anon key was **rotated**; see `SECURITY.md`.

### 7.3 Services

| File | Responsibility |
|---|---|
| `profiles.ts` | `getProfile`, `upsertProfile`, `deleteMyAccount()` (calls the `delete_my_account` RPC) |
| `sessions.ts` | `createSession`, `endSession`, `getRecentSessions`, **`getSessionStats`** (recomputed from `kicks`, not stored) |
| `kicks.ts` | `saveKick`, `getKicksForSession`, `getRecentKicks`, `deleteKick`; updates `kicksCache` on save |
| `kicksCache.ts` | local cache of the 100 most-recent kicks (`@kickfix:recentKicks:<uid>`) for instant history |
| `kicksWAL.ts` | **offline retry queue** for failed `saveKick`s; `flushKicksWAL()` returns `tempId→realId` for reconciliation |
| `kickFrames.ts` | `saveKickFrames` (compacts to `CompactFrame[]`, ~25 KB/kick), local cache (≤30), WAL flush, `loadKickFrames`, `get/setSaveReplaysEnabled` |
| `goals.ts` | daily goals in AsyncStorage; `getDailyProgress`, `getStreak`, `maybeAdvanceStreak` |
| `attributes.ts` | `getFighterAttributes(uid, '7d'\|'30d'\|'all')` → 6-axis radar derived from kick history |
| `telemetry.ts` | local-only counters (`rejectedKicks/abortedKicks/tooShortKicks/savedKicks/saveFailures`) |

### 7.4 Database schema (Supabase / Postgres, RLS on every table)

`profiles`, `sessions`, and `kicks` were created in the Supabase dashboard; `kick_frames` and the delete RPC live in `supabase/migrations/`.

- **`profiles`** — `id` (PK→`auth.users.id`, cascade), `username`, `belt_level`, `height_cm`, `created_at`.
- **`sessions`** — `id`, `user_id`, `started_at`, `ended_at`, `total_kicks`, `good_kicks`, `bad_kicks`, `max_streak`, **`kick_mode`**. (Point-in-time snapshot; true stats are recomputed from `kicks`.)
- **`kicks`** — `id`, `user_id`, `session_id` (cascade), `created_at`, `kick_type`, **`engine_data` jsonb**.
- **`kick_frames`** (migration `002_kick_frames.sql`) — `id`, `kick_id` (cascade), `user_id`, `created_at`, **`frames` jsonb** (`CompactFrame[]`), `peak_frame_idx`, `chamber_frame_idx`, `leg`. The **only** place raw motion is stored — compact landmarks, **never video**.
- **`delete_my_account()`** RPC (migration `003_delete_account.sql`) — `security definer`; deletes the caller's `auth.users` row and cascades everything.

**`engine_data` JSONB shape** (`EngineData` in types):

```jsonc
{ "score": 0, "feedback": [], "errors": [], "leg": "Left",
  "peakAngle": 0, "kickMode": "Front Snap",
  "passedCriteria": ["torso_vertical", "body_line"],
  "metrics": { "peakKneeAngularVelDegPerSec": 0, "peakFootSpeedMS": 0,
               "extensionMs": 0, "chamberMs": 0, "totalMs": 0,
               "recoilToExtensionRatio": 0 } }
```

### 7.5 Auth flows

Email + **password** for sign-in; **OTP** only for sign-up verification and password recovery (`SignUp → OTP (type:'signup')`; `ForgotPassword → ForgotPasswordOTP (type:'recovery') → NewPassword → PasswordUpdated`). `SignUp` handles anti-enumeration for already-registered emails. The Metro patch `patches/@supabase+auth-js+2.103.2.patch` (applied via `postinstall`) fixes auth-js export resolution.

### 7.6 State management

**No global state/context yet** — `src/context/` and `src/hooks/` are empty. Screens call services imperatively and cache locally.

---

## 8) UI system (theme + fonts)

Finalized **black / white / red** "athletic brutalist" theme. Tokens in `src/theme/` (`colors.ts`, `spacing.ts`, `typography.ts`, `fonts.ts`, barrel `index.ts`).

- **Palette:** near-black background `#0A0A0A`, charcoal surfaces `#1A1A1A`, stark white text, one aggressive red (`primary ≈ #E53935`) reserved for primary CTAs / active states / streaks. Score colors: green ≥80, amber 50–79, red <50.
- **Fonts** (linked via `react-native.config.js`, copied to `android/app/src/main/assets/fonts`, registered in iOS `Info.plist`): **Montserrat** (Black/ExtraBold/Bold/Regular) for scores & titles, **Oswald** (Bold/Regular) for section headers/captions, **Inter** for body/feedback. Reference by filename, e.g. `fontFamily: 'Montserrat-Black'`.
- **Components** (`src/components/`): `AttributeRadar.tsx` (SVG 6-axis radar), `SkeletonReplay.tsx` (landmark stick-figure), plus `camera/`, `common/`, `dashboard/` subfolders. No emoji UI — custom geometric icons.

---

## 9) Screens (`src/screens/`)

**Auth:** `WelcomeScreen` (rotating verified martial-arts quotes, 7 s each, logo), `SignInScreen`, `SignUpScreen` (5-point password strength), `OTPScreen` (6-digit), `ForgotPasswordScreen`, `ForgotPasswordOTPScreen`, `NewPasswordScreen`, `PasswordUpdatedScreen`.

**Onboarding:** `ProfileSetupScreen` — required after first login; captures username (uniqueness-checked, ≥3 chars), belt, height; calls `upsertProfile`; `onComplete()` flips the root gate to `MainTabs`.

**Home tab:** `DashboardScreen` (stats, 12-week activity heatmap, streak, attribute preview; cache-first; tapping a recent kick → KickHistory), `SetGoalsScreen` (daily kicks/minutes/avg-score), `KickHistoryScreen` (cache-first list ≤100, expandable peak-frame replay, delete), `FighterAttributesScreen` (6-axis radar with 7d/30d/all windows + tiers).

**Train tab:** `TrainSelectScreen` (kick picker + Quick/Full bottom sheet; "Technique Video" is a coming-soon stub), `CameraScreen` (§6), `KickReviewScreen` (§6.4).

**Profile tab:** `ProfileScreen` (username/email/belt/height; **Sign Out**; **Delete Account** with double-confirm → `deleteMyAccount`), `EditUsernameScreen` (uniqueness + confirm), `EditProfileScreen` (belt/height).

**Dead code:** `AuthScreen.tsx` — still present, not in any navigator. `src/screens/index.ts` is the barrel.

---

## 10) Utilities & config

- `src/utils/permissions.ts` — Android camera permission prompt (iOS relies on `Info.plist`).
- `tsconfig.json` extends `@react-native/typescript-config`. `metro.config.js` adds `.tflite` to `assetExts`. `babel.config.js` = RN preset + `react-native-reanimated/plugin` + `react-native-dotenv`. `jest.config.js` preset `react-native`. `.gitignore` excludes `node_modules/`, build output, `.env`, `gradle.properties.local`.
- `global.d.ts` declares the `@env` module types.

---

## 11) Observability (Sentry + local telemetry)

- **Sentry** (`@sentry/react-native`): init in `index.js` (DSN from `@env`, prod-only, 10% traces, PII off); `Sentry.wrap(App)` captures render errors.
- **Local telemetry** (`telemetry.ts`): per-user AsyncStorage counters for rejected/aborted/too-short kicks and save successes/failures — **not** sent to Supabase; used to tune detection thresholds.

---

## 12) Tests

- `__tests__/App.test.tsx` — root render smoke test.
- `__tests__/biomech.test.ts` — unit tests for the pure `biomech` helpers.
- **Gap:** the analyzers themselves still lack fixture-based snapshot tests (see §15).

---

## 13) Build, signing & Android

- `android/gradle.properties`: `newArchEnabled=false`, `hermesEnabled=true`.
- `android/build.gradle`: `compileSdk 35`, `targetSdk 35`, `minSdk 24`, AGP `8.6.0`, Kotlin `1.9.24`, NDK `26.1.x`.
- `android/app/build.gradle`: **applicationId `app.KickFix`**, `versionCode 3`, `versionName 1.0.2-test`; **release signing** reads from git-ignored `android/gradle.properties.local` (`KICKFIX_RELEASE_STORE_FILE=kickfix-release.keystore` + passwords/alias); ProGuard on for release.
- Permissions (`AndroidManifest.xml`): `INTERNET`, `CAMERA`, `uses-feature camera`. iOS `Info.plist` has `NSCameraUsageDescription` + the bundled fonts.
- The native Kotlin package was relocated from `com.kickfixapp` to `app/` to match the new applicationId.

---

## 14) Publishing status (Google Play)

- **Distribution:** the app is in **Google Play closed testing**. To let testers in without an auth wall, a **no-login variant** is published: with no Supabase session, `RootNavigator` calls `ensureAnonSession()` (`src/lib/anonAuth.ts`) which signs in **anonymously** and seeds a `Tester NNNN` profile, so testers skip `AuthStack` entirely. This is the `KickFix_Without_Login` branch/fork; `versionCode`/`versionName` (`1.0.2-test`) get bumped as testing builds are re-published.
- **Done:** release keystore, app ID (`app.KickFix`), home-screen name (`displayName: "KickFix"` in `app.json`), Sentry, privacy policy (`docs/privacy-policy.html`), account-deletion flow + RPC, camera `uses-feature`, store-asset scripts (`scripts/generate-android-icons.cjs`, `scripts/generate-store-assets.cjs` → `store-assets/`).
- **Remaining before production launch:** final app icon/branding pass, screenshots + listing copy, and bumping `versionName` off `-test` (and deciding how/whether the real login flow returns for the production track).

---

## 15) Known issues & tech debt

1. **`score < 45` silent discard** hides bad kicks from counters — consider logging to a `rejected_kicks` table instead of dropping.
2. **Duplicate engine:** delete legacy `src/engine/KickAnalyzer.ts`; move `reference/logic.py` out of the runtime tree.
3. **Heuristic scoring weights** (severity 15/8/4) and thresholds are coaching-literature + ad-hoc tester calibration — not yet data-driven. `THRESHOLDS.md` tracks them.
4. **Image-space detection** constants (`KNEE_VEL_ONSET`, etc.) are framerate-sensitive; consider per-ms / world-space velocity.
5. **MediaPipe limits:** occasional left/right-leg misattribution and peak-frame error when a limb leaves the frame; world-space jitter.
6. **No analyzer fixture tests**; empty `src/context` / `src/hooks`.

---

## 16) Roadmap (post-MVP)

- **Phase 2:** technique tutorial videos; richer false-positive handling; personal-baseline scoring (grade vs the user's own rolling average instead of fixed "elite" thresholds).
- **V2 "god-tier":** ghost-skeleton overlay of the user's historical best kick; "Dojo" social/leaderboards; user-height-calibrated measurements (use `profiles.height_cm` instead of only body-ratio normalization).

---

## 17) Reference implementation

### `reference/logic.py`

Desktop Python reference implementation of the kick analysis logic. It was the source of intent for the TypeScript engine and is useful for validating logic parity. **Not part of the mobile runtime / not bundled.**

Companion docs: `sessionKT.md` (incremental change log), `THRESHOLDS.md` (every detection constant + criterion threshold), `SECURITY.md` (RLS / key posture), `README.md`.

---

## 18) Quick start (dev)

1. `npm install` (runs `patch-package`).
2. Create `.env` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN`.
3. Start Metro: `npm start`. Run Android: `npm run android` (emulator or USB-debugging device).
4. First launch creates/uses a session; pick a kick in **Train** to exercise the engine. Expect ~19–25 FPS on a mid-tier device.

