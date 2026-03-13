import React, { useEffect, useState, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSharedValue, Worklets } from 'react-native-worklets-core'; 
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';

// --- CONSTANTS & CONFIGURATION ---
const KICK_HEIGHT_THRESHOLD_MIN = 40;
const KICK_HEIGHT_THRESHOLD_MAX = 100;
const KICK_HEIGHT_RATIO = 0.12; // fraction of frame height
const MIN_FRAME_COUNT = 5; // match Python; ignore noise on low FPS
const MIN_SHOULDER_WIDTH_RATIO = 0.07; // min shoulder width = 7% of frame width (ghost filter)
const SMOOTHING_ALPHA = 0.35; // EMA for landmarks (lower = smoother, better for 9–12 FPS) 
const ONE_EURO_MIN_CUTOFF = 1.2; // Hz (lower = smoother)
const ONE_EURO_BETA = 0.02; // responsiveness to speed (higher = snappier)
const ONE_EURO_D_CUTOFF = 1.0; // derivative cutoff
// --- ONE EURO FILTER (JS THREAD) ---
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const smoothingFactor = (cutoff: number, dt: number) => {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
};

const expSmoothing = (a: number, x: number, xPrev: number) => a * x + (1 - a) * xPrev;

class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  reset(x: number) {
    this.xPrev = x;
    this.dxPrev = 0;
  }

  filter(x: number, dt: number) {
    if (this.xPrev == null) {
      this.reset(x);
      return x;
    }
    const safeDt = clamp(dt, 1 / 120, 1 / 5); // guard against spikes (8–200ms)
    const dx = (x - this.xPrev) / safeDt;
    const aD = smoothingFactor(this.dCutoff, safeDt);
    const dxHat = expSmoothing(aD, dx, this.dxPrev);

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(cutoff, safeDt);
    const xHat = expSmoothing(a, x, this.xPrev);

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

const NOSE = 0;
const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13, RIGHT_ELBOW = 14;
const LEFT_WRIST = 15, RIGHT_WRIST = 16;
const LEFT_HIP = 23, RIGHT_HIP = 24;
const LEFT_KNEE = 25, RIGHT_KNEE = 26;
const LEFT_ANKLE = 27, RIGHT_ANKLE = 28;
const LEFT_HEEL = 29, RIGHT_HEEL = 30;
const LEFT_FOOT_INDEX = 31, RIGHT_FOOT_INDEX = 32;

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], 
  [11, 23], [12, 24], [23, 24], 
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], 
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]  
];

// --- MATH HELPER FUNCTIONS (WORKLETS) ---
const calculate_angle = (a: any, b: any, c: any) => {
  'worklet';
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return angle;
};

