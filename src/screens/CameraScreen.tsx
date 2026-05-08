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
import { setPendingKick, reconcilePendingKick } from '../engine/pendingKick';
import { bumpTelemetry } from '../services/telemetry';
import { queueKickSave, flushKicksWAL } from '../services/kicksWAL';
import { J, frameUsable, detectKickingLeg, angle3D, lmReq, type Landmark, type PoseFrame, type MediaPipePayload } from '../engine/biomech';
import { analyzeFrontSnap } from '../engine/FrontSnapAnalyzer';
import { analyzeSideKick } from '../engine/SideKickAnalyzer';
import { analyzeRoundhouse } from '../engine/RoundhouseAnalyzer';
import type { KickResult, CriterionResult } from '../engine/FrontSnapAnalyzer';

const { width, height } = Dimensions.get('window');

type Props = NativeStackScreenProps<TrainStackParamList, 'Camera'>;

type Phase = 'IDLE' | 'RECORDING' | 'COOLDOWN';

// Detection thresholds — frame-rate INDEPENDENT (use elapsed time, not frame deltas).
// See THRESHOLDS.md for rationale.
const PRE_ROLL = 5;                // frames captured before kick starts (chamber prep)
const MIN_KICK_FRAMES = 8;         // ignore noise
const COOLDOWN_FRAMES = 6;         // require N idle frames before next kick
/** Min knee angular velocity (deg/s) to trigger RECORDING. World-space, not image. */
const ONSET_KNEE_VEL_DEG_S = 250;
/** Min knee angle (deg) at peak before we'll consider "end of kick". */
const END_PEAK_THRESHOLD_DEG = 130;
/** Knee angle (deg) below which we consider the leg back in chamber position. */
const END_RECHAMBER_THRESHOLD_DEG = 110;
/** Hard safety cap on buffer length (~2s at 30fps). */
const MAX_KICK_FRAMES = 60;

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
  // Per-leg knee angle history for frame-rate-independent angular velocity detection.
  // Each entry: { angle in deg, t in ms }. Only last 2 needed; using object for clarity.
  const lastKneeSample = useRef<{ left: { a: number; t: number } | null; right: { a: number; t: number } | null }>({
    left: null,
    right: null,
  });
  // Peak knee angle during the current RECORDING window (used for end detection).
  const recordingPeakAngle = useRef(0);
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

  // Centralized notice timeout — cleared on unmount to prevent setState-on-unmount
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNotice = useCallback((msg: string, ms = 2500) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), ms);
  }, []);

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
      // Best-effort: drain any queued offline kicks now that we're (probably) online.
      flushKicksWAL().catch(() => {});
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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Process one analyzed kick ── */
  const finalizeKick = useCallback((frames: PoseFrame[]) => {
    if (frames.length < MIN_KICK_FRAMES) {
      bumpTelemetry(userId.current, 'tooShortKicks').catch(() => {});
      flashNotice(`Ignored — only ${frames.length} frames captured.`);
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

      // Discard likely false positives — kicks scoring below 45 are usually
      // detection noise. Don't increment counters or persist, but DO log
      // to local telemetry so we can later evaluate whether the threshold
      // is too aggressive (rejected real kicks) or too loose (passed noise).
      if (result.score < 45) {
        bumpTelemetry(userId.current, 'rejectedKicks').catch(() => {});
        flashNotice(`Ignored — low quality kick (${result.score}/100).`);
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
        const uid = userId.current;
        const sid = sessionId.current;
        saveKick(uid, sid, kickMode, engineData)
          .then(({ data, error }) => {
            if (error || !data) {
              // Surface failure + queue for offline retry.
              bumpTelemetry(uid, 'saveFailures').catch(() => {});
              queueKickSave({
                tempId: tempKey, userId: uid, sessionId: sid,
                kickType: kickMode, engineData,
              }).catch(() => {});
              flashNotice('Saved locally — will sync when online.');
              return;
            }
            bumpTelemetry(uid, 'savedKicks').catch(() => {});
            // Reconcile bridge: copy entry under the real id so review
            // works even if user reopens it later from history.
            reconcilePendingKick(tempKey, data.id);
            saveKickFrames({
              kickId: data.id,
              userId: uid,
              frames,
              peakIdx: result.peakFrameIdx,
              chamberIdx: result.chamberFrameIdx,
              leg,
            });
            // Streak: best-effort — if today's goals are now met, advance.
            getDailyProgress(uid)
              .then(dp => maybeAdvanceStreak(uid, dp))
              .catch(() => {});
          })
          .catch(e => {
            console.warn('[CameraScreen] saveKick failed:', e);
            bumpTelemetry(uid, 'saveFailures').catch(() => {});
            queueKickSave({
              tempId: tempKey, userId: uid, sessionId: sid,
              kickType: kickMode, engineData,
            }).catch(() => {});
            flashNotice('Saved locally — will sync when online.');
          });
      }
    });
  }, [kickMode, analysisMode, navigation, flashNotice]);

  /* ── Landmark callback (per frame) ── */
  const handleLandmarks = useCallback((data: unknown) => {
    if (isPausedRef.current) return;

    fpsCount.current += 1;
    const now = Date.now();
    if (now - fpsLast.current >= 1000) {
      setFps(fpsCount.current);
      fpsCount.current = 0;
      fpsLast.current = now;
    }

    let parsed: MediaPipePayload;
    try {
      parsed = typeof data === 'string'
        ? (JSON.parse(data) as MediaPipePayload)
        : (data as MediaPipePayload);
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
        recordingPeakAngle.current = 0;
        bumpTelemetry(userId.current, 'abortedKicks').catch(() => {});
        flashNotice('Lost tracking — kick aborted.');
      }
      return;
    }

    const frame: PoseFrame = { image, world, t: now };

    preRoll.current.push(frame);
    if (preRoll.current.length > PRE_ROLL) preRoll.current.shift();

    // Knee angles in WORLD coords (rotation+scale invariant).
    const lAngle = angle3D(
      lmReq(world, J.L_HIP), lmReq(world, J.L_KNEE), lmReq(world, J.L_ANKLE),
    );
    const rAngle = angle3D(
      lmReq(world, J.R_HIP), lmReq(world, J.R_KNEE), lmReq(world, J.R_ANKLE),
    );

    // Angular velocity (deg/sec) per leg — frame-rate independent.
    let lVel = 0;
    let rVel = 0;
    const prevL = lastKneeSample.current.left;
    const prevR = lastKneeSample.current.right;
    if (prevL) {
      const dt = (now - prevL.t) / 1000;
      if (dt > 0) lVel = Math.abs(lAngle - prevL.a) / dt;
    }
    if (prevR) {
      const dt = (now - prevR.t) / 1000;
      if (dt > 0) rVel = Math.abs(rAngle - prevR.a) / dt;
    }
    lastKneeSample.current.left = { a: lAngle, t: now };
    lastKneeSample.current.right = { a: rAngle, t: now };
    const maxAngVel = Math.max(lVel, rVel);

    // Standing test (sanity — hips above knees in image space, true for almost any upright pose).
    const hipY = (image[J.L_HIP].y + image[J.R_HIP].y) / 2;
    const kneeY = (image[J.L_KNEE].y + image[J.R_KNEE].y) / 2;
    const isStanding = hipY < kneeY;

    if (cooldownLeft.current > 0) {
      cooldownLeft.current -= 1;
      return;
    }

    if (phaseRef.current === 'IDLE') {
      // Onset: a knee is rotating fast while standing.
      if (isStanding && maxAngVel > ONSET_KNEE_VEL_DEG_S) {
        phaseRef.current = 'RECORDING';
        setPhase('RECORDING');
        buffer.current = [...preRoll.current];
        recordingPeakAngle.current = Math.max(lAngle, rAngle);
        setHeadlineCue('Recording...');
      }
    } else if (phaseRef.current === 'RECORDING') {
      buffer.current.push(frame);

      // Track peak knee angle so far in this kick.
      const curPeak = Math.max(lAngle, rAngle);
      if (curPeak > recordingPeakAngle.current) recordingPeakAngle.current = curPeak;

      // End condition: we passed peak extension AND the kicking leg has
      // returned toward chamber (lower knee angle). Fully rotation-invariant.
      const reachedExtension = recordingPeakAngle.current > END_PEAK_THRESHOLD_DEG;
      const minCurAngle = Math.min(lAngle, rAngle);
      const reChambered = reachedExtension && minCurAngle < END_RECHAMBER_THRESHOLD_DEG;
      const tooLong = buffer.current.length > MAX_KICK_FRAMES;

      if ((reChambered && buffer.current.length > MIN_KICK_FRAMES) || tooLong) {
        const captured = buffer.current;
        buffer.current = [];
        recordingPeakAngle.current = 0;
        phaseRef.current = 'COOLDOWN';
        setPhase('COOLDOWN');
        cooldownLeft.current = COOLDOWN_FRAMES;
        finalizeKick(captured);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => {
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
      recordingPeakAngle.current = 0;
      lastKneeSample.current = { left: null, right: null };
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
