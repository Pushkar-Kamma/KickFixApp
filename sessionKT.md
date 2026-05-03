# KickFixApp — Session KT (Changes Made in This Chat)

This document captures **every clarification, decision, and code change** made during this development session. Read this alongside the original `codebaseKT.md` for full context.

---

## Part 1: Clarified Discrepancies (Original KT vs Reality)

These were ambiguities between the original `codebaseKT.md` / the owner's separate KT document and the actual codebase. All are now resolved.

### 1. Supabase Database Tables
- **Original KT said:** Tables not wired in app.
- **Clarification:** The `profiles`, `sessions`, and `kicks` tables **exist in the Supabase dashboard** and are fully deployed with RLS policies. They just weren't connected in app code.
- **Action taken:** Built the service layer and wired them (see Part 2).

### 2. Scoring System (0–100)
- **Original KT said:** No scoring exists, kicks are good/bad based on `errors.length === 0`.
- **Clarification:** Scoring needs to be built. For MVP, use a simple deduction model (start at 100, subtract per error). A more advanced scoring algorithm will be built later.
- **Action taken:** Added `computeScore()` and `ERROR_DEDUCTIONS` map to `KickAnalyzer.ts`.

### 3. Auth Flow (OTP vs Password)
- **Original KT said:** "6-digit OTP email flow, bypassing passwords."
- **Clarification:** Email + password is required for sign-in. OTP is used **only** for email verification during account creation. This is the intended flow. No changes needed.

### 4. App Tab Structure (Train vs Camera)
- **Original KT said:** 3 tabs: Dashboard / Train / Profile, with "Full Analysis" and "Normal Mode".
- **Clarification:** The full app restructure is planned but not yet implemented. Current tab is "Camera." The owner has a design plan for a complete UI rebuild (see Part 3 — UI decisions).

### 5. Resend Email Integration
- **Clarification:** Handled entirely within the Supabase platform. No app code needed. Domain: `kickfix.edstart.xyz`, sender: `dojo@kickfix.edstart.xyz`.

### 6. Expo vs React Native CLI
- **Clarification:** This is a **React Native CLI** project (not Expo). Uses Metro bundler. Expo tooling does not apply.

### 7. Supabase Credentials
- **Clarification:** Owner will get back on whether the hardcoded key in `src/config/env.ts` is real or placeholder. For now, it works.

### 8. Existing Screens
- **Clarification:** All UI screens will be rebuilt from scratch. Existing screens will be updated or replaced.

### 9. Sign Out
- **Clarification:** Will be added to the Profile page later. Also: on the same device, the user should stay logged in unless they explicitly sign out (session persistence via encrypted storage).

### 10. User Height (`height_cm`)
- **Clarification:** Use dynamic `bodyMetrics()` approach for now. User's actual height from the `profiles` table will be incorporated later for better accuracy.

---

## Part 2: Code Changes Made This Session

### 2.1 — TypeScript Types (`src/types/index.ts`)

**What changed:** Added Supabase table types to match the DB schema exactly.

**New types added:**
- `DbProfile` — matches `profiles` table (id, username, belt_level, created_at, height_cm)
- `DbSession` — matches `sessions` table (id, user_id, started_at, ended_at, total_kicks, good_kicks, bad_kicks, max_streak, kick_mode)
- `DbKick` — matches `kicks` table (id, user_id, session_id, created_at, kick_type, engine_data)
- `EngineData` — the JSONB shape stored in `kicks.engine_data` (score, feedback, errors, leg, peakAngle, kickMode)

**Modified types:**
- `KickResult` — added `score: number` field

### 2.2 — Scoring System (`src/engine/KickAnalyzer.ts`)

**What changed:** Added a deduction-based scoring system.

**New exports:**
- `computeScore(errors: string[]): number` — starts at 100, subtracts per error type
- `ERROR_DEDUCTIONS` — maps each error string to a point penalty

