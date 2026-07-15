# KickFix — BRAINDUMP (research • engagement • execution log)

> **What this file is:** a single, exhaustive working document — research, decisions, a step-by-step execution log, engagement/retention design, and future ideas. It is deliberately verbose. `expansion.md` is the *formal plan*; this is the *lab notebook*. Update it continuously.
>
> **Prime directives (from the owner):** quality and accuracy over speed; replicate a master's presence; be honest about sensor limits; commit at every step; cross-check everything with a team of agents; take inspiration from Duolingo-style retention; be safe.

---

## 0. TL;DR of where things stand

- **Shipped this session (branch `KickFix_Without_Login`, all validated: `tsc` clean, 53/53 logic tests, release AAB `BUILD SUCCESSFUL`):**
  - `expansion.md` v0.2 — the master plan, corrected after a two-agent review.
  - Reviewer **agent team**: `pose-cv-reviewer`, `qa-adversary` (+ existing `rubber-duck`).
  - **Phase 0 engine** (the real fix for "side kick scores as a front snap"): `primitives.ts`, `filters.ts`, `techniqueGate.ts`, `segmentation.ts` + 27 tests.
  - Gate **wired into `CameraScreen`** behind a default-off flag (`TECHNIQUE_GATE_ENABLED`).
- **Not built (honestly gated):** all forms Chon-Ji→Choong-Moo (need instructor-verified sequences + device tuning), hand-shape blocks (need a hand-landmark binding — pose gives only the wrist), tutorial links (need live web verification), IMU speed (needs hardware). See §7.
- **Tomorrow's job (owner + agent):** calibrate the gate thresholds on labeled clips, then flip the flag. See §8 calibration checklist.

---

## 1. Execution log (every step)

| When | Step | Commit | Validation |
|---|---|---|---|
| session start | captured run start time to `_run_start.txt` | — | — |
| — | Deep-dive: engine grounding + CV/biomech research (2 subagents) | — | reports read in full |
| — | Wrote `expansion.md` v0.1 | (in b3cc59f) | — |
| — | Two-agent review (CV/biomech + adversarial QA) found 2 blockers + majors | — | reports read |
| — | Corrected plan → `expansion.md` v0.2 (Appendix A maps every finding→fix) | b3cc59f | — |
| — | Created reviewer agents; resolved model labels (Opus 4.8 / GPT-5.6 Sol) | b3cc59f | pushed |
| — | Built `primitives.ts` (foundation contracts) | 99851df | — |
| — | Built `filters.ts` (One-Euro + fixed-Δt resample) | 99851df | tests |
| — | Built `techniqueGate.ts` (z-free rotation, direct-normalization gate) | 99851df | tests |
| — | Built `segmentation.ts` (5-phase + fallbacks) | 99851df | tests |
| — | 27 unit tests (filters/gate/segmentation) | 99851df | 27/27 pass |
| — | Wired gate into `CameraScreen` behind flag + `modeConfusions` telemetry | 54814b4 | tsc + 53 tests + release AAB |
| — | This brain-dump + engagement engine | (pending) | — |

**Rule:** each engine module is *pure* (no React/Native imports) so it unit-tests without a device and can be reviewed by agents.

---

## 2. Research digest — the core diagnosis (why the app misjudged kicks)

The three analyzers each estimate **P(well-executed | technique = X)** but never **P(technique = X | motion)**. The score is a *conditional quality* that assumes technique identity is already correct — nothing tested that assumption. Front and side kicks overlap on ~70% of criteria, and hip-shoulder alignment was only a *minor* (−4) penalty, so a clean side kick scored as a decent front snap.

**Fix philosophy:** a gate that estimates identity, kept **separate** from quality. Recognition decides *accept / redirect / reject*; the analyzer only runs on accepted motion. This is now built (`techniqueGate.ts`).

### 2.1 Discriminative features (what actually separates the kicks)
- **Hip rotation** ⭐ — front hips stay square; side rotates a lot; roundhouse moderate + support-foot pivot. **Computed z-free** by reusing the app's existing image-hip-width foreshortening ratio (`acos(minPeak/baseline)`), because BlazePose world-Z is unreliable exactly where the rotation happens.
- **Trajectory plane** ⭐ — front = vertical-dominant image motion; side = lateral-dominant; round = horizontal arc. Computed from **image x/y extents** (robust), world-Z only a weak tiebreak.
- **Shin angle at peak**, **support-foot pivot** (jittery → low weight/often unobservable), **chamber shape**.

### 2.2 Honest sensor limits (never violate)
- **No absolute speed (m/s), force (N), power (W), or impact** from one camera. Depth/scale are *estimated*; motion toward/away from the camera is systematically wrong; there is no mass or contact model. → Only **relative indices** (angular velocity deg/s, a 0–100 Speed Index) unless a wearable IMU is added.
- **World-Z is a learned estimate** — worst when limbs point at/away from camera. Prefer image-plane or gravity-corrected formulations.
- **Feet/hands are the jitteriest landmarks** — gate features that depend on them must degrade to `unobservable`, never a confident fail.
- **Pose-only = wrist is the most distal hand point** — knife-hand vs spear-hand vs fist are *undetectable* without hand landmarks.

