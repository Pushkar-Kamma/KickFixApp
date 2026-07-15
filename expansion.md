# KickFix Expansion Plan — Master-Level ITF Taekwon-Do Coach

> **Status:** Planning document. Version 0.2 — 2026-07-14. (v0.2 incorporates a two-agent CV/biomech + adversarial-QA review; see **Appendix A**.)
> **Owner:** Pushkar. **Author:** engineering agent + reviewer team.
> **Scope:** Turn KickFix from a 3-kick analyzer into a production-grade ITF Taekwon-Do coaching platform: fix technique confusion, deepen kick analysis, add hand techniques (punches + blocks), combinations, and voice+skeleton-guided forms (tuls) — with feedback that *aims toward* the specificity of a master watching a student, validated against blinded instructor agreement rather than asserted.
> **Prime directive:** **Quality and accuracy over speed and quantity.** Every technique, every move, every criterion must be justified, calibrated, and validated. If a thing cannot be measured honestly from the available sensors, it is not scored — it is labeled **`unobservable`**. Recognition (what technique is this?) is always separated from quality (how good was it?).

---

## 0. How to read this document

This plan is organized as **phases** that ship independently and build on each other. Each phase has: **Goal**, **Design** (files, data structures, algorithms), **Criteria** (what "correct" means), **Agent assignments** (who builds / who rechecks), **Validation** (how we prove it works), **Definition of Done**, and **Commit points**.

