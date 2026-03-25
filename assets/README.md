# Assets

## Pose Landmark TFLite Model (Required)

The app expects a MediaPipe Pose Landmarker TFLite model at:

- **`pose_landmark_full.tflite`** (full precision, ~6.2MB) — used by default in `App.tsx`

### Where to get it

1. **Google MediaPipe**: Download the Pose Landmarker model from [MediaPipe Solutions - Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).
2. Or use the **Pose Landmarker Lite** (~1.3MB) for lower-end devices and name/save it as `pose_landmark_full.tflite` if you only want one model, or add a second file (e.g. `pose_landmark_lite.tflite`) and switch in code.

Place **`pose_landmark_full.tflite`** in this `assets/` folder so that:

```ts
const modelSource = require('./assets/pose_landmark_full.tflite');
```

resolves correctly. Metro is already configured to bundle `.tflite` files (see `metro.config.js`).

Without this file, the app will fail at runtime when loading the model.
