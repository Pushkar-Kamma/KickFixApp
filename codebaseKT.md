# KickFixApp — Codebase KT (Developer Handoff)

This document explains **what the KickFixApp repo is**, how the app works end-to-end, and what each important file/module does. It is intended to let a developer **continue development immediately** without needing prior context.

---

## 1) Project intent

**KickFix** is a React Native (CLI) mobile app for **real-time martial arts kick form feedback**.

At runtime, the app:

- streams **MediaPipe Pose** landmarks (33 landmarks per frame) from the device camera
- detects **kick start/stop** with a lightweight heuristic (ankle separation while standing)
- buffers frames during the kick
- runs a kick-specific analyzer (**Roundhouse**, **Side Kick**, **Front Snap**) on the buffered history
- displays **human-readable feedback** and tracks stats (total kicks / good kicks, FPS)

The kick analysis logic in TypeScript is a port of the desktop reference implementation in `logic.py`, with additional work to make thresholds **scale with body size in the frame** (so the app behaves similarly when the user is closer/farther from the camera).

---

## 2) Tech stack & dependency versions

From `package.json`:

### Runtime

- **react-native**: `0.75.4`
- **react**: `18.3.1`
- **Pose landmarks provider**: `@thinksys/react-native-mediapipe` `^0.0.19`
- **Auth/backend**: `@supabase/supabase-js` `^2.103.2`
- **Auth session storage**: `react-native-encrypted-storage` `^4.0.3`
- **Polyfills**: `react-native-url-polyfill` `^3.0.0`

### Navigation (React Navigation v6)

- `@react-navigation/native` `^6.1.18`
- `@react-navigation/native-stack` `^6.11.0`
- `@react-navigation/bottom-tabs` `^6.6.1`

### RN infra libs

- `react-native-gesture-handler` `^2.20.2`
- `react-native-reanimated` `^3.15.5`
- `react-native-screens` `^3.35.0`
- `react-native-safe-area-context` `^4.14.0`

### Tooling

- **TypeScript**: `5.0.4`
- **ESLint**: `^8.19.0` (extends `@react-native`)
- **Jest**: `^29.6.3`
- **patch-package**: `^8.0.1` (used to patch Supabase auth bundle exports; see below)
- **Prettier**: `2.8.8`

Node engine: `>= 18`

---

## 3) App entrypoints (boot sequence)

### `index.js`

- imports:
  - `react-native-gesture-handler` (must be first for gesture handler)
  - `react-native-url-polyfill/auto`
- registers the root component with `AppRegistry` (`app.json` name)

### `App.tsx`

- wraps the app in `SafeAreaProvider`
- renders `<RootNavigator />` (the true top-level router)

---

## 4) Navigation architecture

This app uses React Navigation v6 and type-safe param lists defined in `src/types/index.ts`.

### Navigation types (`src/types/index.ts`)

- `RootStackParamList`: `{ Auth, MainTabs }`
- `AuthStackParamList`: `{ Login, SignUp }`
- `MainTabParamList`: `{ Dashboard, Camera, Profile }`
- Also contains early data shapes for training history:
  - `KickResult` (mode/leg/feedback/errors/timestamp)
  - `KickSession` (userId + aggregated stats + results)

### `src/navigation/RootNavigator.tsx`

Auth-gated root switch:

- Maintains `session: Session | null`
- On mount:
  - `supabase.auth.getSession()`
  - subscribes to `supabase.auth.onAuthStateChange(...)`
- Chooses which root stack screen to render:
  - authenticated (`!!session?.user`) → `MainTabs` (`AppTabs`)
  - not authenticated → `Auth` (`AuthStack`)

### `src/navigation/AuthStack.tsx`

Native stack:

- `Login` → `SignInScreen`
- `SignUp` → `SignUpScreen`

### `src/navigation/AppTabs.tsx`

Bottom tabs:

- `Dashboard` → `DashboardScreen`
- `Camera` → `CameraScreen`
- `Profile` → `ProfileScreen`

Notes:

- Tabs currently use simple emoji icons.
- `headerShown: false` is used throughout; screens self-render their own headers/branding.

---

## 5) Camera → landmarks → kick detection → analysis (core runtime flow)

The training loop is primarily implemented in:

- `src/screens/CameraScreen.tsx` (frame ingestion + state machine + UI)
- `src/engine/KickAnalyzer.ts` (analysis logic + thresholds)