const calculate_distance = (p1: any, p2: any) => {
  'worklet';
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const check_guard = (lm: any, k_wrist: number, s_wrist: number, shoulders_y: number) => {
  'worklet';
  return (lm[k_wrist].y < shoulders_y) || (lm[s_wrist].y < shoulders_y);
};

const check_height = (lm: any, k_ankle: number, k_hip: number) => {
  'worklet';
  return lm[k_ankle].y < lm[k_hip].y;
};

const refine_peak_quadratic = (y0: number, y1: number, y2: number) => {
  'worklet';
  // Fits parabola through (-1,y0),(0,y1),(1,y2). Returns refined peak value and offset in frames.
  // offset dx in [-1,1]. If curvature is flat/invalid, fall back to center.
  const denom = (y0 - 2 * y1 + y2);
  if (Math.abs(denom) < 1e-6) return { peak: y1, dx: 0 };
  const dx = 0.5 * (y0 - y2) / denom;
  const dxClamped = Math.max(-1, Math.min(1, dx));
  const peak = y1 - 0.25 * (y0 - y2) * dxClamped; // equivalent stable form
  return { peak, dx: dxClamped };
};

// --- ANALYSIS ENGINES (WORKLETS) ---
const analyze_roundhouse = (history: any[], active_leg: string) => {
  'worklet';
  const k_hip = active_leg === "Left" ? LEFT_HIP : RIGHT_HIP;
  const k_knee = active_leg === "Left" ? LEFT_KNEE : RIGHT_KNEE;
  const k_ankle = active_leg === "Left" ? LEFT_ANKLE : RIGHT_ANKLE;
  const s_hip = active_leg === "Left" ? RIGHT_HIP : LEFT_HIP;
  const s_knee = active_leg === "Left" ? RIGHT_KNEE : LEFT_KNEE;
  const s_ankle = active_leg === "Left" ? RIGHT_ANKLE : LEFT_ANKLE;
  const k_wrist = active_leg === "Left" ? LEFT_WRIST : RIGHT_WRIST;
  const s_wrist = active_leg === "Left" ? RIGHT_WRIST : LEFT_WRIST;

  let best_frame_idx = 0;
  let max_angle = 0;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i].lms;
    const angle = calculate_angle(lm[k_hip], lm[k_knee], lm[k_ankle]);
    if (angle > max_angle) {
      max_angle = angle;
      best_frame_idx = i;
    }
  }

  // Quadratic sub-frame peak refinement for extension angle (helps at low FPS)
  let refinedMaxAngle = max_angle;
  if (best_frame_idx > 0 && best_frame_idx < history.length - 1) {
    const lm0 = history[best_frame_idx - 1].lms;
    const lm1 = history[best_frame_idx].lms;
    const lm2 = history[best_frame_idx + 1].lms;
    const a0 = calculate_angle(lm0[k_hip], lm0[k_knee], lm0[k_ankle]);
    const a1 = calculate_angle(lm1[k_hip], lm1[k_knee], lm1[k_ankle]);
    const a2 = calculate_angle(lm2[k_hip], lm2[k_knee], lm2[k_ankle]);
    refinedMaxAngle = refine_peak_quadratic(a0, a1, a2).peak;
  }

  const best_frame = history[best_frame_idx];
  const lm = best_frame.lms;
  const feedback = [`Frames: ${history.length}`];

  const shoulders_y = Math.max(lm[LEFT_SHOULDER].y, lm[RIGHT_SHOULDER].y);
  if (!check_guard(lm, k_wrist, s_wrist, shoulders_y)) feedback.push("Hands Dropped!");
  if (!check_height(lm, k_ankle, k_hip)) feedback.push("Kick Higher! (Below Belt)");
  
  if (refinedMaxAngle < 160) feedback.push(`Bad Extension: ${Math.round(refinedMaxAngle)}°`);
  else feedback.push(`Great Snap! ${Math.round(refinedMaxAngle)}°`);

  if (lm[k_hip].y > lm[s_hip].y + 30) feedback.push("Turn Hips Over!");
  if (Math.abs(lm[k_ankle].y - lm[k_knee].y) > 100) feedback.push("Level your shin!");
  
  const standing_angle = calculate_angle(lm[s_hip], lm[s_knee], lm[s_ankle]);
  if (standing_angle < 135) feedback.push("Stand Tall! (Knee collapsing)");

  if (best_frame_idx < history.length - 2) {
    const last_lm = history[history.length - 1].lms;
    const last_angle = calculate_angle(last_lm[k_hip], last_lm[k_knee], last_lm[k_ankle]);
    if ((refinedMaxAngle - last_angle) < 20) feedback.push("Snap back! Don't drop leg.");
  }

  // 8. Trajectory / knee lead (chamber: knee should be closer to center than ankle)
  if (best_frame_idx > 3) {
    const chamber_frame = history[Math.floor(best_frame_idx / 2)];
    const c_lm = chamber_frame.lms;
    const knee_dist = Math.abs(c_lm[k_knee].x - c_lm[s_hip].x);
    const ankle_dist = Math.abs(c_lm[k_ankle].x - c_lm[s_hip].x);
    if (ankle_dist > knee_dist + 20) feedback.push("Knee must lead! (Soccer kick)");
  }

  return feedback;
};