### 2.3 Beyond MediaPipe (verdict)
Keep BlazePose-3D; use it better. Materially-helpful augmentations only: **Holistic/Hand landmarks** (hand techniques — needs a binding, VERIFY), **wearable IMU** (honest speed/power), **multi-view rig** (internal ground-truth/exemplars). MoveNet/YOLO/RTMPose are not worth the switch.

---

## 3. Engagement & retention — a Duolingo-grade system (ethical)

Goal: make daily practice *inevitable and joyful* without dark patterns or punishing rest/injury. Duolingo's engine is a stack of well-studied loops; here is each mechanic, why it works, and the **KickFix adaptation**.

### 3.1 The core loop
`Open → clear daily goal → short focused session → immediate feedback + visible progress → reward + streak advance → tease tomorrow → notification pulls back.` Every element below feeds this loop.

### 3.2 Mechanics → KickFix mapping

| Duolingo mechanic | Why it works (behavioral basis) | KickFix adaptation |
|---|---|---|
| **Streaks** | Loss aversion + habit chaining; the number becomes identity ("I'm on a 200-day streak"). | Daily **training streak**. Advance when the day's goal is met (already partially built via `goals` service). **Injury/rest-safe:** streak *freezes* + "rest day" that doesn't break it. |
| **Streak freeze / repair** | Removes the fear that one missed day destroys months → paradoxically increases retention. | Earnable **Streak Freeze** (auto-consumes on a missed day) + a limited **weekend/rest pass**. Never sell guilt. |
| **XP + levels** | Continuous, always-available progress signal; every rep "counts". | **XP per kick** scaled by score + difficulty + novelty; **level curve** with satisfying early wins. (Built pure in `engagement.ts`.) |
| **Daily goal ring** | Small, concrete, attainable commitment device. | Adjustable daily goal (e.g. 20 quality kicks / 10 min). Casual→Serious tiers. |
| **Leagues / leaderboards** | Social comparison + weekly reset gives everyone a fresh shot. | Weekly **leagues** (promotion/relegation) on XP — **not** raw score (anti-cheat, see expansion §13). Friends leaderboard already exists as a base. |
| **Skill tree / path** | Clear sense of journey + "what's next"; unlocks dopamine. | **Belt-progression path** mirroring real ITF curriculum: white→yellow→…; each node = a technique/form to master. Ties gamification to genuine skill. |
| **Hearts / energy** | Scarcity raises the value of each attempt (controversial — can frustrate). | **Avoid punitive hearts.** Instead a positive "focus meter." Practice is unlimited; scarcity only for *ranked* attempts if ever. |
| **Celebrations / mascot** | Emotional payoff; personality builds attachment. | **Master persona** (the coach) gives spoken praise + a signature celebration on a personal best. Reuse TTS from the forms coach. |
| **Variable reward** | Intermittent reinforcement (chests, combos) sustains engagement. | **Personal-best fanfare**, surprise "technique of the day", milestone badges. Keep honest — reward effort/consistency, not just outcome. |
| **Smart notifications** | Timely re-engagement at the user's habitual slot. | Local notifications at the user's usual practice time; **decay/stop if ignored** (no nagging). "Your streak is safe until midnight" only when truly at risk. |
| **Progress stats / review** | Competence visibility; shows the graph going up. | Weekly recap: kicks, best speed index, most-improved criterion, streak. Uses data already captured in `engineData`. |
| **Weakness targeting (Duolingo "mistakes")** | Spaced repetition of exactly what you're bad at. | Use the per-criterion pass/fail already stored to build a **"work on this"** queue (e.g. "your chamber height fails 60% of the time → drill it"). High value, uses existing data. |

### 3.3 Ethical guardrails (explicit)
- Never break a streak due to injury/rest — provide freezes and rest days.
- No pay-to-win on skill scores; monetize cosmetics/coaching depth, not correctness.
- Notifications decay when ignored; no guilt-tripping copy.
- Leaderboards must be cheat-resistant or labeled "recreational" (expansion §13).
- Rewards celebrate **consistency and effort**, not only high scores (a beginner improving must feel great).

### 3.4 What I can build now vs later
- **Now (pure logic, safe, tested):** XP/level curve, streak state machine (with freeze + rest day), daily-goal computation, weakness-queue selection. → `src/engine/engagement.ts` + tests.
- **Later (needs UI/backend/device):** notification scheduling, leagues table + weekly reset job, belt-path screen, celebration animations, recap screen. Scaffold designs live here; wiring is a normal feature task.

---

## 4. Additional feature ideas & future roadmap (prioritized)

