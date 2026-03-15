import React, { useEffect, useState, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Worklets, useSharedValue } from 'react-native-worklets-core'; 
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';

// --- CONSTANTS & CONFIGURATION (POSE VIEWER ONLY) ---
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

// --- REACT COMPONENT: PURE POSE VIEWER ---
export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front'); 
  const { resize } = useResizePlugin();

  // For debugging overlay accuracy, always use FULL model first
  const modelSource = require('./assets/pose_landmark_full.tflite');
    
  const tfModel = useTensorflowModel(modelSource);

  const activeVisThresh = 0.0; // draw all points while debugging overlay

  const [landmarks, setLandmarks] = useState<any[]>([]);
  const [fps, setFps] = useState(0);
  const prevLandmarksRef = useRef<any[]>([]);
  const oneEuroRef = useRef<{ x: OneEuroFilter[]; y: OneEuroFilter[] } | null>(null);
  const prevTRef = useRef<number | null>(null);
  const frameCount = useSharedValue(0);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCount.value);
      frameCount.value = 0; 
    }, 1000);
    return () => clearInterval(interval);
  }, [frameCount]);

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

    // MediaPipe Pose Landmark models output x,y normalized in [0,1] relative to the input frame.
    // Map directly into screen space.
    for (let i = 0; i < 33; i++) {
      const rawX = rawLandmarks[i * 5];
      const rawY = rawLandmarks[i * 5 + 1];
      const x = rawX * frame.width;
      const y = rawY * frame.height;
      // During debug, treat all landmarks as visible so we can see something even if visibility is low.
      const vis = 1.0;
      parsed.push({ x, y, vis });
    }

    updateLandmarks(parsed);
  }, [tfModel, frameCount]);

  const { linesPath, dotsPath } = useMemo(() => {
    const lines = Skia.Path.Make();
    const dots = Skia.Path.Make();

    if (landmarks && landmarks.length === 33) {
      for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
        const [p1_idx, p2_idx] = POSE_CONNECTIONS[i];
        const p1 = landmarks[p1_idx];
        const p2 = landmarks[p2_idx];
        lines.moveTo(p1.x, p1.y);
        lines.lineTo(p2.x, p2.y);
      }
      for (let i = 0; i < 33; i++) {
        const lm = landmarks[i];
        dots.addCircle(lm.x, lm.y, 6);
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

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} frameProcessor={frameProcessor} />

      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={linesPath} color="rgba(0, 230, 200, 0.85)" style="stroke" strokeWidth={3} />
        <Path path={dotsPath} color="rgba(0, 255, 180, 0.9)" style="fill" />
      </Canvas>

      {/* Simple debug HUD: FPS */}
      <View style={styles.topBar}>
        <View style={styles.fpsPill}>
          <Text style={styles.fpsText}>{fps}</Text>
          <Text style={styles.fpsLabel}>FPS</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
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
});