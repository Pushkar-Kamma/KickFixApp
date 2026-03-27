import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Dimensions, Text, PermissionsAndroid, Platform, TouchableOpacity } from 'react-native';
import { RNMediapipe } from '@thinksys/react-native-mediapipe';
import { analyzeRoundhouse, analyzeSideKick, analyzeFrontSnap, JOINTS, Point, calculateAngle } from './KickAnalyzer';

const { width, height } = Dimensions.get('window');

type KickMode = 'Roundhouse' | 'Side Kick' | 'Front Snap';
type AppState = 'IDLE' | 'RECORDING' | 'ANALYZING';

export default function App() {
  const [hasPermission, setHasPermission] = useState(false);
  
  // --- UI STATES ---
  const [currentMode, setCurrentMode] = useState<KickMode>('Roundhouse');
  const [totalKicks, setTotalKicks] = useState(0);
  const [goodKicks, setGoodKicks] = useState(0);
  const [feedbackDisplay, setFeedbackDisplay] = useState<string[]>(["Stand in frame", "Select a kick mode below"]);
  const [fps, setFps] = useState(0);

  // --- MEMORY REFS (For performance, no UI re-renders here) ---
  const appState = useRef<AppState>('IDLE');
  const frameBuffer = useRef<Point[][]>([]);
  const activeLeg = useRef<'Left' | 'Right' | null>(null);
  
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());

  useEffect(() => {
    const requestCameraPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasPermission(true);
      }
    };
    requestCameraPermission();
  }, []);

  const handleLandmarks = (data: any) => {
    // 1. FPS Tracker
    frameCount.current += 1;
    const now = Date.now();
    if (now - lastTime.current >= 1000) {
      setFps(frameCount.current);
      frameCount.current = 0;
      lastTime.current = now;
    }

    try {
      // 2. THE JSON FIX
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      let points: Point[] = [];
      if (parsedData && parsedData.landmarks) {
        points = parsedData.landmarks;
      } else if (Array.isArray(parsedData)) {
        points = parsedData;
      }

      if (points.length < 33) return; // Ignore bad frames

      // 3. THE KICK STATE MACHINE
      // Determine which leg is moving by checking knee height relative to hips
      const leftKneeY = points[JOINTS.LEFT_KNEE].y;
      const rightKneeY = points[JOINTS.RIGHT_KNEE].y;
      const hipLevel = (points[JOINTS.LEFT_HIP].y + points[JOINTS.RIGHT_HIP].y) / 2;

      // MediaPipe Y coordinates go from 0 (top) to 1 (bottom). 
      // If Y is smaller, the knee is higher.
      const isLeftKneeRaised = leftKneeY < hipLevel;
      const isRightKneeRaised = rightKneeY < hipLevel;

      if (appState.current === 'IDLE') {
        if (isLeftKneeRaised || isRightKneeRaised) {
          appState.current = 'RECORDING';
          activeLeg.current = isLeftKneeRaised ? 'Left' : 'Right';
          frameBuffer.current = [points];
          // We use direct state setting here because we want the UI to update immediately
          setFeedbackDisplay(["Recording Kick..."]); 
        }
      } 
      else if (appState.current === 'RECORDING') {
        // Keep saving frames as long as the knee is raised
        frameBuffer.current.push(points);

        // If the knee drops back down, the kick is over! Time to analyze.
        const currentKnee = activeLeg.current === 'Left' ? leftKneeY : rightKneeY;
        if (currentKnee > hipLevel) {
          appState.current = 'ANALYZING';
          
          // Find the "Apex" (the frame where the leg was most extended)
          let apexFrame = frameBuffer.current[0];
          let maxExtension = 0;
          
          for (const frame of frameBuffer.current) {
            const hip = activeLeg.current === 'Left' ? frame[JOINTS.LEFT_HIP] : frame[JOINTS.RIGHT_HIP];
            const knee = activeLeg.current === 'Left' ? frame[JOINTS.LEFT_KNEE] : frame[JOINTS.RIGHT_KNEE];
            const ankle = activeLeg.current === 'Left' ? frame[JOINTS.LEFT_ANKLE] : frame[JOINTS.RIGHT_ANKLE];
            
            const ext = calculateAngle(hip, knee, ankle);
            if (ext > maxExtension) {
              maxExtension = ext;
              apexFrame = frame;
            }
          }

          // Run the chosen math logic
          let result;
          if (currentMode === 'Roundhouse') {
            result = analyzeRoundhouse(frameBuffer.current[0], apexFrame, activeLeg.current!);
          } else if (currentMode === 'Side Kick') {
            result = analyzeSideKick(frameBuffer.current[0], apexFrame, activeLeg.current!);
          } else {
            result = analyzeFrontSnap(frameBuffer.current[0], apexFrame, activeLeg.current!);
          }

          // Update UI
          setFeedbackDisplay(result.feedback);
          setTotalKicks(prev => prev + 1);
          if (result.errors.length === 0) {
            setGoodKicks(prev => prev + 1);
          }

          // Reset for the next kick
          frameBuffer.current = [];
          activeLeg.current = null;
          appState.current = 'IDLE';
        }
      }
    } catch (e) {
      // Ignore bad frames silently
    }
  };

  if (!hasPermission) return <View style={styles.center}><Text style={styles.text}>Waiting for Camera...</Text></View>;

  return (
    <View style={styles.container}>
      <RNMediapipe 
        width={width} height={height} 
        face={true} leftArm={true} rightArm={true} leftWrist={true} rightWrist={true} 
        torso={true} leftLeg={true} rightLeg={true} leftAnkle={true} rightAnkle={true} 
        onLandmark={handleLandmarks} 
      />

      <View style={styles.topHud}>
        <View style={styles.statsRow}>
          <Text style={styles.hudText}>GOOD: {goodKicks} / {totalKicks}</Text>
          <Text style={styles.hudText}>FPS: {fps}</Text>
        </View>
        <View style={styles.feedbackBox}>
          <Text style={styles.modeText}>MODE: {currentMode}</Text>
          {feedbackDisplay.map((line, i) => {
            const isGood = line.includes("Great") || line.includes("Solid") || line.includes("PERFECT") || line.includes("Good");
            const isWarning = line.includes("Recording") || line.includes("Switched");
            return (
              <Text key={i} style={[
                styles.feedbackText, 
                isGood ? { color: 'lime' } : isWarning ? { color: 'gold' } : { color: 'red' }
              ]}>
                {line}
              </Text>
            );
          })}
        </View>
      </View>

      <View style={styles.bottomHud}>
        {(['Roundhouse', 'Side Kick', 'Front Snap'] as KickMode[]).map(mode => (
          <TouchableOpacity 
            key={mode} 
            style={[styles.modeButton, currentMode === mode && styles.modeButtonActive]}
            onPress={() => {
              setCurrentMode(mode);
              setFeedbackDisplay([`Switched to ${mode}`]);
            }}
          >
            <Text style={[styles.buttonText, currentMode === mode && styles.buttonTextActive]}>
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { color: 'white', fontSize: 16 },
  
  topHud: { position: 'absolute', top: 40, left: 20, right: 20, zIndex: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  hudText: { color: 'lime', fontWeight: 'bold', fontSize: 18, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 5 },
  
  feedbackBox: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#444' },
  modeText: { color: 'cyan', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  feedbackText: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  
  bottomHud: { position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'space-evenly', zIndex: 10 },
  modeButton: { backgroundColor: 'rgba(50,50,50,0.8)', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: 'gray' },
  modeButtonActive: { backgroundColor: 'cyan', borderColor: 'white' },
  buttonText: { color: 'white', fontWeight: 'bold' },
  buttonTextActive: { color: 'black' }
});