Two hard rules apply everywhere:
1. **Nothing is model-generated that must be authoritative.** ITF pattern sequences, stance definitions, and technique correctness standards come from an **authoritative source (Encyclopedia of Taekwon-Do / the student's federation) and are instructor-verified**. Agents never invent a form's moves.
2. **Every landmark is accounted for per technique per camera view.** A criterion may only *fail* when its required joints are actually observable; otherwise it returns `unobservable` and does not deduct points.

---

## 1. The multi-agent team (roles, models, recheck protocol)

We build with a **team of agents that cross-check each other**. Agent definition files live in `.github/agents/`.

| Agent | File | Role | Preferred model (fallback order) |
|---|---|---|---|
| **Rubber Duck** | `rubber-duck.agent.md` | Primary implementer + reasoning partner. Makes focused edits, validates after every change. | GPT-5.6 → GPT-5.4 |
| **Pose CV Reviewer** | `pose-cv-reviewer.agent.md` | Skeptical CV/biomech auditor. Checks coordinate spaces, landmark reliability, thresholds, false-accept risk, honesty of accuracy claims. | Claude Opus 4.8 (1M) → GPT-5.6 → Opus 4.7 → GPT-5.4 |
| **QA Adversary** | `qa-adversary.agent.md` | Red-teams every feature: false-accepts, false-rejects, fps variance, occlusion, races, persistence. Produces test matrices. | GPT-5.6 → Opus 4.8 → GPT-5.4 |
| **Explore** | (built-in) | Read-only codebase grounding for each task. | — |

> **Model-label caveat:** the exact registered model identifiers in this environment must be confirmed. The `.agent.md` files use fallback arrays so the picker resolves the strongest available. If "Claude Opus 4.8 (1M)" / "GPT-5.6 Sol" are not selectable by those literal names, update the `model:` arrays once the correct labels are known. **Verify.**

### 1.1 The recheck protocol (mandatory per change)
Every non-trivial change follows this loop:
1. **Explore** grounds the change in current code (read-only).
2. **Rubber Duck** implements the smallest correct edit and runs the narrowest test (tsc → unit → build).
3. **Pose CV Reviewer** audits correctness (math, coordinate space, thresholds, honesty).
4. **QA Adversary** designs adversarial cases and confirms they pass or documents the gap.
5. Rubber Duck fixes review findings; re-run tests.
6. **Commit + push** with a message referencing the phase and the reviewers' sign-off.

No feature is "done" until Pose CV Reviewer and QA Adversary both sign off and the automated suite is green.

### 1.2 Definition of Done (applies to every phase)
- `npx tsc --noEmit` clean.
- New unit tests for all pure logic (fixtures from recorded/synthetic landmark sequences).
- Release AAB builds successfully.
- Reviewer agents' findings resolved or explicitly deferred with rationale.
- Thresholds documented in `THRESHOLDS.md` with a calibration note (data source or "heuristic prior — pending calibration").
- Committed and pushed; revertable.

---

## 2. Guiding principles (the "master's presence" bar)

A master watching a student does four things our system must emulate:
1. **Recognizes the technique** ("that was a side kick, not a front snap") — *identity before quality*.
2. **Judges the whole motion**, not a snapshot — chamber, execution, retraction, recovery, and their timing.
3. **Gives one prioritized, specific correction** ("higher chamber", "turn your hips", "look before you turn").
4. **Is honest** about what they can and cannot see, and adapts feedback to the student's level.

Design consequences:
- **Identity gate first, quality second.** (Phase 0.)
- **Temporal, phase-aware analysis** over single frames. (Phase 0.)
- **One highest-priority observable correction**, never a wall of errors.
- **Never claim what the camera cannot measure** (no Newtons, Watts, or absolute m/s — see §11).
- **Observed vs unobserved is a first-class result state.**

---

## 3. Current-state grounding (verified against the code)

**Engine:** `src/engine/biomech.ts` (types, `angle3D`, `deriveScalar/Vec3`, `frameUsable`, `detectKickingLeg`) + three analyzers (`FrontSnapAnalyzer.ts` 19 criteria, `SideKickAnalyzer.ts` 13, `RoundhouseAnalyzer.ts` 13). Each returns a unified `KickResult` and scores `100 − Σ severity-weight(failed)`. `CameraScreen.tsx` captures frames and dispatches by `kickMode` route param.

**Confirmed root problems:**
- **Mode confusion (false-accept):** `CameraScreen.tsx` dispatch (`kickMode === 'Side Kick' ? analyzeSideKick(...) : ...`) selects an analyzer **without verifying the motion matches**. Each analyzer only measures quality-given-technique. Side and front kicks overlap on ~70% of criteria, so a clean side kick scores as a decent front snap. Hip-shoulder alignment is a **minor** penalty (−4), not a gate. **No technique classifier exists.**
- **Under-use of frames:** 20–60 frames captured (`PRE_ROLL=5`, `POST_END_TRAIL_FRAMES=10`, `MAX_KICK_FRAMES=120`), but scoring collapses to **2 single frames** (peak = min ankle-Y; chamber = min knee-angle before peak) plus ~5 multi-frame velocity/ratio criteria. Rich temporal structure is discarded.
- **No smoothing:** raw landmark stream feeds feature extraction; peaks and derivatives are noisy.

**Assets we can build on:** full 33-landmark image + world buffers are already persisted compactly (`CompactFrame`, `kick_frames` table, ~25 KB/kick) — enough to support phase segmentation, DTW, and future ML **without re-capture**.

---

## 4. Beyond MediaPipe — options and verdict

Honest tradeoffs for on-device React Native (RN 0.75, `@thinksys/react-native-mediapipe@0.0.19`, **pose-only**, wrist is the most distal hand landmark).

| Option | Integrable now? | Materially helps? | Verdict |
|---|---|---|---|
| **BlazePose GHUM 3D world landmarks** (in use) | ✅ | ✅ right primitive | **Keep; use better.** Z is a learned estimate — worst when limbs point at/away from camera. Do not treat "meters" as calibrated. |
| **MoveNet Thunder** | ✅ (TFLite) | ❌ | Downgrade: 17 2D keypoints, no world-3D, no foot points. Only a possible 2D fallback. |
| **MediaPipe Holistic / Hand Landmarker** | ⚠️ not in current binding | ✅✅ for hands | **The key augmentation** for knife-hand, spear-hand, fist/palm, inner/outer block, fine gaze. **VERIFY** a maintained RN binding exposes hands, or scope a native module. Hands track worst under fast motion + occlusion (exactly punches). |
| **YOLO-Pose / RTMPose / MMPose** | ⚠️ heavy, native | marginal here | High risk, low ROI vs BlazePose-3D. **VERIFY** binding before considering. |
| **Multi-view (2+ phones)** | ⚠️ sync/calibration | ✅ resolves depth | **Use as an internal reference-building + validation rig, not a shipped feature.** Builds trustworthy DTW exemplars. |
| **Wearable IMU (shin/wrist, BLE)** | ✅ `react-native-ble-plx` | ✅✅ real speed/power | **Only honest path to true kinematics.** Optional "pro" add-on; pairing + video-sync UX cost. |
| **Depth / LiDAR** | ❌ | would help | Not now — narrow devices, no pipeline. |
| **Recording-phone IMU** | ✅ | ❌ (measures phone) | Only to reject shaky recordings. |

**Materially-helpful set:** Holistic (hands), wearable IMU (speed/power), multi-view (ground truth). Everything else is not worth the switch cost. **Verification backlog** in §15.

---

## 5. PHASE 0 — Accuracy foundation (existing-feature fixes)

**This is the highest-priority phase and directly answers your two problems.** It ships before any new technique.

### 5.0 Deliverables (ordered milestones — corrected after review, Appendix A)
- **M0.0 Streaming capture + timestamp foundation** — replace frame-count windows with **monotonic-timestamp, millisecond** windows; onset/exit hysteresis; **resample to a fixed Δt**; declared 15/24/30/60/variable-fps tolerances. (The current `PRE_ROLL=5`/`MAX=120`-frame and `KNEE_VEL_ONSET=0.06/frame` logic changes meaning across fps and must go.)
- **M0.Foundation contracts** — `PrimitiveEvent`, result/coverage/confidence states, observability model — **before any new technique** so recognition is never coupled to scoring.
- **M0.1 One-Euro smoothing** on the landmark stream (at fixed Δt).
- **M0.2 Technique identity gate** (fixes mode confusion) with **corrected math** + reject/redirect policy; **recognition separated from score**.
- **M0.3 5-phase segmentation** with explicit degenerate-case fallbacks.
- **M0.4 DTW-to-exemplar** similarity (shape-only; never feeds a quality score).
- **M0.5 Responsible speed *index*** (relative; `null` when unsupported).
- **M0.6 Calibration + validation harness** (held-out cohorts; correct statistics).

### 5.0.1 Coordinate frame & observability (foundations for every feature)
- **World axes are camera-aligned, not gravity-aligned** (y-down, z-depth, hip-centered). Every "ground plane = x–z / vertical = y / shin-horizontal" test silently assumes a level phone. **Estimate camera tilt** (recording-phone IMU, or a stance-frame gravity proxy) and level the frame before any azimuth/horizontal test, **or** use gravity-independent image-plane formulations. State **image-vs-world space per feature**.
- **BlazePose world-Z is a learned estimate**, worst when limbs point toward/away from camera. **Never build a discriminator whose signal lives in Z.**
- **Observability, not failure:** each feature declares the exact landmarks it consumes; if any is below the visibility/presence floor it returns **`unobservable`** — it never throws and never scores the standing frame. `lmReq` currently *throws* and `frameUsable`'s CRITICAL set excludes distal joints (heel/foot-index/wrist/nose), so add **per-feature** observability for those.
- **Front-camera degeneracy:** the app uses the selfie camera; a front snap *toward* the camera moves almost entirely in depth (near-zero image motion, worst Z). That is an **`unsupported_view`** outcome, not a forced classification.

### 5.1 Fix the mode-confusion bug — technique identity gate (corrected)

**New module: `src/engine/techniqueGate.ts`** (pure, unit-testable, no UI).

**Discriminative features** — formulated to avoid world-Z where the signal lives:

| Feature | Definition (space) | Front snap | Side kick | Roundhouse |
|---|---|---|---|---|
| **Hip rotation** ⭐ | **reuse the shipping z-free estimator**: image hip-width foreshortening ratio `minPeak/baseline → acos → deg` (already in Side/Round analyzers); use **magnitude `|Δ|`** (sign-invariant to kicking leg) | small (hips square) | large | moderate |
| **Trajectory plane** ⭐ | kicking foot path from **image x/y extents** (robust); world-Z range only a low-weight tiebreaker | vertical-dominant (image y) | lateral-dominant (image x) | horizontal arc (+ support pivot) |
| **Shin angle at peak** | knee→ankle vs horizontal, **tilt-corrected**, image-plane where possible | steep | extended/lateral | ≈ horizontal |
| **Support-foot pivot** | heading change heel→foot-index (⚠ jittery distal joints — **low weight, `unobservable` if untracked**) | ~0° | moderate | large |
| **Chamber shape** | thigh direction vs pelvis facing at chamber (tilt-corrected) | knee at target | knee abducted | knee cocked to side |

⚠ **All numeric boundaries are priors on an estimator pending selection.** The estimator (z-free vs fused) is chosen from a **variance bake-off on labeled clips before** any threshold is tuned — fixing a number on a biased feature only moves the error.

**Algorithm (Option A — heuristic gate, recommended first):**
1. Compute features on the smoothed, tilt-corrected segment; each yields a membership ∈ (0,1) **and** an observability flag.
2. Per technique `k ∈ {front, side, round}`, geometric-mean the **observable** memberships. If identity **coverage** (fraction of discriminative features observable) < floor → return **`uncertain`/`unsupported_view`**, no forced class.
3. **Normalize directly to a distribution — do NOT softmax the memberships.** (Softmax over (0,1) values makes any ≥0.6 accept region empty: a perfect one-hot gives only `e/(e+3)=0.475`.) Use `P_k = m_k / Σ_j m_j`, with **`other/junk` = `1 − max plausibility`** folded in so `Σ=1`. Optionally temperature-scale for calibration.
4. `confidence = P₁`, `margin = P₁ − P₂`. **Defaults are re-derived after this formula change and calibrated on data**, not carried from the softmax version.

**Policy layer (recognition ≠ quality; runs in the finalize path before scoring/persist):**
- **Persist `requested`, `detected`, and `scored` identities separately.** A recognized-but-poor attempt is a **failed attempt with one correction**, not a silent discard.
- **The old "cap score ≤ 40" (Option C) is rejected** — a 40 is swallowed by the existing `score < 45` silent-discard in `CameraScreen`, hiding the verdict. **Detection is a separate enum outcome**, surfaced regardless of score.
- Emit a quality score **only if** `detected == requested` **and** `P(selected) ≥ τ_accept` **and** `margin ≥ m` **and** coverage ≥ floor.
- **Wrong technique, high confidence →** *redirect*: "That looked like a **Side Kick** — score it as Side Kick?" one-tap re-run (all three analyzers exist).
- **Low confidence / other / low margin / low coverage / `unsupported_view` →** *reject with reason* (no score; bump `telemetry.modeConfusions`). This rejects only **unrecognized** motion — it must not discard a recognized attempt.
- **Beginner escape:** after two consecutive rejects, offer demo / camera-adjust / retry / skip (from `beginnerUxPolicy`) — never trap the user.
- **Auto-detect mode (later):** classify first, route to the matching analyzer, keep a manual-override chip.

**Option B — TCN classifier (later, highest ceiling):** 1D-CNN/TCN over normalized sequences → temperature-calibrated softmax. Needs a labeled dataset + TFLite path; after Option A proves the UX.

**Agents:** Explore → Rubber Duck (implement) → **Pose CV Reviewer** (estimator variance, coordinate spaces, coverage) → **QA Adversary** (side-in-front matrix, fps invariance, boundary confidence, occluded support foot). 
**Release gate (§14):** held-out (subject- **and** device-disjoint) confusion matrix meeting the wrong-mode false-accept target **and** valid-beginner recall target, with **calibrated** confidence, and identical identity/status across 15/24/30/60 fps.

### 5.2 Deepen kick analysis — temporal, phase-aware (corrected)

**New modules: `src/engine/resample.ts`, `src/engine/segmentation.ts`.**
- **Resample the buffer to a fixed Δt (e.g. 60 fps) at ingest**; every window becomes **milliseconds**. The existing frame-count windows (apex dwell ≤3 frames, `min(6,…)`, recoil windows) change physical meaning across fps and must be converted.
- Smooth `kneeAngle` and `footSpeed` (One-Euro); **validate the cutoff preserves the <100 ms extension→retraction crossing** before trusting phase boundaries.
- Detect **5 phases** on smoothed curves — Onset → Chamber → Extension → Retraction → Recovery — **with explicit fallbacks:**
  - **chamber not found** (non-chambering beginner) → chamber phase `unobservable`; **never score the standing frame** (fixes the `chamberIdx = 0` bug).
  - **low kick** (ankle never rises above hip) → peak via **foot-speed extremum**, not min-ankle-Y.
  - **push kick** (chamber/extension blend) → merge phases, flag reduced granularity.
- **Onset blind spot:** the existing capture onset (`KNEE_VEL_ONSET=0.06` image-Y rise) never fires for slow/low kicks. Adapt it in M0.0 or document it as a known capture limitation gating "deepen analysis."

**Per-phase features:** chamber compactness & height; extension peak angular velocity + **path linearity**; **retraction/extension speed ratio** (snap vs push); phase durations/ratios; **proximal-to-distal sequencing lag** (hip→knee→foot velocity-peak order).

**DTW-to-exemplar (`src/engine/dtw.ts`) — shape-only, corrected:** z-normalized series over **tilt-robust channels** `[kneeAngle, hipAngle, footSpeed]`; **drop the world-Z `thighAzimuth` channel** (or replace with a z-free proxy). **Sakoe–Chiba band in milliseconds on the resampled series**; uniform-Δt is a **precondition**. Use **multiple exemplars / a normalized prototype**, not one instructor's proportions. **Hard constraint: DTW similarity must NOT feed any quality or coverage score** — it only supplies phase-localized commentary; rule criteria remain the grader.

**Temporal hygiene:** derivatives on smoothed signals only; **do not surface raw jerk/acceleration**; a smoothness metric (SPARC on a smoothed signal) must be validated before any display.

### 5.3 Responsible speed index (corrected — see §11)
- **Kinematic (legit):** peak knee **angular velocity** (deg/s, in-plane, tilt-corrected).
- **Relative endpoint speed:** image-plane, labeled "relative"; **returns `null` when motion is toward/away from camera** (`unsupported_view`) or cadence/coverage below floor.
- **`leg-lengths/sec` is view-sensitive, not view-invariant** — the normalizer (image leg length) itself foreshortens during extension, so depth-component kicks under-read. Valid **only within a fixed setup**; no cross-session claim unless setup consistency is measured.
- **Keep the speed index OUT of execution scoring.** Fixed formula, baseline init, supported-view predicate, and scorer-version stamp defined before display. Present as index/stars with the single-camera disclaimer.

### 5.4 Calibration & validation harness (corrected statistics)
- **Held-out cohorts:** separate **calibration** and **test** subjects/devices. **30 clips/technique is insufficient** for a small false-accept claim — with zero observed failures the 95% upper bound is ≈ `3/n` (≈10% at n=30). Use **larger negative sets, multiple practitioners and devices**, and disjoint calibration/test cohorts.
- **Regression fixtures:** representative `CompactFrame` JSON; unit tests assert stable identity + score across fps-resampled variants.
- **Metrics tracked separately** (never one aggregate): technique recall, non-technique false-positives, side-confusion, score coverage, tracking-loss rate, per-fps deltas.

---

## 6. PHASE 1 — Hand techniques: punches

**Goal:** analyze straight punches (jab / lead, cross / rear) and later uppercut/hook, **pose-only where honest**, with an ITF-specific correctness win.

**Landmark reality:** pose gives **wrist only** (15/16) — no fingers, no fist orientation. So Phase 1 scores **motion, target height, endpoint speed, and the reaction hand**, not fist shape.

**Criteria (pose-only, per punch):**
- **Extension path & target height** (chudan/jodan zone from wrist vs shoulder/nose).
- **Endpoint image-plane speed** (relative index).
- **Reaction hand returns to hip** ⭐ — a genuine ITF check: non-punching wrist near hip landmark at impact.
- **Torso stability / no over-lean**; **stance maintained**; **guard** (optional).
- **Straightness** for straight punches; foreshortening caveat for punches toward camera.

**Architecture:** reuse the primitive/detector/scorer separation from `update plan.json`. `techniqueGate` extends to upper-body: a punch must be recognized as a punch (not a block/guard adjustment) before scoring. Uppercut/hook are **deferred** until straight punches validate (more occlusion + foreshortening).

**Needs-hands features (knife-hand strike, spear-hand, fist-vs-palm) are Phase 2-gated on the Holistic verification.** Do not fake them from wrist-only.

**Agents:** Explore (where to hook upper-body capture) → Rubber Duck → Pose CV Reviewer (foreshortening + wrist-jitter honesty) → QA Adversary (punch-vs-reach, punch-vs-guard-return, punch-at-camera).

---

## 7. PHASE 2 — Blocks (ITF set)

**Goal:** support ITF blocks — the full basic set you listed (high/rising, low, inner/middle, outer, knife-hand guarding block, X-block/X-fist, nine-block, twin-forearm, palm, etc.) and hand strikes (knife-hand chop, spear-hand/finger thrust).

**Feasibility split (this determines what ships when):**

| Technique | Pose-only? | Needs hands (Holistic)? |
|---|---|---|
| High/low/rising block by **zone + path** | ✅ | for hand shape |
| **Inner vs outer** block | ❌ (forearm rotation) | ✅ |
| **Knife-hand strike/block (sonkal)** | ❌ | ✅ (defined by hand shape) |
| **Spear-hand / finger thrust** | ❌ | ✅ (fingers are the technique) |
| **X-block / X-fist**, nine-block, twin block | ⚠️ forearm **geometry** (crossing/both-up) detectable; fist-vs-knife-hand variant | ✅ for hand variant |
| **Stance** (walking/L/sitting/back) | ✅ | — |
| **Gaze / head yaw** | ✅ coarse | for fine gaze |

**Plan:**
- **Phase 2a (pose-only, ships now):** block **zones** (high/low/middle by wrist+elbow position and travel path), stance correctness, head yaw ("look in the block direction"), X-forearm geometry, reaction-hand discipline. Every block scored for *zone + path + stance + gaze*, with hand-shape marked `unobservable`.
- **Phase 2b (gated on Holistic verification):** inner/outer discrimination, knife-hand, spear-hand, palm blocks, fist-vs-knife-hand variants — only after a hand-landmark source is confirmed and validated. If no binding exists, this becomes a native-module task or is honestly deferred.

**Agents:** Pose CV Reviewer leads the feasibility gate (must confirm each block's discriminative feature is observable pose-only before it's scored); QA Adversary builds the block-confusion matrix (static guard vs block, inner vs outer, incomplete travel).

---

## 8. PHASE 3 — Combinations

**Goal:** two modes — **chosen combos** (user picks a sequence, repeats it, each rep scored) and **random combos** (system announces a combo, user performs, next combo appears). Each move **and each transition** scored.

**Engine:** the **sequence engine** already specified in `update plan.json` — a monotonic-timestamp state machine consuming committed `PrimitiveEvent`s from streaming detectors (not batch analyzers). States: `READY → WAITING_FOR_ONSET → CANDIDATE_MOVE → MOVE_COMMITTED → WAITING_FOR_ENDPOINT → TRANSITION → (TRACKING_SUSPENDED / REACQUIRING) → COMBO_COMPLETE / RETRY_OR_ABORT`.

**Requirements:**
- Per-move recognition (via technique gate) + per-move quality + **transition quality** (timing, stance continuity, rhythm, recovery).
- **Repetition handling** (jab-jab must count twice; refractory windows prevent double-count).
- **Order/extra/missing/wrong-move** detection; resynchronization without replaying committed moves.
- **Random mode:** deterministic combo generator with difficulty tiers; announce via voice (§ forms voice policy) + show target.
- **Scoring:** never average away a critical/hard-gate failure; store each move and transition result.

**Agents:** Rubber Duck (sequence engine) → Pose CV Reviewer (segmentation soundness across moves) → QA Adversary (overlap: block-cross where cross starts during block recovery; timeout-at-boundary; pause mid-combo; tracking loss mid-combo).

---

## 9. PHASE 4 — Forms (tuls): learn / practice / test

**Goal:** the flagship. A voice + skeleton coach that teaches ITF patterns **Chon-Ji → Choong-Moo** (color-belt set), the way a master leads a student.

> 🚨 **Sequence data is external, verified input — never model-generated.** Each pattern's moves, counts, stances, and directions come from the Encyclopedia of Taekwon-Do / the student's federation and are **instructor-verified per step**. (Clarify with the user: "keybone" likely means the pre-pattern **Saju** exercises (Saju Jirugi/Makgi) or **Kibon**; ITF's first true tul is **Chon-Ji**. See §16.)

**Data model — a form is an ordered state machine over steps.** Each step:
```
Step {
  index, name (spoken), count,
  stance (e.g. walking/L/sitting/back + facing),
  technique (block/punch/strike + side),
  facingDirection (relative to the pattern's start orientation, NOT compass),
  keyPose: jointAngleVector,          // orientation-normalized to pelvis facing
  transitionTrajectory: reference path to this pose,
  correctionsPriority: ordered list of checkable faults
}
```
All poses stored **orientation-normalized to pelvis facing**, so a correct move counts at any absolute direction the student faces.

**Learn mode** (teach): demo **skeleton avatar** performs the move + **TTS speaks it** ("turn left, low block"). Student mirrors. **Turn skeleton green** when `similarity(currentPose, keyPose) ≥ threshold` **AND** briefly held (settled stance, low velocity). If struggling → **repeat the command**; if still wrong → **speak the single biggest correction** ("deepen your front stance"). **Only advance on a correct, held pose.** No scoring.

**Practice mode:** student performs continuously; per-step live green/correction; forgiving thresholds; no overall grade.

**Test mode:** strict thresholds, full sequence + timing + overall score, minimal hints; report per-step results + form summary.

**Correctness surface (a master checks all of these each move):** stance (width/length/knee flexion/facing), hand/arm placement (technique zone + path), **where the student is looking** (head yaw toward the movement), balance/recovery, and timing. Each is a criterion returning pass / fail / **unobservable**.

**Hard parts — turns / occlusion / orientation (explicit handling):**
- MediaPipe **left/right can swap** as the person rotates; students **turn their back** (self-occlusion).
- **Heading estimation** (pelvis + shoulder azimuth + head yaw) to know which way they turned.
- **Turn checkpoints** tolerate lower confidence ("now facing away"); **re-acquisition** waits for `frameUsable` to recover, then snaps to the expected step.
- **Blind-turn intervals are checkpoint-confirmed, not continuously scored.** When facing away, rely on coarse features (stance, gross arm zones); **do not penalize** fine features that can't be seen.
- Documented camera placement required; orientation checkpoints before/after each turn.

**Voice orchestration (from `update plan.json` voicePolicy):** typed channels (instruction = ordered/non-droppable; correction = replace-same-step; result = latest-only). **Observation gate opens only after the instruction's TTS completes + a reaction guard**, so a late "turn left" can never advance the wrong move. Pause/resume on audio-focus loss, backgrounding, screen lock.

**Coach state machine:** `INTRO → POSITIONING → CUE_QUEUED → CUE_SPEAKING → REACTION_GUARD → OBSERVING → HOLD_TO_CONFIRM → (TRACKING_SUSPENDED / REACQUIRING) → CORRECTING → RETRYING → ADVANCING → PAUSED → COMPLETE / ABORTED`.

**Agents:** this is the highest-risk phase — full team, multiple recheck rounds. Explore (skeleton replay + TTS wiring points) → Rubber Duck (coach state machine, step matcher, DTW transitions) → **Pose CV Reviewer** (orientation-normalization correctness, turn/occlusion observability) → **QA Adversary** (wrong side/direction, missed step, turn-hides-body, speech-vs-motion race, pause during turn). **Instructor sign-off on every pattern's step data before release.**

---

## 10. Cross-cutting architecture (shared foundation)

Aligns with the `foundationArchitecture` already in `update plan.json`:
- **Movement primitive** = versioned semantic technique referencing **separate detector + scorer + cue-set** definitions (detection ≠ scoring).
- **PrimitiveEvent** = the stable contract (attemptId, primitiveId, anatomical side, timestamps, completionStatus, confidence, coverage, orientation) emitted by streaming detectors, consumed by sequence/form engines.
- **Result states:** `passed / failed / uncertain / incomplete / tracking_lost / unsupported_view / skipped`; criterion states `pass / fail / unobservable / not_applicable`; **score is null below minimum observable coverage**.
- **Persistence (additive):** new `training_sessions / attempts / sequence_steps / pose_evidence` tables; **keep `kicks` / `kick_frames` unchanged** and adapt for generalized reads. Client-generated UUIDs, idempotent offline event graph, version bundle on every attempt, guest→account keeps `userId`.
- **Anatomical side stored separately** from camera facing / preview mirroring / rotation.

---

## 11. Speed & power — the honesty contract

**Can estimate (relative/kinematic):** joint **angular velocity** (deg/s, in-plane); **endpoint image-plane speed** (relative, per-user); **relative timing** (phase durations, snap-vs-push, proximal-to-distal sequencing); **body-normalized speed** (leg-lengths/sec); **session trends** (consistent setup only).

**Cannot honestly estimate from monocular pose:** **force (N), power (W), momentum, impact** — no contact/mass/force model. **Absolute m/s** — monocular scale + estimated depth; motion toward/away from camera is systematically wrong. **Precise acceleration/jerk** — noise-amplified.

**Present responsibly:** indices/stars ("Kick Speed Index 78, your best 85"), angular velocity in deg/s (legit), endpoint speed explicitly labeled "relative", **trend framing**, and a disclaimer: *"estimated from a single camera; not a lab measurement; keep camera angle & distance consistent."* **Real absolute numbers require a wearable IMU** (§4).

---

## 12. Tutorial videos — curation (not fabrication)

The user wants quality tutorial links per technique/form. **We will not fabricate URLs** (fabricated links erode the master-level trust we're building). Process instead:
- Define **selection criteria**: recognized ITF source (ITF-accredited instructors/federations, high-dan masters), correct terminology, clear multi-angle demonstration, current/available, safe for beginners.
- Curate via an explicit **web-verification pass** (a tooling step with real search/fetch), each link **manually confirmed live** before storage.
- Store as a versioned `tutorials` map keyed by primitive/pattern id, with source attribution and a "last-verified" date; surface a "Watch a master demo" link on each technique/form screen.
- **Deferred to a dedicated curation task** with web access; placeholders marked `TODO: verify` until then.

---

## 13. Gamification & multi-user ecosystem (later track)

After the coaching engine is solid (do not start before Phase 0–2 are trustworthy):
- **Leaderboards** (per technique / form / speed-index), friends, streaks already exist as a base.
- **Motivation loops:** daily challenges, belt-progression paths mirroring real ITF curriculum, combo/form badges, streak protection.
- **Ranked/seasonal** modes; share cards.
- Requires: real accounts (guest→account already built), abuse/anti-cheat (server-side validation of submitted scores; never trust client score for leaderboards), MAU/cost planning.
- **Anti-cheat is a hard requirement** for any competitive leaderboard — scores must be recomputable/validated server-side or from stored evidence.

---

## 14. Testing & validation strategy (the rigor layer)

- **Fixture unit tests** for every pure module (`techniqueGate`, `segmentation`, `dtw`, each scorer) from recorded `CompactFrame` JSON — deterministic, fps-resampled variants included.
- **Labeled clip corpus** (own recordings + multi-view exemplars) across body size, distance, angle, lighting, side, fps, stance.
- **Adversarial matrices** (QA Adversary) per feature: false-accept, false-reject, occlusion, turns, mirroring, races, persistence, boundaries.
- **Regression gate:** the corpus is re-run before/after any MediaPipe/model/dep change; track recall, false-positives, side/orientation confusion, coverage, tracking-loss **separately**.
- **Device tests** (owner + athletes) for anything visual/temporal the agent cannot observe — explicitly required before shipping forms and combos.
- **Reviewer sign-off** (Pose CV Reviewer + QA Adversary) recorded per phase.

---

## 15. Risk register & verification backlog (must-resolve)

| # | Item to verify | Blocks | How |
|---|---|---|---|
| 1 | Does a maintained RN binding expose **hand/face landmarks** (Holistic)? | knife-hand, spear-hand, inner/outer blocks, fine gaze | test bindings / scope native module |
| 2 | Exact **model identifiers** for Opus 4.8 (1M) / GPT-5.6 in the agent picker | agent `model:` arrays | confirm in environment |
| 3 | **Foot-landmark reliability** (heel/foot-index) for orientation/pivot/stance | weighting of those features | validate on own clips |
| 4 | **All angle thresholds** (pelvis yaw 30/60/90°, shin-horizontal, chamber) | gate + scoring accuracy | calibrate on labeled set |
| 5 | **ITF pattern step data** (Chon-Ji→Choong-Moo) authoritative source | Phase 4 | Encyclopedia + instructor |
| 6 | **SPARC / smoothness** validity for TKD strikes | any smoothness metric | validate before surfacing |
| 7 | **One-Euro cutoff** that doesn't attenuate true peaks | segmentation accuracy | sweep + compare to raw peaks |
| 8 | Wearable IMU device + sync feasibility | real speed/power | prototype BLE + video sync |

---

## 16. Open decisions for the owner (non-blocking; noted for review)

1. **"Keybone"** — do you mean the ITF **Saju** pre-exercises (Saju Jirugi / Saju Makgi), **Kibon**, or straight to **Chon-Ji**? Confirms the first form to build.
2. **Which federation's standard** (ITF via Encyclopedia of Taekwon-Do, or your school's variant)? Governs exact stances/counts/directions.
3. **Hands scope:** if no RN Holistic binding exists, do we (a) ship pose-only blocks/punches now and defer hand-shape techniques, or (b) invest in a native hand-landmark module first? (Recommendation: **a**, ship pose-only value now.)
4. **Wearable IMU** for real speed/power — in scope, or keep everything single-camera + relative indices?
5. **Order confirmation:** proposed build order is Phase 0 → 1 → 2a → 3 → 4 → (2b hands) → gamification. Agree?

---

## 17. Sequencing, milestones & commit strategy

**Milestones (each = its own PR-sized set of commits, reviewed by the agent team):**
- **M0.1** One-Euro smoothing + fixtures. → commit
- **M0.2** `techniqueGate.ts` + reject/redirect policy (**fixes your mode bug**). → commit
- **M0.3** `segmentation.ts` 5-phase + per-phase features. → commit
- **M0.4** `dtw.ts` exemplar similarity + localized feedback. → commit
- **M0.5** responsible speed index + disclaimer UI. → commit
- **M1** straight punches (pose-only) + reaction-hand check. → commit
- **M2a** blocks by zone + stance + gaze (pose-only). → commit
- **M3** combo sequence engine (chosen + random). → commit
- **M4** forms coach (learn → practice → test), instructor-verified data. → commits per pattern
- **M2b** hand-shape techniques (gated on Holistic verification).
- **MG** gamification / leaderboards / anti-cheat.

**Commit rule:** commit + push after every milestone step so any state is revertable. Each commit message references the milestone and the reviewing agents.

**What can start immediately (no external dependency):** M0.0, M0.Foundation, M0.1, M0.2 (heuristic gate, corrected math), M0.3 — all pure engine modules with unit fixtures, testable via `tsc` + jest + release build. No device is required to validate the **logic**; a device is required to validate the **UX and to tune thresholds**.

**What is gated:** M0.2 threshold *calibration* (needs labeled clips), M2b (needs hand landmarks), M4 (needs instructor-verified sequences + device tuning), tutorials (need web curation), IMU (needs hardware).

---

## Appendix A — Review corrections (v0.1 → v0.2)

A two-agent review (CV/biomech correctness + adversarial QA/completeness) audited v0.1 against the real engine and `update plan.json`. Phase 0 fixes are applied **inline above**. Corrections for the later phases (built later, so annotated here rather than rewritten) and cross-cutting fixes:

**Phase 0 (applied inline):** direct-normalization gate math (softmax over memberships made the accept region empty); **reuse the shipping z-free image-hip-width rotation estimator** instead of world-Z pelvis-yaw, magnitude `|Δ|`; recognition separated from score; the score-cap-as-detection path removed (it was swallowed by the existing `<45` discard); observability/`unobservable`/coverage/`unsupported_view` states; camera-tilt correction; fixed-Δt resampling with ms windows; segmentation degenerate fallbacks; speed-index honesty; corrected validation statistics.

**Phase 1 punches (§6):** add orthodox/southpaw + **anatomical-side selection**; require full **onset→chamber→recoil** completion; explicit **negative classes** (reach, guard-return-to-hip); return **`unsupported_view`** for punch-toward-camera rather than a fabricated straightness/speed score.

**Phase 2 blocks (§7):** **rename Phase 2a** so it does not promise the "full basic set"; require a **movement detector contract** (chamber/travel/endpoint/reset) so a *static guard* cannot false-accept as a block; **split observable travel-direction from unobservable inner/outer forearm-rotation** and blocking-tool identity; "fine gaze" needs face evidence, not hands.

**Phase 3 combos (§8):** **define repetition** (candidate hysteresis + **endpoint-based rearming** + refractory) so jab-jab counts twice without a double-emit and a fast second jab isn't suppressed; **event/evidence IDs**; overlap ownership between adjacent detectors; **generation tokens**; a real **`PAUSED`** lifecycle state.

**Phase 4 forms (§9):** **replace the endpoint-similarity advance rule** with the full invariant — *expected committed primitive + coverage + anatomical side + orientation checkpoint + hold + stale-work rejection*; **turns are checkpoint-confirmed, never "snap to expected step"** (a 270° wrong-way turn can share final heading with a 90° turn; a hidden move can occur during occlusion) → mark blind intervals `unobservable`/`incomplete` and require an **observable post-turn checkpoint**; add **temporal L/R-label-swap recovery** (orientation-normalization alone does not un-swap MediaPipe's limb labels through a turn); auto-advance gated on a **confidence floor**, not just similarity+hold; **split Phase 4 into one instructor-verified MVP form (Chon-Ji) then libraries**; every form **gated on its required primitive capabilities**.

**Architecture (§10):** carry the full **side/orientation metadata** (`cameraFacing`, `previewMirrored`, sensor/display rotation, orientation sectors) through **one canonical transform pipeline** with metamorphic tests (front/rear camera, preview flip, 90/270° rotation, opposite-side, back-facing reacquisition); make **local-first UUID persistence + blur/background/app-kill recovery + idempotent upserts + orphan reconciliation + session-generation cancellation** prerequisites before any new activity type; add **expand-only migrations, per-primitive feature flags / kill switches, an immutable version registry, and scorer-version leaderboard partitions**.

**Voice (§8/§9):** carry the full `voicePolicy` — **`cueId` + session generation tokens**, discard all closed-gate onset evidence, replay interrupted instructions, a `status` channel, and a **TTS-unavailable text acknowledgement**; random combo cues apply the same gate.

**Beginner UX:** **remove the `score < 45` recognition/quality conflation** — a *recognized* low/slow attempt persists as a **failed attempt with one correction**, not a silent non-attempt; a **two-retry escape** (demo / camera-adjust / retry / skip) everywhere.

**Speed & anti-cheat (§11/§13):** `leg-lengths/sec` labeled **view-sensitive** (its normalizer foreshortens during extension); leaderboards need **nonce/session challenges, consented evidence hashes, timestamp-plausibility, rate limits, Sybil/attestation, and scorer-version partitioning** — until then they are labeled **"recreational," not "cheat-resistant."**

**Sequencing (§17):** restore the roadmap order — **voice foundation → calibrated single primitives → fixed two-move combos → one verified supported form → broader forms & hand-dependent techniques**; **re-run calibration after** the RN/camera upgrade.

**Statistics:** **30 clips/technique is insufficient** for a small false-accept claim (with zero failures the 95% upper bound is ≈ `3/n` → ~10% at n=30) — use larger negative sets, multiple practitioners and devices, and **disjoint calibration/test cohorts**.

**Model labels (verification item #2 — RESOLVED):** the environment exposes **`Claude Opus 4.8 (copilot)`** and **`GPT-5.6 Sol (copilot)`** (also `GPT-5.6 Terra/Luna`, `GPT-5.5`, `GPT-5.4`). The reviewer `.agent.md` files use these exact labels.

### Per-phase release gates (minimum measurable bar to ship)

| Phase | Gate |
|---|---|
| **0** | Subject- & device-held-out confusion matrix; wrong-mode false-accept ≤ target; valid-beginner recall ≥ target; **calibrated** confidence; identical identity/status at 15/24/30/60 fps with score delta ≤ ~3 pts. |
| **1** | Punch-vs-reach/guard/block negatives; lead/rear accuracy; slow/fast equivalence; toward-camera → `unsupported_view`, never a fabricated score. |
| **2** | Per-block confusion matrix; **zero** static-guard commits in the adversarial fixture set; pose-only vs hand/face coverage reported separately. |
| **3** | Exact count/order in every deterministic fixture; **zero** duplicate/stale commits; defined overlap outcomes; crash/restart → one idempotent event graph. |
| **4** | **Zero** auto-advances for wrong step/side/direction, cue-closed motion, uncertainty, tracking loss, or blind turn; **100%** instructor verification of sequence/cues. |

---

*End of plan v0.2. This document is the single source of truth for the expansion; update it as milestones land and verifications resolve. Superseded v0.1 designs (softmax gate, world-Z pelvis-yaw, score-cap detection) are retained only in git history.*