const analyze_side_kick = (history: any[], active_leg: string) => {
  'worklet';
  const k_hip = active_leg === "Left" ? LEFT_HIP : RIGHT_HIP;
  const k_knee = active_leg === "Left" ? LEFT_KNEE : RIGHT_KNEE;
  const k_ankle = active_leg === "Left" ? LEFT_ANKLE : RIGHT_ANKLE;
  const k_heel = active_leg === "Left" ? LEFT_HEEL : RIGHT_HEEL;
  const k_toe = active_leg === "Left" ? LEFT_FOOT_INDEX : RIGHT_FOOT_INDEX;
  const s_knee = active_leg === "Left" ? RIGHT_KNEE : LEFT_KNEE;
  const k_wrist = active_leg === "Left" ? LEFT_WRIST : RIGHT_WRIST;
  const s_wrist = active_leg === "Left" ? RIGHT_WRIST : LEFT_WRIST;
  const l_shoulder = active_leg === "Left" ? LEFT_SHOULDER : RIGHT_SHOULDER;

  let best_frame_idx = 0;
  let max_angle = 0;
  let min_chamber_x_diff = 1000;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i].lms;
    const angle = calculate_angle(lm[k_hip], lm[k_knee], lm[k_ankle]);
    if (angle > max_angle) {
      max_angle = angle;
      best_frame_idx = i;
    }
    if (angle < 120) {
      const dist = Math.abs(lm[k_knee].x - lm[s_knee].x);
      if (dist < min_chamber_x_diff) min_chamber_x_diff = dist;
    }
  }

  const lm = history[best_frame_idx].lms;
  const feedback = [`Frames: ${history.length}`];

  const shoulders_y = Math.max(lm[LEFT_SHOULDER].y, lm[RIGHT_SHOULDER].y);
  if (!check_guard(lm, k_wrist, s_wrist, shoulders_y)) feedback.push("Hands Dropped!");
  if (!check_height(lm, k_ankle, k_hip)) feedback.push("Kick Higher! (Below Belt)");

  // Quadratic sub-frame peak refinement for extension angle
  let refinedMaxAngle = max_angle;
  if (best_frame_idx > 0 && best_frame_idx < history.length - 1) {
    const lm0 = history[best_frame_idx - 1].lms;
    const lm1 = history[best_frame_idx].lms;
    const lm2 = history[best_frame_idx + 1].lms;
    const a0 = calculate_angle(lm0[k_hip], lm0[k_knee], lm0[k_ankle]);
    const a1 = calculate_angle(lm1[k_hip], lm1[k_knee], lm1[k_ankle]);
    const a2 = calculate_angle(lm2[k_hip], lm2[k_knee], lm2[k_ankle]);
    refinedMaxAngle = refine_peak_quadratic(a0, a1, a2).peak;
  }

  if (refinedMaxAngle < 170) feedback.push(`Push Harder! ${Math.round(refinedMaxAngle)}°`);
  else feedback.push(`Solid Lockout: ${Math.round(refinedMaxAngle)}°`);

  if (lm[k_heel].y > lm[k_toe].y + 20) feedback.push("Turn Toes Down (Blade)!");
  if (min_chamber_x_diff > 120) feedback.push("Deep Chamber Needed!");

  // 6. Torso drop
  if (lm[l_shoulder].y > lm[k_hip].y) feedback.push("Keep Chest Up! (Dropping too low)");

  // 7. Knee height maintenance during extension
  if (best_frame_idx > 2) {
    const chamber_knee_y = history[2].lms[k_knee].y;
    const peak_knee_y = lm[k_knee].y;
    if (peak_knee_y > chamber_knee_y + 30) feedback.push("Keep knee up!");
  }

  return feedback;
};

