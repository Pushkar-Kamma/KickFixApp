# KickFix — Threshold Reference

Every "magic number" in the engine, with rationale. **All thresholds here are
heuristic** — derived from coaching literature + ad-hoc tester calibration.
Replace with data-driven values once a labeled training set exists.

---

## Detection (CameraScreen)

| Constant | Value | Why |
|---|---|---|
| `PRE_ROLL` | 5 frames | Capture the moments just before kick onset so chamber prep is in the buffer. |
| `MIN_KICK_FRAMES` | 8 | Anything shorter is detection noise. Logged to telemetry as `tooShortKicks`. |
| `COOLDOWN_FRAMES` | 6 | Forced quiet window after a kick to prevent back-to-back false re-triggers. |
| `ONSET_KNEE_VEL_DEG_S` | 250 °/s | Knee angular velocity threshold. Frame-rate independent (deg/sec, not deg/frame). 250°/s is well above standing motion (~80°/s for casual leg swings) but well below a real kick (~600°/s peak). |
| `END_PEAK_THRESHOLD_DEG` | 130° | Won't consider a kick "complete" until the knee has at least partially extended. Prevents waving the leg from being recognized as a kick. |
| `END_RECHAMBER_THRESHOLD_DEG` | 110° | Once the knee returns below this angle (i.e., re-bent), the kick is over. |
| `MAX_KICK_FRAMES` | 60 (~2s) | Hard safety cap on buffer length so a stuck "kick never ends" state self-rescues. |
| `score < 45` discard | hardcoded | Kicks scoring below 45 are silently dropped (not saved, no streak hit) and counted in `telemetry.rejectedKicks`. **The rejection rate is observable** so we can dial this if it's too aggressive. |

## Front Snap analyzer (`FrontSnapAnalyzer.ts`)

Severity weights: `critical=15, major=8, minor=4, info=0`. Score starts at 100, deducts per failure, clamped 0–100.

| Criterion | Threshold | Severity |
|---|---|---|
| Standing leg dynamic bend | knee angle 140°–178° | minor |
| Knee at hip height in chamber | image kneeY ≤ hipY + 5% | major |
| Chamber duration | ≤ 400ms | minor |
| Support heel planted | lift / leg-length-on-screen < 0.08 | minor |
| No pelvic drop | hip-Y diff / hip-width < 0.20 (Trendelenburg analog) | minor |
| Peak knee extension | 165°–185° | **critical** |
| Peak ankle ≥ hip | image ankleY ≤ hipY | **critical** |
| Knee snap velocity | ≥ 600 °/s | **critical** |
| Vertical torso | lean < 25° from vertical | major |
| Hip-shoulder rotation | < 35° on transverse plane | minor |
| Recoil/extension velocity ratio | ≥ 0.7 | **critical** |
| Knee elevated during recoil | knee Y doesn't drop > foot Y | minor |
| Apex dwell instantaneous | foot at peak Z ≤ 3 frames | minor |
| Total execution time | ≤ 1000ms | info |

## Side Kick analyzer (`SideKickAnalyzer.ts`)

| Criterion | Threshold | Severity |
|---|---|---|
| Standing leg dynamic bend | 140°–178° | minor |
| Knee at hip height | image kneeY ≤ hipY + 5% | major |
| Chamber duration | ≤ 500ms | minor |
| Peak knee extension | 165°–185° | **critical** |
| Peak ankle ≥ hip | image OR world Y check (5% tolerance) | **critical** |
| Hip turnover (rotation) | ≥ 60° rotation, derived from hip-width collapse in image space | **critical** |
| Body line collinearity | shoulder→hip→ankle angle ≥ 120° | **critical** |
| Foot blade orientation | foot-vs-knee Y diff / upper-leg < 0.30 | minor |
| Lateral thrust trajectory | image Δx/Δy ≥ 0.8 | minor |
| Lateral lean controlled | 5°–57° from vertical | minor |
| Recoil/extension ratio | ≥ 0.4 (looser than front snap; image-space) | **critical** |
| Knee elevated during recoil | same as front snap | minor |
| Total execution time | ≤ 1500ms | info |

## Roundhouse analyzer (`RoundhouseAnalyzer.ts`)

| Criterion | Threshold | Severity |
|---|---|---|
| Standing leg dynamic bend | 140°–178° | minor |
| Knee at hip height | image kneeY ≤ hipY + 5% | major |
| Chamber duration | ≤ 500ms | minor |
| Peak knee extension | 165°–185° | **critical** |
| Peak ankle ≥ hip | image OR world Y check | **critical** |
| Hip rotation (partial) | 30°–90° (less than side kick's 60+) | major |
| Shin horizontal at peak | |kneeY − ankleY| < 0.07 image height | **critical** |
| Knee leads ankle | knee crosses midline first | major |
| Foot arc trajectory | path / straight-line ≥ 1.05 (curved) | minor |
| Lean controlled | 35°–65° from vertical | minor |
| Recoil/extension ratio | ≥ 0.4 | **critical** |
| Knee elevated during recoil | same | minor |
| Total execution time | ≤ 1500ms | info |

## Verdict bands (all kicks)

| Score range | Verdict |
|---|---|
| 90+ | SNAP |
| 75–89 | SNAP |
| 60–74 | GOOD |
| < 60 | diagnostic — chooses between PUSH / LOW / SLOPPY based on top failure |

Rejected kicks (`< 45`) never reach this; they're discarded.

## Tier (from overall score, used by Fighter Attributes)

| Score | Tier |
|---|---|
| 90+ | Elite |
| 75+ | Advanced |
| 55+ | Intermediate |
| < 55 | Novice |

---

## How to recalibrate

1. Capture 10–20 reference kicks of each type, manually rate each as
   poor/decent/good/elite.
2. Run the analyzer on each, dump the `criteria` array, and check which
   thresholds would need to flip for the rated quality to match the score.
3. Update the values here AND in the corresponding analyzer file.
4. Run `npx jest __tests__/biomech.test.ts` to confirm math primitives
   still behave (they should — these are unit tests).
