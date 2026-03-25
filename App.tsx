import React, { useEffect, useState, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, AppState, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, useCameraFormat } from 'react-native-vision-camera';
import { Canvas, Path, Skia, Rect } from '@shopify/react-native-skia';
import { Worklets, useSharedValue } from 'react-native-worklets-core'; 
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], 
  [11, 23], [12, 24], [23, 24], 
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], 
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]  
];

const SMOOTHING_ALPHA = 0.35; 
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothingFactor = (cutoff: number, dt: number) => { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); };
const expSmoothing = (a: number, x: number, xPrev: number) => a * x + (1 - a) * xPrev;

class OneEuroFilter {
  private minCutoff: number; private beta: number; private dCutoff: number;
  private xPrev: number | null = null; private dxPrev: number = 0;
  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
  }
  reset(x: number) { this.xPrev = x; this.dxPrev = 0; }
  filter(x: number, dt: number) {
    if (this.xPrev == null) { this.reset(x); return x; }
    const safeDt = clamp(dt, 1 / 120, 1 / 5); 
    const dx = (x - this.xPrev) / safeDt;
    const aD = smoothingFactor(this.dCutoff, safeDt);
    const dxHat = expSmoothing(aD, dx, this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(cutoff, safeDt);
    const xHat = expSmoothing(a, x, this.xPrev);
    this.xPrev = xHat; this.dxPrev = dxHat;
    return xHat;
  }
}

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front'); 
  const { resize } = useResizePlugin();

  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 }
  ]);

  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setIsActive(nextAppState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const modelSource = require('./assets/pose_landmark_full.tflite');
  const tfModel = useTensorflowModel(modelSource);

  const activeVisThresh = 0.4; 

  const [landmarks, setLandmarks] = useState<any[]>([]);
  const [fps, setFps] = useState(0);
  const [debugText, setDebugText] = useState('Waiting for AI data...');
  const [guideBox, setGuideBox] = useState({ x: 0, y: 0, size: 0 });

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
      oneEuroRef.current = null; prevTRef.current = null; prevLandmarksRef.current = [];
      setLandmarks(parsed || []); return;
    }
    const prev = prevLandmarksRef.current;
    if (prev.length !== 33) {
      oneEuroRef.current = {
        x: new Array(33).fill(null).map(() => new OneEuroFilter(1.2, 0.02, 1.0)),
        y: new Array(33).fill(null).map(() => new OneEuroFilter(1.2, 0.02, 1.0)),
      };
      prevTRef.current = Date.now() / 1000; prevLandmarksRef.current = parsed;
      setLandmarks(parsed); return;
    }
    const now = Date.now() / 1000; const dt = now - (prevTRef.current ?? now); prevTRef.current = now;
    const fx = oneEuroRef.current!.x; const fy = oneEuroRef.current!.y;

    const smoothed = parsed.map((p: any, i: number) => {
      const prevP = prev[i];
      const vis = SMOOTHING_ALPHA * p.vis + (1 - SMOOTHING_ALPHA) * prevP.vis;
      return {
        x: SMOOTHING_ALPHA * fx[i].filter(p.x, dt) + (1 - SMOOTHING_ALPHA) * prevP.x,
        y: SMOOTHING_ALPHA * fy[i].filter(p.y, dt) + (1 - SMOOTHING_ALPHA) * prevP.y,
        vis,
      };
    });
    prevLandmarksRef.current = smoothed; setLandmarks(smoothed);
  };

  const updateUI = Worklets.createRunOnJS((parsed: any[], text: string, boxInfo: any) => {
    applySmoothing(parsed);
    setDebugText(text);
    if (boxInfo) setGuideBox(boxInfo);
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    frameCount.value += 1;

    if (tfModel.state !== 'loaded' || tfModel.model == null) return;

    try {
      // 1. EXTRACT THE EXACT CENTER SQUARE
      const minDim = Math.min(frame.width, frame.height);
      const cropX = (frame.width - minDim) / 2.0;
      const cropY = (frame.height - minDim) / 2.0;

      // 2. THE FIX: Force 90deg rotation to make the landscape sensor sit perfectly upright
      let rotation = '90deg'; 
      if (frame.orientation === 'portrait') rotation = '0deg';

      const resized = resize(frame, { 
        crop: { x: cropX, y: cropY, width: minDim, height: minDim },
        scale: { width: 256, height: 256 }, 
        rotation: rotation as any,
        pixelFormat: 'rgb', 
        dataType: 'float32' 
      });
      
      const outputs = tfModel.model.runSync([resized]);
      
      const rawLandmarks = outputs[0] as Float32Array; 
      const rawPresenceArray = outputs[1] as Float32Array;
      if (!rawLandmarks || rawLandmarks.length < 165 || !rawPresenceArray) return;

      const presence = rawPresenceArray[0];
      let debugStr = `Presence: ${(presence * 100).toFixed(0)}%`;

      // 3. CENTER-TO-CENTER MATH (Flawless Screen Alignment)
      // Figure out how big the logical camera frame is on the physical screen
      const logicalWidth = Math.min(frame.width, frame.height);
      const logicalHeight = Math.max(frame.width, frame.height);
      const scale = Math.max(SCREEN_WIDTH / logicalWidth, SCREEN_HEIGHT / logicalHeight);
      
      // The exact pixel size of the AI's "Square Crop" when rendered on your phone screen
      const squareSizeOnScreen = minDim * scale;

      // UI Box coords (perfectly centered on screen)
      const boxX = (SCREEN_WIDTH / 2.0) - (squareSizeOnScreen / 2.0);
      const boxY = (SCREEN_HEIGHT / 2.0) - (squareSizeOnScreen / 2.0);

      if (presence < 0.3) {
        updateUI([], debugStr, { x: boxX, y: boxY, size: squareSizeOnScreen });
        return;
      }

      const parsed: any[] = []; 
      for (let i = 0; i < 33; i++) {
        let normX = rawLandmarks[i * 5] / 256.0;
        let normY = rawLandmarks[i * 5 + 1] / 256.0;

        // Front Camera Mirror
        normX = 1.0 - normX;

        // Shift coordinates so 0,0 is the dead center of the square
        const centerX = normX - 0.5;
        const centerY = normY - 0.5;

        // Map from the physical center of the phone screen outward
        const x = (SCREEN_WIDTH / 2.0) + (centerX * squareSizeOnScreen);
        const y = (SCREEN_HEIGHT / 2.0) + (centerY * squareSizeOnScreen);
        
        const rawVis = rawLandmarks[i * 5 + 3];
        const vis = 1.0 / (1.0 + Math.exp(-rawVis));

        parsed.push({ x, y, vis });
      }

      updateUI(parsed, debugStr, { x: boxX, y: boxY, size: squareSizeOnScreen });

    } catch (e) {
      if (frameCount.value % 15 === 0) console.log(e);
    }
  }, [tfModel, frameCount]);

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

  return (
    <View style={styles.container}>
      <Camera 
        style={StyleSheet.absoluteFill} 
        device={device} 
        format={format}
        fps={30}
        isActive={isActive && hasPermission} 
        frameProcessor={frameProcessor} 
      />

      <Canvas style={StyleSheet.absoluteFill}>
        {guideBox.size > 0 && (
           <Rect 
             x={guideBox.x} 
             y={guideBox.y} 
             width={guideBox.size} 
             height={guideBox.size} 
             color="red" 
             style="stroke" 
             strokeWidth={4} 
           />
        )}
        <Path path={linesPath} color="rgba(0, 230, 200, 0.85)" style="stroke" strokeWidth={3} />
        <Path path={dotsPath} color="rgba(0, 255, 180, 0.9)" style="fill" />
      </Canvas>

      <View style={styles.topBar}>
        <View style={styles.fpsPill}>
          <Text style={styles.fpsText}>{fps}</Text>
          <Text style={styles.fpsLabel}>FPS</Text>
        </View>
      </View>
      
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>{debugText}</Text>
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
  debugPanel: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 10,
    borderRadius: 8,
  },
  debugText: {
    color: '#00e6c8',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center'
  }
});