**Error penalties (current MVP weights):**
| Error | Deduction |
|---|---|
| Poor Extension | -20 |
| Low Kick | -15 |
| Bad Trajectory (Soccer Kick) | -15 |
| Low Knee | -15 |
| Dropped Guard | -10 |
| No Hip Turnover | -10 |
| Shin not horizontal | -10 |
| Standing Leg Too Bent | -10 |
| No Recoil (Leg Dropped) | -10 |
| Toes Pointing Up | -10 |
| Weak Chamber | -10 |
| Torso Dropped Below Hips | -10 |
| Knee Dropped During Extension | -10 |
| Excessive Lean | -10 |
| Toes Pointed (Danger) | -10 |
| Loose Chamber Fold | -10 |
| Tracking | 0 (no penalty) |
| Unknown errors | -10 (fallback) |

**Modified interface:**
- `AnalysisResult` — now includes `score: number` and `peakAngle: number`
- All three analyzers (`analyzeRoundhouse`, `analyzeSideKick`, `analyzeFrontSnap`) now return `score` and `peakAngle`
- All early-return tracking errors also return `score: 0` and `peakAngle: 0`

### 2.3 — Supabase Service Layer (NEW FILES)

Three new files created in `src/services/`:

**`src/services/profiles.ts`**
- `getProfile(userId)` — fetches a single profile by user ID
- `upsertProfile(userId, data)` — creates or updates a profile (username, belt_level, height_cm)

**`src/services/sessions.ts`**
- `createSession(userId, kickMode?)` — inserts a new session row with started_at and optional kick_mode
- `endSession(sessionId, stats)` — updates a session with ended_at + final stats (total_kicks, good_kicks, bad_kicks, max_streak)
- `getRecentSessions(userId, limit)` — fetches recent sessions ordered by started_at desc
- `getSessionStats(userId)` — aggregates all session data for a user (totalKicks, goodKicks, badKicks, bestStreak, sessionCount)

**`src/services/kicks.ts`**
- `saveKick(userId, sessionId, kickType, engineData)` — inserts a kick row with full engine_data JSONB
- `getKicksForSession(sessionId)` — fetches all kicks for a given session
- `getRecentKicks(userId, limit)` — fetches recent kicks for a user

### 2.4 — CameraScreen Wired to Supabase (`src/screens/CameraScreen.tsx`)

**What changed:** CameraScreen now persists training data to Supabase.

**New imports added:**
- `EngineData` from types
- `supabase` from lib
- `createSession`, `endSession` from services/sessions
- `saveKick` from services/kicks

**New refs added:**
- `sessionId` — holds the current Supabase session row ID
- `userId` — holds the authenticated user's ID
- `currentStreak` — tracks consecutive good kicks
- `maxStreak` — tracks the best streak in the session
- `badKicks` — tracks bad kick count
- `totalKicksRef` / `goodKicksRef` — mirror state values in refs for cleanup function access

**Lifecycle changes:**
- **On mount:** Gets auth session → creates a new `sessions` row in Supabase → stores `sessionId` and `userId`
- **After each kick analysis:** 
  - Displays `Score: X/100` as the first feedback line
  - Tracks streaks (resets on bad kick, records max)
  - Fires `saveKick()` to persist the kick with full `EngineData` to Supabase (fire-and-forget)
- **On unmount:** Calls `endSession()` with final stats (total_kicks, good_kicks, bad_kicks, max_streak)

### 2.5 — Supabase Schema Update

**Column added to `sessions` table:**
- `kick_mode` (text, nullable) — stores which kick mode the session was trained in

**Done via SQL in Supabase dashboard:**
```sql
ALTER TABLE sessions ADD COLUMN kick_mode text;
```

### 2.6 — RLS Policies (Verified, No Changes)

All three tables have RLS enabled with ALL-command policies:
- `kicks` — "Users can manage their own kicks" (ALL, public)
- `profiles` — "Users can manage their own profile" (ALL, public)
- `sessions` — "Users can manage their own sessions" (ALL, public)

---

## Part 3: UI / Theme Decisions

### 3.1 — Color Scheme Selected: Red + Black + White (Theme A)

