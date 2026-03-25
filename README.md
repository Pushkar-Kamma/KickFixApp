# KickFix — AI Taekwondo Coach

**KickFix** analyzes your kicks through the device camera, detects execution mistakes, and returns real-time feedback. Built with **MediaPipe Pose**, **React Native**, and on-device **TFLite** for low-latency, offline-capable coaching.

Future roadmap: combo prompts, ML-based analysis, and AI-generated feedback.

---

## What It Does (MVP)

- **Real-time pose estimation** via camera → 33 body landmarks (MediaPipe format).
- **Skeleton overlay** drawn with Skia over the camera feed.
- **FPS counter** and pose viewer (foundation for kick grading, state machine, and feedback UI).

Planned: kick counting, speed/chamber timing, random combo prompts, then form feedback and gamification.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| App | React Native (CLI, no Expo) |
| Camera | `react-native-vision-camera` @ 60 FPS capable |
| Pose AI | `react-native-fast-tflite` + MediaPipe Pose Landmarker `.tflite` |
| Overlay | `@shopify/react-native-skia` (GPU-drawn skeleton) |
| Frame processing | `react-native-worklets-core` (sync with camera) |
| Resize for model | `vision-camera-resize-plugin` (256×256 RGB float) |

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- React Native environment (Android Studio / Xcode, SDKs, simulators or devices)
- iOS: CocoaPods (`pod install` in `ios/`)

### 2. Install dependencies

```bash
npm install
```

### 3. Pose model (required)

The app loads a MediaPipe Pose Landmarker TFLite model. You must add it yourself:

- See **`assets/README.md`** for where to download the model and how to name it.
- Place **`pose_landmark_full.tflite`** in the **`assets/`** folder (same folder as this README’s `assets/`).

Without this file, the app will fail when loading the model.

### 4. Run the app

```bash
# Start Metro
npm start
```

In another terminal:

```bash
# Android
npm run android

# iOS (after cd ios && pod install)
npm run ios
```

---

## Project Phases (from the master plan)

- **Phase 1 – Logic lab (Python):** Done — angles, heuristics, MediaPipe on PC.
- **Phase 2 – App foundation:** Done — React Native, Vision Camera, Skia.
- **Phase 3 – On-device ML:** Done — TFLite in app, frame processor, normalized landmarks.
- **Phase 4 – Native coach MVP:** Current — worklet math, filters, state machine (IDLE → RECORDING → ANALYZING), feedback UI.
- **Phase 4.5:** TTS, audio cues, alignment ghost.
- **Phase 5+:** Replay, storage, dashboard, LSTM/ML, LLM coach, AR.

---

## Repo structure (high level)

- **`App.tsx`** — Camera, frame processor, TFLite run, smoothing (One Euro + EMA), Skia skeleton, FPS HUD.
- **`assets/`** — TFLite model(s); see `assets/README.md`.
- **`metro.config.js`** — Adds `.tflite` to `assetExts` so the model is bundled.
- **`babel.config.js`** — Worklets + Reanimated plugins for the frame pipeline.

---

## Troubleshooting

- **Camera permission:** Android has `CAMERA` in `AndroidManifest.xml`. iOS has `NSCameraUsageDescription` in `Info.plist`.
- **Model not found:** Ensure `assets/pose_landmark_full.tflite` exists and Metro is restarted after adding it.
- **Build errors:** Run `npm install`, then for iOS: `cd ios && pod install`.

---

*KickFix: real-time kick correction for Taekwondo and martial arts.*