const analyze_front_snap = (history: any[], active_leg: string) => {
  'worklet';
  const k_hip = active_leg === "Left" ? LEFT_HIP : RIGHT_HIP;
  const k_knee = active_leg === "Left" ? LEFT_KNEE : RIGHT_KNEE;
  const k_ankle = active_leg === "Left" ? LEFT_ANKLE : RIGHT_ANKLE;
  const s_hip = active_leg === "Left" ? RIGHT_HIP : LEFT_HIP;
  const l_shoulder = active_leg === "Left" ? LEFT_SHOULDER : RIGHT_SHOULDER;
  const k_wrist = active_leg === "Left" ? LEFT_WRIST : RIGHT_WRIST;
  const s_wrist = active_leg === "Left" ? RIGHT_WRIST : LEFT_WRIST;
  const k_toe = active_leg === "Left" ? LEFT_FOOT_INDEX : RIGHT_FOOT_INDEX;
  const k_heel = active_leg === "Left" ? LEFT_HEEL : RIGHT_HEEL;

  let best_frame_idx = 0;
  let max_angle = 0;
  let min_fold_dist = 10000;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i].lms;
    const angle = calculate_angle(lm[k_hip], lm[k_knee], lm[k_ankle]);
    if (angle > max_angle) {
      max_angle = angle;
      best_frame_idx = i;
    }
    if (angle < 100) {
      const dist = calculate_distance(lm[k_heel], lm[k_hip]);
      if (dist < min_fold_dist) min_fold_dist = dist;
    }
  }

  const lm = history[best_frame_idx].lms;
  const feedback = [`Frames: ${history.length}`];

  const shoulders_y = Math.max(lm[LEFT_SHOULDER].y, lm[RIGHT_SHOULDER].y);
  if (!check_guard(lm, k_wrist, s_wrist, shoulders_y)) feedback.push("Hands Dropped!");

  // Quadratic sub-frame peak refinement for extension angle
  let refinedMaxAngle = max_angle;
  if (best_frame_idx > 0 && best_frame_idx < history.length - 1) {
    const lm0 = history[best_frame_idx - 1].lms;
    const lm1 = history[best_frame_idx].lms;
    const lm2 = history[best_frame_idx + 1].lms;
    const a0 = calculate_angle(lm0[k_hip], lm0[k_knee], lm0[k_ankle]);
    const a1 = calculate_angle(lm1[k_hip], lm1[k_knee], lm1[k_ankle]);
    const a2 = calculate_angle(lm2[k_hip], lm2[k_knee], lm2[k_ankle]);
    refinedMaxAngle = refine_peak_quadratic(a0, a1, a2).peak;
  }

  if (refinedMaxAngle < 170) feedback.push(`Snap Leg! (${Math.round(refinedMaxAngle)}°)`);
  else feedback.push("Good Snap.");

  if (lm[k_knee].y > lm[k_hip].y) feedback.push("Lift Knee Higher!");

  // 4. Torso lean (don't lean back)
  const lean = Math.abs(lm[l_shoulder].x - lm[s_hip].x);
  if (lean > 80) feedback.push("Don't Lean Back!");

  // 5. Foot direction (toes back for safety)
  const foot_angle = calculate_angle(lm[k_knee], lm[k_ankle], lm[k_toe]);
  if (foot_angle > 140) feedback.push("Pull Toes Back!");

  // 6. Chamber compression (heel to butt when folded)
  let upper_leg_len = calculate_distance(lm[k_hip], lm[k_knee]);
  if (min_fold_dist > upper_leg_len * 1.2) feedback.push("Tighten your fold! (Heel to butt)");

  return feedback;
};