**Final palette (`src/theme/themeOptions.ts`):**
```
Background:      #0A0A0A (near black)
Surface:         #1A1A1A (cards/containers)
Surface Light:   #242424 (elevated surfaces)
Card:            #1A1A1A
Card Border:     #2A2A2A

Primary:         #E53935 (strong red)
Primary Dim:     #B71C1C (pressed states)
Primary Tint:    rgba(229,57,53,0.12) (subtle red fill for secondary buttons)
Primary Tint Border: rgba(229,57,53,0.30)

Accent/Success:  #4CAF50 (green — good kicks)
Warning:         #FFB300 (amber — mid scores)
Error:           #FF1744 (bright red — errors)

Text Primary:    #FFFFFF
Text Secondary:  #A0A0A0
Text Muted:      #666666

Score Good:      #4CAF50
Score Mid:       #FFB300
Score Bad:       #FF1744
```

**Design decisions:**
- No glow effects on cards (tested, rejected)
- No warm-tinted greys (tested, rejected — keep neutral grey cards)
- Secondary buttons use red-tinted fill (`primaryTint`) instead of hollow outline
- Score colors: green (80+), amber (50-79), red (below 50)

### 3.2 — Custom Fonts Installed

**Fonts added to `assets/fonts/` and linked via `react-native-asset`:**

| File | Usage |
|---|---|
| `Montserrat-Black.ttf` | Training scores (96pt+), page titles |
| `Montserrat-ExtraBold.ttf` | H1 headings, stat numbers |
| `Montserrat-Bold.ttf` | Primary buttons |
| `Montserrat-Regular.ttf` | Available for lighter headings |
| `Oswald-Bold.ttf` | H2/section headers, mode selector, captions |
| `Oswald-Regular.ttf` | Muted captions, labels |
| `Inter_24pt-Regular.ttf` | Body text |
| `Inter_24pt-Medium.ttf` | Labels, secondary text |
| `Inter_28pt-Bold.ttf` | Feedback text, kick details |

**Font linking config (`react-native.config.js`):**
```js
module.exports = {
  project: { ios: {}, android: {} },
  assets: ['./assets/fonts'],
};
```

Fonts are copied to `android/app/src/main/assets/fonts/` via `npx react-native-asset`.

**Usage in code:** Reference by filename minus `.ttf`:
```js
fontFamily: 'Montserrat-Black'
fontFamily: 'Oswald-Bold'
fontFamily: 'Inter_24pt-Regular'
```

### 3.3 — Font Size Strategy (Two Distance Modes)

| Element | Normal (1ft) | Training (6ft) |
|---|---|---|
| H1 (screen titles) | 32-36pt Montserrat ExtraBold | N/A |
| H2 (section headers) | 24-28pt Oswald Bold | N/A |
| Body/P | 16pt Inter Regular | N/A |
| **Score** | N/A | **96-120pt Montserrat Black** |
| **Feedback** | N/A | **28-32pt Inter Bold** |
| **Kick count** | N/A | **48pt Montserrat ExtraBold** |

---

## Part 4: Temporary State (Revert Before Building)

### App.tsx is temporarily pointed at ThemeCompare

`App.tsx` currently renders `<ThemeCompare />` instead of `<RootNavigator />` for theme previewing. **This must be reverted before building real screens:**

```tsx
// Current (TEMPORARY):
import ThemeCompare from './src/screens/ThemeCompare';
// ...
<ThemeCompare />

// Revert to:
import { RootNavigator } from './src/navigation';
// ...
<RootNavigator />
```

### Files to clean up:
- `src/screens/ThemeCompare.tsx` — delete after theme is finalized
- `src/theme/themeOptions.ts` — migrate chosen Theme A colors into `src/theme/colors.ts`, then delete this file

---

## Part 5: What's Still NOT Built

| Feature | Status |
|---|---|
| Sign out | Not wired (add to Profile screen) |
| Profile creation after signup (onboarding) | Not built (`SetupProfileScreen`) |
| Forgot password flow | Not built |
| Dashboard pulling real data | Not built (service functions exist, UI not wired) |
| Profile screen showing real user data | Not built |
| Full UI rebuild (all screens) | Not started — owner has design sketches ready |
| `src/theme/colors.ts` update with Theme A | Not done yet (still using old cyan theme) |
| `src/theme/typography.ts` update with custom fonts | Not done yet |
| Training mode dual-distance UI | Not built |
| `AuthScreen.tsx` | Dead code — still exists but unused |