**Tier 1 — high value, uses data we already have, mostly safe to build incrementally**
1. **Weakness-targeted drills** — mine per-criterion failures → personalized drill queue (spaced repetition). *Coaching gold; near-zero new sensing.*
2. **Progress dashboards & recaps** — trend the Speed Index, criteria pass-rates, streak. *Competence visibility.*
3. **Engagement engine** (§3.4) — XP/streak/goals/levels.
4. **Master persona voice** — consistent spoken coach (praise + one correction), shared with the forms coach.

**Tier 2 — new sensing/logic, buildable pose-only, needs device tuning**
5. **Straight punches** (motion + reaction-hand-to-hip ITF check).
6. **Block zones + stances + head-yaw** (pose-only subset of the ITF block set).
7. **Combos** (chosen + random) once single-technique detection is trustworthy.
8. **Shadow / follow-along mode** — skeleton demo you mirror; the forms-coach primitive.

**Tier 3 — flagship, gated on external inputs**
9. **Forms (tuls) coach** — learn/practice/test; needs instructor-verified sequences + device tuning.
10. **Hand-shape techniques** (knife-hand, spear-hand, inner/outer) — needs a hand-landmark binding.
11. **Wearable IMU** — honest speed/power.
12. **Multi-user/social** — leagues, async duels/challenges, clips sharing (with anti-cheat).

**Tier 4 — exploratory**
13. **TCN classifier** for technique ID + quality (highest ceiling; needs labeled data + TFLite).
14. **AR overlay corrections**, **Apple Watch/HR**, **multi-view exemplar rig**.

---

## 5. Decisions & assumptions log (so tomorrow is unambiguous)
- **Branch:** all work on `KickFix_Without_Login`; nothing shipped to production. Live app on Play Store is untouched (gate flag default off).
- **Standard:** ITF via the Encyclopedia of Taekwon-Do; first form target = **Chon-Ji** (assumption — confirm "keybone" = Saju/Kibon vs Chon-Ji).
- **Hands scope:** ship **pose-only** value first; defer hand-shape techniques until a binding is verified.
- **Speed:** **relative Speed Index only**, no absolute units, unless an IMU is added.
- **Thresholds:** every numeric boundary in `techniqueGate.PRIORS` / `segmentation` is a **prior**, isolated for calibration; logic is final, numbers are not.
- **Model labels (resolved):** `Claude Opus 4.8 (copilot)`, `GPT-5.6 Sol (copilot)` are the real selectable names.

---

## 6. Calibration checklist for tomorrow (owner + agent)
1. Record **labeled clips**: ≥ (aim 50+) per technique — front / side / round — across body size, camera distance/angle, lighting, kicking side, and fps. Keep **calibration and test sets disjoint** (different sessions/people). *30 is not enough for a small false-accept claim (≈3/n → ~10% at n=30).*
2. Feed clips through `runTechniqueGate` (add a tiny dev harness) and inspect `features` + `distribution` + `outcome`.
3. **Estimator bake-off first:** confirm z-free hip-rotation beats world-Z on your clips (variance) before tuning any threshold.
4. Tune `PRIORS` (logistic centers/scales) + `GATE_PRIORS` (τ_accept, margin, coverage) to hit: high wrong-mode rejection, high valid-beginner acceptance, calibrated confidence.
5. Verify **fps invariance** (same clip at 15/24/30/60 → same identity, score Δ ≤ ~3).
6. Flip `TECHNIQUE_GATE_ENABLED = true`; device soak-test the accept/redirect UX.
7. Then add **redirect one-tap re-score** UI (all three analyzers already exist).

---

## 7. Why the big features aren't built yet (honest walls)
- **Forms:** engine is buildable; the *authoritative move-by-move sequences* must be instructor-verified (wrong data drills students into errors) + turn/occlusion thresholds need a device.
- **Hand-shape blocks/strikes:** pose gives only the **wrist** — finger shape is not in the data; needs a hand-landmark source (binding VERIFY / native module).
- **Tutorial links:** cannot fabricate URLs; needs a live web-verification pass from credible ITF sources.
- **IMU speed/power:** physics — one camera can't measure force/absolute m/s; needs a BLE wearable.

---

## 8. Verification backlog (carried from expansion.md §15)
Hand-landmark binding? · exact world-axis convention of the binding · foot-landmark reliability · all angle thresholds · ITF sequences · SPARC validity · One-Euro cutoff vs peak preservation · fps equivalence after resample · confidence calibration · IMU feasibility.

---

## 9. Agent team & recheck protocol
`Explore` (ground) → `rubber-duck` (implement, validate each change) → `pose-cv-reviewer` (CV/biomech correctness, honesty) → `qa-adversary` (false-accept/reject, fps, occlusion, races, persistence). Nothing is "done" until both reviewers sign off and the suite is green. This document + `expansion.md` are updated as milestones land.
