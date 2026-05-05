/**
 * CameraScreen — runs MediaPipe pose detection, buffers kick frames, runs
 * FrontSnapAnalyzer, and routes feedback to either Quick HUD overlay or
 * Full Analysis review screen.
 *
 * Performance:
 *  - JSON.parse only when frame received; skip frames during cooldown/pause.
 *  - FPS counter updates via ref + 1Hz setState (no re-render storm).
 *  - Heavy work (analyzer, save) deferred via InteractionManager.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet, View, Dimensions, Text, TouchableOpacity, StatusBar, InteractionManager, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RNMediapipe } from '@thinksys/react-native-mediapipe';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import type { TrainStackParamList, KickMode, EngineData } from '../types';
import { requestCameraPermission } from '../utils/permissions';
import { supabase } from '../lib/supabase';
import { createSession, endSession } from '../services/sessions';
import { saveKick } from '../services/kicks';
import { saveKickFrames } from '../services/kickFrames';
import { getDailyProgress, maybeAdvanceStreak } from '../services/goals';
import { setPendingKick } from '../engine/pendingKick';
import { J, frameUsable, detectKickingLeg, type Landmark, type PoseFrame } from '../engine/biomech';
import { analyzeFrontSnap } from '../engine/FrontSnapAnalyzer';
import { analyzeSideKick } from '../engine/SideKickAnalyzer';
import { analyzeRoundhouse } from '../engine/RoundhouseAnalyzer';
import type { KickResult, CriterionResult } from '../engine/FrontSnapAnalyzer';

const { width, height } = Dimensions.get('window');

type Props = NativeStackScreenProps<TrainStackParamList, 'Camera'>;

type Phase = 'IDLE' | 'RECORDING' | 'COOLDOWN';

const PRE_ROLL = 5;          // frames captured before kick starts (chamber prep)
const MIN_KICK_FRAMES = 8;   // ignore noise
const COOLDOWN_FRAMES = 6;   // require N idle frames before next kick
const KNEE_VEL_ONSET = 0.06; // image-space delta-Y per frame to trigger (≈ knee rising fast)

export default function CameraScreen({ route, navigation }: Props) {
  const kickMode: KickMode = route.params?.kickMode ?? 'Front Snap';
  const analysisMode = route.params?.analysisMode ?? 'Quick';
  const insets = useSafeAreaInsets();
  const [hasPermission, setHasPermission] = useState(false);

  // Quick HUD live state (only these cause re-render)
  const [score, setScore] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<string>('READY');
  const [headlineCue, setHeadlineCue] = useState<string>('Stand in frame, then kick.');
  const [notice, setNotice] = useState<string>('');   // transient: lost tracking / ignored noise
  const [kickCount, setKickCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [criteria, setCriteria] = useState<CriterionResult[]>([]);
  const showDebug = kickMode !== 'Front Snap';

  // Refs (transient state — no re-render)
  const phaseRef = useRef<Phase>('IDLE');
  const buffer = useRef<PoseFrame[]>([]);
  const preRoll = useRef<PoseFrame[]>([]);
  const lastKneeY = useRef<{ left: number; right: number }>({ left: 0.5, right: 0.5 });
  const cooldownLeft = useRef(0);
  const sessionId = useRef<string | null>(null);
  const userId = useRef<string | null>(null);
  const totalKicks = useRef(0);
  const goodKicks = useRef(0);
  const badKicks = useRef(0);
  const maxStreak = useRef(0);
  const curStreak = useRef(0);
  const isPausedRef = useRef(false);

  // FPS tracking — ref-driven, 1Hz state update
  const fpsCount = useRef(0);
  const fpsLast = useRef(Date.now());
  const [fps, setFps] = useState(0);

  /* ── Permission + session lifecycle ── */
  useEffect(() => {
    requestCameraPermission().then(setHasPermission);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId.current = session.user.id;
        const { data } = await createSession(session.user.id, kickMode);
        if (data) sessionId.current = data.id;
      }
    })();

    return () => {
      if (sessionId.current) {
        endSession(sessionId.current, {
          total_kicks: totalKicks.current,
          good_kicks: goodKicks.current,
          bad_kicks: badKicks.current,
          max_streak: maxStreak.current,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Process one analyzed kick ── */
  const finalizeKick = useCallback((frames: PoseFrame[]) => {
    if (frames.length < MIN_KICK_FRAMES) {
      // Don't overwrite previous kick's score/verdict/cue — just flash a small notice
      setNotice(`Ignored — only ${frames.length} frames captured.`);
      setTimeout(() => setNotice(''), 2500);
      return;
    }
    const leg = detectKickingLeg(frames.map(f => f.image)) ?? 'Right';

    InteractionManager.runAfterInteractions(() => {
      let result: KickResult;
      try {
        result = kickMode === 'Side Kick'
          ? analyzeSideKick(frames, leg)
          : kickMode === 'Roundhouse'
            ? analyzeRoundhouse(frames, leg)
            : analyzeFrontSnap(frames, leg);
      } catch (e) {
        console.warn('[CameraScreen] analyze failed:', e);
        return;
      }

      totalKicks.current += 1;
      const passed = result.score >= 70;
      if (passed) {
        goodKicks.current += 1;
        curStreak.current += 1;
        if (curStreak.current > maxStreak.current) maxStreak.current = curStreak.current;
      } else {
        badKicks.current += 1;
        curStreak.current = 0;
      }

      // Update Quick HUD
      setKickCount(totalKicks.current);
      setScore(result.score);
      setVerdict(result.verdict);
      setHeadlineCue(result.headlineCue || `${result.tier} • ${result.score}/100`);
      setCriteria(result.criteria);
      setNotice(''); // clear any stale abort notice on a successful kick

      // Persist
      const engineData: EngineData = {
        score: result.score,
        feedback: result.criteria.filter(c => !c.pass).map(c => c.cue),
        errors: result.criteria.filter(c => !c.pass).map(c => c.id),
        leg,
        peakAngle: result.metrics.peakKneeAngleDeg,
        kickMode,
        // Rich data for fighter-attribute scoring (additive, optional)
        passedCriteria: result.criteria.filter(c => c.pass && c.severity !== 'info').map(c => c.id),
        metrics: {
          peakKneeAngularVelDegPerSec: result.metrics.peakKneeAngularVelDegPerSec,
          peakFootSpeedMS: result.metrics.peakFootSpeedMS,
          extensionMs: result.metrics.extensionMs,
          chamberMs: result.metrics.chamberMs,
          totalMs: result.metrics.totalMs,
          recoilToExtensionRatio: result.metrics.recoilToExtensionRatio,
        },
      };

      // Generate a temp key now so we can navigate immediately for Full mode
      // without waiting for the Supabase round-trip.
      const tempKey = `tmp:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

      if (analysisMode === 'Full') {
        // Seed the in-memory bridge so KickReview gets data instantly.
        setPendingKick(tempKey, {
          frames,
          peakIdx: result.peakFrameIdx,
          chamberIdx: result.chamberFrameIdx,
          leg,
          kickMode,
        });
        isPausedRef.current = true;
        navigation.navigate('KickReview', { kickId: tempKey });
      }

      if (userId.current && sessionId.current) {
        saveKick(userId.current, sessionId.current, kickMode, engineData)
          .then(({ data }) => {
            if (!data) return;
            saveKickFrames({
              kickId: data.id,
              userId: userId.current!,
              frames,
              peakIdx: result.peakFrameIdx,
              chamberIdx: result.chamberFrameIdx,
              leg,
            });
            // Streak: best-effort — if today's goals are now met, advance.
            getDailyProgress(userId.current!)
              .then(dp => maybeAdvanceStreak(userId.current!, dp))
              .catch(() => {});
          })
          .catch(e => console.warn('[CameraScreen] saveKick failed:', e));
      }
    });
  }, [kickMode, analysisMode, navigation]);

  /* ── Landmark callback (per frame) ── */
  const handleLandmarks = useCallback((data: any) => {
    if (isPausedRef.current) return;

    fpsCount.current += 1;
    const now = Date.now();
    if (now - fpsLast.current >= 1000) {
      setFps(fpsCount.current);
      fpsCount.current = 0;
      fpsLast.current = now;
    }

    let parsed: any;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch { return; }

    const image: Landmark[] = parsed?.landmarks ?? [];
    const world: Landmark[] = parsed?.worldLandmarks ?? [];
    if (image.length < 33) return;
    // worldLandmarks may be empty if MediaPipe failed to compute — skip
    if (world.length < 33) return;
    if (!frameUsable(image)) {
      if (phaseRef.current === 'RECORDING') {
        phaseRef.current = 'IDLE';
        setPhase('IDLE');
        buffer.current = [];
        // Don't overwrite the previous kick's score/cue — just flash a notice
        setNotice('Lost tracking — kick aborted.');
        setTimeout(() => setNotice(''), 2500);
      }
      return;
    }

    const frame: PoseFrame = { image, world, t: now };

    preRoll.current.push(frame);
    if (preRoll.current.length > PRE_ROLL) preRoll.current.shift();

    const lKneeY = image[J.L_KNEE].y;
    const rKneeY = image[J.R_KNEE].y;
    const lDelta = lastKneeY.current.left - lKneeY;
    const rDelta = lastKneeY.current.right - rKneeY;
    lastKneeY.current = { left: lKneeY, right: rKneeY };
    const maxRise = Math.max(lDelta, rDelta);

    const hipY = (image[J.L_HIP].y + image[J.R_HIP].y) / 2;
    const kneeY = (lKneeY + rKneeY) / 2;
    const isStanding = hipY < kneeY;

    if (cooldownLeft.current > 0) {
      cooldownLeft.current -= 1;
      return;
    }

    if (phaseRef.current === 'IDLE') {
      if (isStanding && maxRise > KNEE_VEL_ONSET) {
        phaseRef.current = 'RECORDING';
        setPhase('RECORDING');
        buffer.current = [...preRoll.current];
        setHeadlineCue('Recording...');
      }
    } else if (phaseRef.current === 'RECORDING') {
      buffer.current.push(frame);

      const lAnkleY = image[J.L_ANKLE].y;
      const rAnkleY = image[J.R_ANKLE].y;
      const ankleNearGround = Math.min(lAnkleY, rAnkleY) > hipY + 0.15;
      const tooLong = buffer.current.length > 60;

      if ((ankleNearGround && buffer.current.length > MIN_KICK_FRAMES) || tooLong) {
        const captured = buffer.current;
        buffer.current = [];
        phaseRef.current = 'COOLDOWN';
        setPhase('COOLDOWN');
        cooldownLeft.current = COOLDOWN_FRAMES;
        finalizeKick(captured);
        setTimeout(() => {
          if (phaseRef.current === 'COOLDOWN') {
            phaseRef.current = 'IDLE';
            setPhase('IDLE');
          }
        }, 250);
      }
    }
  }, [finalizeKick]);

  /* ── Resume detection when returning from review ── */
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      isPausedRef.current = false;
      phaseRef.current = 'IDLE';
      setPhase('IDLE');
      buffer.current = [];
    });
    return unsub;
  }, [navigation]);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
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
        face={false}
        leftArm={true} rightArm={true}
        leftWrist={true} rightWrist={true}
        torso={true}
        leftLeg={true} rightLeg={true}
        leftAnkle={true} rightAnkle={true}
        onLandmark={handleLandmarks}
      />

      {/* Top HUD — extends to top edge */}
      <View style={styles.topHud}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.topLeft}>
            <Text style={styles.modeText}>{kickMode.toUpperCase()}</Text>
            <Text style={styles.subModeText}>{analysisMode.toUpperCase()}</Text>
          </View>
          <View style={styles.topRight}>
            <Text style={styles.fpsText}>{fps} fps</Text>
            <Text style={styles.kicksText}>{kickCount} kicks</Text>
          </View>
        </View>

        {phase === 'RECORDING' && (
          <View style={styles.recDot}>
            <View style={styles.recCircle} />
            <Text style={styles.recText}>RECORDING</Text>
          </View>
        )}
      </View>

      {/* Bottom HUD: minimal Quick layout — no background box */}
      <View style={[styles.bottomHud, { paddingBottom: insets.bottom + spacing.lg }]}>
        {notice !== '' && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
        {score !== null && (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreNumber}>{score}</Text>
            <Text style={styles.scoreSlash}>/100</Text>
          </View>
        )}
        <Text style={[
          styles.verdict,
          verdict === 'SNAP' && { color: colors.accent },
          verdict === 'PUSH' && { color: colors.warning },
          (verdict === 'LOW' || verdict === 'SLOPPY') && { color: colors.error },
        ]}>{verdict}</Text>
        <Text style={styles.cue}>{headlineCue}</Text>

        {/* Debug list — only shown during Side Kick testing */}
        {showDebug && criteria.length > 0 && (
          <ScrollView
            style={styles.critList}
            contentContainerStyle={{ paddingBottom: spacing.xs }}
            showsVerticalScrollIndicator={false}>
            {criteria.map(c => (
              <View key={c.id} style={styles.critRow}>
                <Text style={[styles.critIcon, { color: c.pass ? colors.accent : colors.error }]}>
                  {c.pass ? '✓' : '✗'}
                </Text>
                <Text style={styles.critName} numberOfLines={1}>{c.label}</Text>
                <Text style={styles.critValue}>
                  {c.value.toFixed(c.unit === 'ratio' ? 2 : c.unit === 'ms' ? 0 : 1)}
                  {c.unit === 'deg' ? '°' : c.unit === 'ms' ? 'ms' : c.unit === 'deg/s' ? '°/s' : c.unit === 'm/s' ? 'm/s' : c.unit === 'm' ? 'm' : ''}
                  {' / '}{c.target}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Elegant exit — pill button under feedback */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <Text style={styles.endBtnText}>END SESSION</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  permissionContainer: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl,
  },
  permissionTitle: {
    fontSize: 22, fontWeight: '700', color: colors.textPrimary,
    marginBottom: spacing.sm, textAlign: 'center',
  },
  permissionBody: {
    fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24,
  },

  topHud: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  topLeft: {},
  modePill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  modeText: {
    fontFamily: fonts.montserratBlack, fontSize: 18, color: colors.white, letterSpacing: 1.4,
  },
  subModeText: {
    fontFamily: fonts.oswaldBold, fontSize: 16, color: colors.white, letterSpacing: 2,
  },
  topRight: { alignItems: 'flex-end' },
  fpsText: {
    fontFamily: fonts.interMedium, fontSize: 16, color: 'rgba(255,255,255,0.85)',
  },
  kicksText: {
    fontFamily: fonts.montserratBlack, fontSize: 28, color: colors.white,
  },
  recDot: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    marginTop: spacing.md, gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  recCircle: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  recText: {
    fontFamily: fonts.oswaldBold, fontSize: 11, color: colors.white, letterSpacing: 1.5,
  },

  bottomHud: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: spacing.lg,
  },
  scoreCard: {
    flexDirection: 'row', alignItems: 'baseline',
  },
  scoreNumber: {
    fontFamily: fonts.montserratBlack, fontSize: 96, color: colors.white,
    lineHeight: 100, includeFontPadding: false,
  },
  scoreSlash: {
    fontFamily: fonts.oswaldRegular, fontSize: 20, color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  verdict: {
    fontFamily: fonts.montserratBlack, fontSize: 32, color: colors.white,
    letterSpacing: 3, marginTop: spacing.xs,
  },
  cue: {
    fontFamily: fonts.interMedium, fontSize: 18, color: colors.white,
    textAlign: 'center', marginTop: spacing.sm, lineHeight: 24,
  },

  exitBtn: {
    position: 'absolute', right: spacing.md,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  exitText: { color: colors.white, fontSize: 18, fontWeight: '600' },

  endBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  endBtnText: {
    fontFamily: fonts.oswaldBold, fontSize: 13, color: colors.white,
    letterSpacing: 2,
  },

  notice: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  noticeText: {
    fontFamily: fonts.oswaldBold, fontSize: 12, color: colors.warning,
    letterSpacing: 1.2,
  },

  critList: {
    width: '100%',
    maxHeight: 220,
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  critRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 3,
  },
  critIcon: {
    fontFamily: fonts.montserratBold, fontSize: 14, width: 18, textAlign: 'center',
  },
  critName: {
    fontFamily: fonts.interMedium, fontSize: 11, color: colors.white,
    flex: 1, marginLeft: 4,
  },
  critValue: {
    fontFamily: fonts.interRegular, fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
});