### 5.1 Landmarks ingestion (MediaPipe)

`CameraScreen.tsx` renders:

- `<RNMediapipe ... onLandmark={handleLandmarks} />`

The `handleLandmarks` callback:

- accepts `data: any` from native; parses JSON if it’s a string
- extracts `points`:
  - `parsedData.landmarks` if present
  - else uses `parsedData` if it’s already an array
- requires `points.length >= 33` (MediaPipe Pose landmarks)

### 5.2 Tracking/visibility gate

Before any kick logic runs, we ensure the critical joints are reliably tracked:

- `isVisibleEnough(points)` from `KickAnalyzer.ts`
- Uses a visibility threshold (default `VISIBILITY_THRESHOLD = 0.6`) over a critical index set:
  - hips + ankles

If tracking is lost during recording, the app aborts the kick and resets buffers to avoid analyzing noisy frames.

### 5.3 Kick start/stop heuristic (fast gate)

This is a lightweight detector to decide when to start buffering kick frames.

In `CameraScreen.tsx`:

- Converts normalized landmarks into screen pixels using the window `width`/`height`.
- Computes:
  - ankle separation in Y: `diff = rightAnkleY - leftAnkleY`
  - “standing” heuristic: hips above knees (`hipsY < kneesY`)
  - dynamic ankle-separation threshold:
    - `kickSepPx = kickAnkleSeparationThreshold(points, w, h)`
- Start/continue kicking:
  - standing and `diff > kickSepPx` → left kick
  - standing and `diff < -kickSepPx` → right kick

### 5.4 State machine and buffering

State is kept in refs (to reduce render churn):

- `appState`: `'IDLE' | 'RECORDING'`
- `activeLeg`: `'Left' | 'Right' | null`
- `frameBuffer`: `Point[][]` (each entry is 33 landmarks)

Flow:

1. **IDLE → RECORDING** when a kick is detected.
2. **RECORDING**: each frame’s landmarks are pushed into `frameBuffer`.
3. When kicking stops:
   - copy `history = frameBuffer`
   - reset back to IDLE
   - if `history.length > MIN_FRAME_COUNT` → analyze
   - else show an “ignored noise” message

### 5.5 Analysis (KickAnalyzer)

`src/engine/KickAnalyzer.ts` exports:

- `analyzeRoundhouse(history, activeLeg, w, h)`
- `analyzeSideKick(history, activeLeg, w, h)`
- `analyzeFrontSnap(history, activeLeg, w, h)`
- `MIN_FRAME_COUNT` (currently 5)
- `JOINTS`, `Point`
- `kickAnkleSeparationThreshold(lm,w,h)` (scales by body metrics)
- `isVisibleEnough(points)`

Each analyzer returns:

- `AnalysisResult = { feedback: string[]; errors: string[] }`

The UI uses:

- `feedback` to display a list of feedback lines
- `errors.length === 0` as the definition of a “good kick”

#### How analyzers choose the “best frame”

They scan the buffered `history` and choose the frame with the maximum knee extension angle (hip–knee–ankle). Most checks are performed on that peak frame.

#### Scale-aware thresholds (important design detail)

The original desktop Python used hardcoded pixel thresholds. In TypeScript we compute **body metrics** per frame:

- `bodyMetrics(lm,w,h)` estimates:
  - `leg` (mean hip→ankle length in px)
  - `hipW` (hip distance in px)
  - `shoulderW` (shoulder distance in px)

Then thresholds are expressed as ratios (e.g. `R_KICK_ANKLE_SEP`) and multiplied by the current body metrics. This reduces sensitivity to camera distance.

---

## 6) Supabase integration (auth)

Supabase is currently used for **authentication** (email/password + email OTP verification). No database tables are currently referenced in the app runtime.

### 6.1 Credentials config

File: `src/config/env.ts`

- Exports:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

These are currently checked into source as constants. The repo’s `.gitignore` ignores `.env`; the comment indicates credentials may also exist in a local `.env` for dev, but the runtime code reads from `env.ts`.

### 6.2 Supabase client

File: `src/lib/supabase.ts`

- Creates `supabase` with:
  - `persistSession: true`
  - `autoRefreshToken: true`
  - `detectSessionInUrl: false` (important for native)

#### Session storage

`supabase.ts` implements a storage adapter:

- tries `NativeModules.RNEncryptedStorage`
- if missing/unlinked, falls back to an in-memory `Map`

Effect:

- auth will still work while the app is running
- but session will not persist across app restarts unless encrypted storage is available

### 6.3 Session gating

File: `src/navigation/RootNavigator.tsx`

- on mount: `supabase.auth.getSession()`
- subscribes: `supabase.auth.onAuthStateChange`
- routes user to the main app only when a session exists with `session.user`

### 6.4 Auth screens

File: `src/screens/SignInScreen.tsx`

- `supabase.auth.signInWithPassword({ email, password })`

File: `src/screens/SignUpScreen.tsx`

- Step 1: `supabase.auth.signUp({ email, password })`
- Step 2: verifies email with OTP:
  - `supabase.auth.verifyOtp({ email, token: code, type: 'signup' })`

### 6.5 Metro bundling patch for Supabase auth

File: `patches/@supabase+auth-js+2.103.2.patch`

- patches `@supabase/auth-js` exports to include explicit `.js` extensions for types/errors exports.
- applied via `postinstall: patch-package` in `package.json`.

---

## 7) UI system (theme + styling conventions)

Theme tokens:

- `src/theme/colors.ts` — dark-mode palette (background/surface/card + primary/accent/warning/error)
- `src/theme/spacing.ts` — spacing scale + border radii
- `src/theme/typography.ts` — `h1/h2/h3/body/caption/stat` styles
- `src/theme/index.ts` — barrel exports

Screens rely on consistent “premium” UI patterns:

- dark background (`colors.background`)
- card surfaces (`colors.card` + `colors.cardBorder`)
- bold typography + uppercase captions
- primary action button uses `colors.primary` and dark text (`colors.black`)

---

## 8) Screens overview (what each screen does today)

### `src/screens/CameraScreen.tsx`

Primary training screen. Responsibilities:

- requests camera permission via `requestCameraPermission()`
- renders the MediaPipe landmark stream view
- processes frames to detect kick start/stop
- buffers frames during kicks
- calls the selected analyzer function (roundhouse/side/front)
- shows HUD: mode badge, feedback list, kick stats, FPS, mode selector

### `src/screens/DashboardScreen.tsx`

Premium-styled placeholder dashboard:

- stat tiles (currently all hardcoded to `0` / `--`)
- “Recent Activity” empty state
- quick tips cards

### `src/screens/ProfileScreen.tsx`

Premium-styled placeholder profile/settings:

- shows dummy user (“KickFix User”)
- has “Sign In / Create Account” row (not wired yet)
- shows version and AI model strings

### `src/screens/SignInScreen.tsx`

Email/password login screen.

### `src/screens/SignUpScreen.tsx`

Account creation + OTP email verification flow.

### `src/screens/AuthScreen.tsx`

Present in the repo but not used in navigation (not in `AuthStack`). Appears to be an alternative/older scaffold.

### `src/screens/index.ts`

Barrel exports for screens.

---

## 9) Utilities

### `src/utils/permissions.ts`

Android camera permission request helper:

- Android: prompts for `CAMERA`
- iOS: returns true (native iOS permission strings must still exist in Info.plist)

---

## 10) Build and configuration

### TypeScript

- `tsconfig.json` extends `@react-native/typescript-config/tsconfig.json`

### Metro

- `metro.config.js` adds `.tflite` to Metro `assetExts` (model bundling support)

### Babel

- `babel.config.js` uses RN preset + `react-native-reanimated/plugin`

### ESLint

- `.eslintrc.js` extends `@react-native`

### Jest

- `jest.config.js` preset `react-native`

### Git ignore

- `.gitignore` ignores `node_modules/`, build outputs, `.env`, etc.

---

## 11) Android build notes

### `android/gradle.properties`

- `newArchEnabled=false`
- `hermesEnabled=true`
- architectures: `armeabi-v7a,arm64-v8a,x86,x86_64`

### `android/build.gradle`

Key versions:

- `compileSdkVersion = 35`
- `targetSdkVersion = 34`
- Android Gradle Plugin `8.6.0`
- Kotlin `1.9.24`

### `android/app/build.gradle`

- uses RN Gradle plugin + `autolinkLibrariesWithApp()`
- Hermes vs JSC selected based on `hermesEnabled`

---

## 12) Reference implementation

### `logic.py`

Desktop Python reference implementation of the kick analysis logic, used as the base for:

- `src/engine/KickAnalyzer.ts`

This file is not part of the mobile runtime, but is valuable for understanding original intent and validating logic parity.

