import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Dimensions,
  Text,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RNMediapipe } from '@thinksys/react-native-mediapipe';
import {
  analyzeRoundhouse,
  analyzeSideKick,
  analyzeFrontSnap,
  JOINTS,
  Point,
  kickAnkleSeparationThreshold,
  MIN_FRAME_COUNT,
  isVisibleEnough,
} from '../engine/KickAnalyzer';
import { colors, spacing, borderRadius } from '../theme';
import { KickMode, AppState } from '../types';
import { requestCameraPermission } from '../utils/permissions';

const { width, height } = Dimensions.get('window');

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [hasPermission, setHasPermission] = useState(false);

  const [currentMode, setCurrentMode] = useState<KickMode>('Roundhouse');
  const [totalKicks, setTotalKicks] = useState(0);
  const [goodKicks, setGoodKicks] = useState(0);
  const [feedbackDisplay, setFeedbackDisplay] = useState<string[]>([
    'Stand in frame',
    'Select a kick mode below',
  ]);
  const [fps, setFps] = useState(0);

  const appState = useRef<AppState>('IDLE');
  const frameBuffer = useRef<Point[][]>([]);
  const activeLeg = useRef<'Left' | 'Right' | null>(null);
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());

  useEffect(() => {
    requestCameraPermission().then(setHasPermission);
  }, []);

  const handleLandmarks = useCallback(
    (data: any) => {
      frameCount.current += 1;
      const now = Date.now();
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastTime.current = now;
      }

      try {
        const parsedData =
          typeof data === 'string' ? JSON.parse(data) : data;
        let points: Point[] = [];
        if (parsedData && parsedData.landmarks) {
          points = parsedData.landmarks;
        } else if (Array.isArray(parsedData)) {
          points = parsedData;
        }

        if (points.length < 33) return;

        const w = width;
        const h = height;

        if (!isVisibleEnough(points)) {
          if (appState.current === 'RECORDING') {
            appState.current = 'IDLE';
            frameBuffer.current = [];
            activeLeg.current = null;
            setFeedbackDisplay(['Lost tracking — kick aborted']);
          }
          return;
        }

        const leftAnkleY = points[JOINTS.LEFT_ANKLE].y * h;
        const rightAnkleY = points[JOINTS.RIGHT_ANKLE].y * h;
        const diff = rightAnkleY - leftAnkleY;

        const hipsY =
          ((points[JOINTS.LEFT_HIP].y + points[JOINTS.RIGHT_HIP].y) / 2) * h;
        const kneesY =
          ((points[JOINTS.LEFT_KNEE].y + points[JOINTS.RIGHT_KNEE].y) / 2) * h;
        const isStanding = hipsY < kneesY;

        const kickSepPx = kickAnkleSeparationThreshold(points, w, h);

        let leftKicking = false;
        let rightKicking = false;
        if (isStanding) {
          if (diff > kickSepPx) {
            leftKicking = true;
          } else if (diff < -kickSepPx) {
            rightKicking = true;
          }
        }
        const isKicking = leftKicking || rightKicking;

        if (appState.current === 'IDLE') {
          if (isKicking) {
            appState.current = 'RECORDING';
            activeLeg.current = leftKicking ? 'Left' : 'Right';
            frameBuffer.current = [];
            setFeedbackDisplay(['Recording Kick...']);
          }
        } else if (appState.current === 'RECORDING') {
          if (isKicking) {
            frameBuffer.current.push(points);
          } else {
            const history = frameBuffer.current;
            const leg = activeLeg.current!;
            frameBuffer.current = [];
            activeLeg.current = null;
            appState.current = 'IDLE';

            if (history.length > MIN_FRAME_COUNT) {
              let result;
              if (currentMode === 'Roundhouse') {
                result = analyzeRoundhouse(history, leg, w, h);
              } else if (currentMode === 'Side Kick') {
                result = analyzeSideKick(history, leg, w, h);
              } else {
                result = analyzeFrontSnap(history, leg, w, h);
              }
              setFeedbackDisplay(result.feedback);
              setTotalKicks(t => t + 1);
              if (result.errors.length === 0) {
                setGoodKicks(g => g + 1);
              }
            } else {
              setFeedbackDisplay([
                `Ignored noise (${history.length} frames; need > ${MIN_FRAME_COUNT})`,
              ]);
            }
          }
        }
      } catch (_e) {
        // Ignore bad frames
      }
    },
    [currentMode, width, height],
  );

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          KickFix needs camera access to analyze your kicks in real-time.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <RNMediapipe
        width={width}
        height={height}
        face={true}
        leftArm={true}
        rightArm={true}
        leftWrist={true}
        rightWrist={true}
        torso={true}
        leftLeg={true}
        rightLeg={true}
        leftAnkle={true}
        rightAnkle={true}
        onLandmark={handleLandmarks}
      />

      {/* Top HUD */}
      <View style={[styles.topHud, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>KICKS</Text>
            <Text style={styles.statValue}>
              <Text style={{ color: colors.accent }}>{goodKicks}</Text>
              <Text style={styles.statDivider}> / </Text>
              {totalKicks}
            </Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>FPS</Text>
            <Text style={styles.statValue}>{fps}</Text>
          </View>
        </View>

        {/* Feedback Panel */}
        <View style={styles.feedbackPanel}>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{currentMode.toUpperCase()}</Text>
          </View>
          {feedbackDisplay.map((line, i) => {
            const isGood =
              line.includes('Great') ||
              line.includes('Solid') ||
              line.includes('PERFECT') ||
              line.includes('Good');
            const isWarning =
              line.includes('Recording') ||
              line.includes('Switched') ||
              line.includes('Frames Captured') ||
              line.includes('Lost tracking') ||
              line.includes('Ignored noise');
            return (
              <Text
                key={i}
                style={[
                  styles.feedbackText,
                  isGood
                    ? { color: colors.accent }
                    : isWarning
                      ? { color: colors.warning }
                      : { color: colors.error },
                ]}>
                {line}
              </Text>
            );
          })}
        </View>
      </View>

      {/* Bottom Mode Selector */}
      <View style={[styles.bottomHud, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.modeRow}>
          {(['Roundhouse', 'Side Kick', 'Front Snap'] as KickMode[]).map(
            mode => {
              const isActive = currentMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeButton, isActive && styles.modeButtonActive]}
                  onPress={() => {
                    setCurrentMode(mode);
                    setFeedbackDisplay([`Switched to ${mode}`]);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.modeButtonText,
                      isActive && styles.modeButtonTextActive,
                    ]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              );
            },
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  topHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statPill: {
    backgroundColor: colors.overlay,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statDivider: {
    color: colors.textMuted,
  },

  feedbackPanel: {
    backgroundColor: colors.overlay,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: 1.2,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },

  bottomHud: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    backgroundColor: colors.overlay,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  modeButtonTextActive: {
    color: colors.black,
  },
});