// --- REACT COMPONENT ---
export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front'); 
  const { resize } = useResizePlugin();

  const [modelLevel, setModelLevel] = useState<'lite' | 'full'>('lite');

  const modelSource = modelLevel === 'full' 
    ? require('./assets/pose_landmark_full.tflite') 
    : require('./assets/pose_landmark_lite.tflite');
    
  const tfModel = useTensorflowModel(modelSource);

  // DYNAMIC THRESHOLDS: Lite model needs to be more forgiving!
  const activeVisThresh = modelLevel === 'full' ? 0.3 : 0.1;
  const activePresThresh = modelLevel === 'full' ? 0.5 : 0.2;

  const [feedback, setFeedback] = useState<string[]>(["Stand in frame", "Ready to kick!"]);
  const [kickCount, setKickCount] = useState(0);
  const [currentMode, setCurrentMode] = useState<"Roundhouse" | "Side Kick" | "Front Snap">("Roundhouse");
  
  const [landmarks, setLandmarks] = useState<any[]>([]);
  const [fps, setFps] = useState(0);
  const [recordingState, setRecordingState] = useState<'IDLE' | 'RECORDING' | 'ANALYZING'>('IDLE');
  const prevLandmarksRef = useRef<any[]>([]);
  const oneEuroRef = useRef<{ x: OneEuroFilter[]; y: OneEuroFilter[] } | null>(null);
  const prevTRef = useRef<number | null>(null);

  const state = useSharedValue("IDLE");
  const activeLeg = useSharedValue<string | null>(null);
  const kickHistory = useSharedValue<any[]>([]);
  const workletMode = useSharedValue("Roundhouse");
  const frameCount = useSharedValue(0);

  // Worklet-safe threshold values
  const currentVisThresh = useSharedValue(0.1);
  const currentPresThresh = useSharedValue(0.2);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  useEffect(() => {
    workletMode.value = currentMode;
  }, [currentMode]);

  useEffect(() => {
    currentVisThresh.value = activeVisThresh;
    currentPresThresh.value = activePresThresh;
  }, [modelLevel]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCount.value);
      frameCount.value = 0; 
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerUIUpdate = (newFeedback: string[], isNewKick: boolean, stateLabel: string) => {
    setFeedback(newFeedback);
    if (isNewKick) setKickCount(prev => prev + 1);
    setRecordingState(stateLabel as 'IDLE' | 'RECORDING' | 'ANALYZING');
  };

  const updateUI = Worklets.createRunOnJS(triggerUIUpdate);

  const applySmoothing = (parsed: any[]) => {
    if (!parsed || parsed.length !== 33) {
      oneEuroRef.current = null;
      prevTRef.current = null;
      prevLandmarksRef.current = [];
      setLandmarks(parsed || []);
      return;
    }
    const prev = prevLandmarksRef.current;
    const alpha = SMOOTHING_ALPHA;
    if (prev.length !== 33) {
      // init filters
      oneEuroRef.current = {
        x: new Array(33).fill(null).map(() => new OneEuroFilter(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF)),
        y: new Array(33).fill(null).map(() => new OneEuroFilter(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF)),
      };
      prevTRef.current = Date.now() / 1000;
      prevLandmarksRef.current = parsed;
      setLandmarks(parsed);
      return;
    }
    const now = Date.now() / 1000;
    const prevT = prevTRef.current ?? now;
    const dt = now - prevT;
    prevTRef.current = now;

    if (oneEuroRef.current == null) {
      oneEuroRef.current = {
        x: new Array(33).fill(null).map(() => new OneEuroFilter(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF)),
        y: new Array(33).fill(null).map(() => new OneEuroFilter(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF)),
      };
    }

    const fx = oneEuroRef.current.x;
    const fy = oneEuroRef.current.y;

    // One Euro on x/y, plus a light EMA on top. If visibility drops, hold previous to avoid snapping.
    const smoothed = parsed.map((p: any, i: number) => {
      const prevP = prev[i];
      const vis = alpha * p.vis + (1 - alpha) * prevP.vis;
      if (p.vis < 0.05) {
        return { x: prevP.x, y: prevP.y, vis };
      }
      const x1 = fx[i].filter(p.x, dt);
      const y1 = fy[i].filter(p.y, dt);
      return {
        x: alpha * x1 + (1 - alpha) * prevP.x,
        y: alpha * y1 + (1 - alpha) * prevP.y,
        vis,
      };
    });
    prevLandmarksRef.current = smoothed;
    setLandmarks(smoothed);
  };

  const updateLandmarks = Worklets.createRunOnJS(applySmoothing);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    frameCount.value += 1;

    if (tfModel.state !== 'loaded' || tfModel.model == null) return;

    // FIX: Removed the Center Crop. We just let it squish slightly so the head and feet stay in the frame!
    const resized = resize(frame, { 
      scale: { width: 256, height: 256 }, 
      pixelFormat: 'rgb', 
      dataType: 'float32' 
    });
    
    const outputs = tfModel.model.runSync([resized]);
    const rawLandmarks = outputs[0] as Float32Array; 

    if (!rawLandmarks || rawLandmarks.length < 165) return;

    const parsed: any[] = []; 
    let isHumanPresent = true;
    let isVisible = true;

    const hipPresenceLogit = rawLandmarks[LEFT_HIP * 5 + 4];
    const hipPresence = 1 / (1 + Math.exp(-hipPresenceLogit));
    
    if (hipPresence < currentPresThresh.value) {
      isHumanPresent = false;
    }

    if (isHumanPresent) {
      // MediaPipe Pose Landmark models output x,y normalized in [0,1] relative to the input frame.
      // Map directly into screen space.
      for (let i = 0; i < 33; i++) {
        const rawX = rawLandmarks[i * 5];
        const rawY = rawLandmarks[i * 5 + 1];
        const x = rawX * frame.width;
        const y = rawY * frame.height;
        const rawVisLogit = rawLandmarks[i * 5 + 3];
        const vis = 1 / (1 + Math.exp(-rawVisLogit));
        parsed.push({ x, y, vis });
        if ((i === LEFT_ANKLE || i === RIGHT_ANKLE || i === LEFT_HIP || i === RIGHT_HIP) && vis < currentVisThresh.value) {
          isVisible = false;
        }
      }

      const shoulderWidth = calculate_distance(parsed[LEFT_SHOULDER], parsed[RIGHT_SHOULDER]);
      const minShoulderWidth = frame.width * MIN_SHOULDER_WIDTH_RATIO;
      if (shoulderWidth < minShoulderWidth) {
        isHumanPresent = false;
      }
    }

    if (isHumanPresent) {
      updateLandmarks(parsed);

      if (isVisible) {
        const kickHeightThresh = Math.max(KICK_HEIGHT_THRESHOLD_MIN, Math.min(KICK_HEIGHT_THRESHOLD_MAX, frame.height * KICK_HEIGHT_RATIO));
        const left_ankle_y = parsed[LEFT_ANKLE].y;
        const right_ankle_y = parsed[RIGHT_ANKLE].y;
        const diff = right_ankle_y - left_ankle_y;

        const hips_y = (parsed[LEFT_HIP].y + parsed[RIGHT_HIP].y) / 2;
        const knees_y = (parsed[LEFT_KNEE].y + parsed[RIGHT_KNEE].y) / 2;
        const is_standing = hips_y < knees_y;

        let left_kicking = false;
        let right_kicking = false;
        if (is_standing) {
          if (diff > kickHeightThresh) left_kicking = true;
          else if (diff < -kickHeightThresh) right_kicking = true;
        }
        const is_kicking = left_kicking || right_kicking;

        if (state.value === "IDLE" && is_kicking) {
          state.value = "RECORDING";
          activeLeg.value = left_kicking ? "Left" : "Right";
          kickHistory.value = [];
          updateUI([`Recording ${activeLeg.value} kick...`], false, "RECORDING");
        } else if (state.value === "RECORDING") {
          if (is_kicking) {
            kickHistory.value = [...kickHistory.value, { lms: parsed }];
          } else {
            state.value = "ANALYZING";
            let newFeedback: string[] = [];
            if (kickHistory.value.length > MIN_FRAME_COUNT) {
              if (workletMode.value === "Roundhouse") {
                newFeedback = analyze_roundhouse(kickHistory.value, activeLeg.value!);
              } else if (workletMode.value === "Side Kick") {
                newFeedback = analyze_side_kick(kickHistory.value, activeLeg.value!);
              } else if (workletMode.value === "Front Snap") {
                newFeedback = analyze_front_snap(kickHistory.value, activeLeg.value!);
              }
              updateUI(newFeedback, true, "IDLE");
            } else {
              updateUI(["Ignored noise (Too fast)"], false, "IDLE");
            }
            state.value = "IDLE";
          }
        }
      } else {
        if (state.value === "RECORDING") {
          state.value = "IDLE";
          updateUI(["Lost tracking - Aborted"], false, "IDLE");
        }
      }
    } else {
      updateLandmarks([]);
      if (state.value === "RECORDING") {
        state.value = "IDLE";
        updateUI(["Lost tracking - Aborted"], false, "IDLE");
      }
    }
  }, [tfModel, currentVisThresh, currentPresThresh]);

  const { linesPath, dotsPath } = useMemo(() => {
    const lines = Skia.Path.Make();
    const dots = Skia.Path.Make();

    if (landmarks && landmarks.length === 33) {
      for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
        const [p1_idx, p2_idx] = POSE_CONNECTIONS[i];
        const p1 = landmarks[p1_idx];
        const p2 = landmarks[p2_idx];
        if (p1.vis > activeVisThresh && p2.vis > activeVisThresh) {
          lines.moveTo(p1.x, p1.y);
          lines.lineTo(p2.x, p2.y);
        }
      }
      for (let i = 0; i < 33; i++) {
        const lm = landmarks[i];
        if (lm.vis > activeVisThresh) {
          dots.addCircle(lm.x, lm.y, 6);
        }
      }
    }
    return { linesPath: lines, dotsPath: dots };
  }, [landmarks, activeVisThresh]);

  if (!hasPermission || device == null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white', fontSize: 18 }}>Waiting for Camera...</Text>
      </View>
    );
  }

  const getFeedbackStyle = (line: string) => {
    if (/Great|Solid|Good Snap\.?/.test(line)) return styles.feedbackGood;
    if (/Bad|Dropped|Aborted|Ignored|!$|Don't|Low|Fix|Push Harder|Snap Leg!|Lift|Turn|Level|Stand|Snap back|Knee must|Deep Chamber|Keep|Tighten|Pull Toes/.test(line)) return styles.feedbackFix;
    if (/Frames:/.test(line)) return styles.feedbackMeta;
    return styles.feedbackDefault;
  };

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} frameProcessor={frameProcessor} />

      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={linesPath} color="rgba(0, 230, 200, 0.85)" style="stroke" strokeWidth={3} />
        <Path path={dotsPath} color="rgba(0, 255, 180, 0.9)" style="fill" />
      </Canvas>

      {/* Recording indicator */}
      {recordingState === 'RECORDING' && (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording kick...</Text>
        </View>
      )}

      {/* Top bar: FPS + model */}
      <View style={styles.topBar}>
        <View style={styles.fpsPill}>
          <Text style={styles.fpsText}>{fps}</Text>
          <Text style={styles.fpsLabel}>FPS</Text>
        </View>
        <TouchableOpacity
          style={styles.modelBtn}
          onPress={() => setModelLevel(prev => (prev === 'lite' ? 'full' : 'lite'))}
        >
          <Text style={styles.modelBtnText}>{modelLevel === 'lite' ? 'Lite' : 'Full'}</Text>
        </TouchableOpacity>
      </View>

      {/* Main feedback card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.modeLabel}>{currentMode}</Text>
          <Text style={styles.kickCount}>Kicks: {kickCount}</Text>
        </View>
        <View style={styles.feedbackList}>
          {feedback.map((line, i) => (
            <Text key={i} style={[styles.feedbackLine, getFeedbackStyle(line)]}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      {/* Kick type selector */}
      <View style={styles.kickSelector}>
        <TouchableOpacity
          style={[styles.kickBtn, currentMode === 'Roundhouse' && styles.kickBtnActive]}
          onPress={() => setCurrentMode('Roundhouse')}
        >
          <Text style={[styles.kickBtnText, currentMode === 'Roundhouse' && styles.kickBtnTextActive]}>Roundhouse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kickBtn, currentMode === 'Side Kick' && styles.kickBtnActive]}
          onPress={() => setCurrentMode('Side Kick')}
        >
          <Text style={[styles.kickBtnText, currentMode === 'Side Kick' && styles.kickBtnTextActive]}>Side Kick</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kickBtn, currentMode === 'Front Snap' && styles.kickBtnActive]}
          onPress={() => setCurrentMode('Front Snap')}
        >
          <Text style={[styles.kickBtnText, currentMode === 'Front Snap' && styles.kickBtnTextActive]}>Front Snap</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  recordingBanner: {
    position: 'absolute',
    top: 88,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200, 50, 50, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  recordingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 44,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fpsPill: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  fpsText: { color: '#7ee8a0', fontSize: 18, fontWeight: '700' },
  fpsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  modelBtn: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  modelBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  card: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modeLabel: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
  kickCount: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600' },
  feedbackList: { gap: 4 },
  feedbackLine: { fontSize: 14, marginVertical: 2 },
  feedbackGood: { color: '#7ee8a0', fontWeight: '600' },
  feedbackFix: { color: '#f87171', fontWeight: '500' },
  feedbackMeta: { color: '#fbbf24', fontWeight: '500' },
  feedbackDefault: { color: 'rgba(255,255,255,0.9)' },
  kickSelector: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  kickBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  kickBtnActive: {
    backgroundColor: 'rgba(94, 234, 212, 0.25)',
    borderColor: '#5eead4',
  },
  kickBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  kickBtnTextActive: { color: '#5eead4' },
});