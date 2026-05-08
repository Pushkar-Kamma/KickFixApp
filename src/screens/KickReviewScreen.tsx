/**
 * KickReviewScreen — Full Analysis post-kick review.
 * Loads stored frames, replays skeleton in slow-mo loop, lets user scrub
 * and jump to peak frame, shows full criterion scorecard.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import type { TrainStackParamList } from '../types';
import { loadKickFrames } from '../services/kickFrames';
import { takePendingKick } from '../engine/pendingKick';
import { analyzeFrontSnap, type CriterionResult, type KickResult } from '../engine/FrontSnapAnalyzer';
import { analyzeSideKick } from '../engine/SideKickAnalyzer';
import { analyzeRoundhouse } from '../engine/RoundhouseAnalyzer';
import type { PoseFrame } from '../engine/biomech';
import SkeletonReplay from '../components/SkeletonReplay';

type Props = NativeStackScreenProps<TrainStackParamList, 'KickReview'>;

const { width } = Dimensions.get('window');
const REPLAY_W = width - spacing.lg * 2;
const REPLAY_H = REPLAY_W * 1.3; // tall portrait
const PLAYBACK_FPS = 8;          // slow-mo loop speed

export default function KickReviewScreen({ route, navigation }: Props) {
  const { kickId } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [frames, setFrames] = useState<PoseFrame[]>([]);
  const [result, setResult] = useState<KickResult | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [leg, setLeg] = useState<'Left' | 'Right'>('Right');
  const [kickMode, setKickMode] = useState<string>('Front Snap');

  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIdxRef = useRef(0);

  /* ── Load frames + re-run analyzer ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try in-memory bridge first (instant, no async).
      const pending = takePendingKick(kickId);
      let data: { frames: PoseFrame[]; peakIdx: number; chamberIdx: number; leg: 'Left' | 'Right' } | null = null;
      let mode = 'Front Snap';
      if (pending) {
        data = {
          frames: pending.frames,
          peakIdx: pending.peakIdx,
          chamberIdx: pending.chamberIdx,
          leg: pending.leg,
        };
        mode = pending.kickMode;
      } else {
        // 2. Fall back to local cache / Supabase
        data = await loadKickFrames(kickId);
      }
      if (cancelled) return;
      if (!data || !data.frames || data.frames.length === 0) {
        setLoading(false);
        return;
      }
      setFrames(data.frames);
      setLeg(data.leg);
      setKickMode(mode);
      try {
        const r = mode === 'Side Kick'
          ? analyzeSideKick(data.frames, data.leg)
          : mode === 'Roundhouse'
            ? analyzeRoundhouse(data.frames, data.leg)
            : analyzeFrontSnap(data.frames, data.leg);
        setResult(r);
        const safePeak = Math.min(Math.max(0, r.peakFrameIdx), data.frames.length - 1);
        setFrameIdx(safePeak);
        frameIdxRef.current = safePeak;
      } catch (e) {
        console.warn('[KickReview] analyze failed:', e);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [kickId]);

  /* ── Playback loop ── */
  useEffect(() => {
    if (!playing || frames.length === 0) {
      if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null; }
      return;
    }
    playTimer.current = setInterval(() => {
      frameIdxRef.current = (frameIdxRef.current + 1) % frames.length;
      setFrameIdx(frameIdxRef.current);
    }, 1000 / PLAYBACK_FPS);
    return () => {
      if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null; }
    };
  }, [playing, frames.length]);

  const togglePlay = useCallback(() => setPlaying(p => !p), []);
  const jumpToPeak = useCallback(() => {
    if (!result) return;
    setPlaying(false);
    frameIdxRef.current = result.peakFrameIdx;
    setFrameIdx(result.peakFrameIdx);
  }, [result]);
  const jumpToChamber = useCallback(() => {
    if (!result) return;
    setPlaying(false);
    frameIdxRef.current = result.chamberFrameIdx;
    setFrameIdx(result.chamberFrameIdx);
  }, [result]);

  const stepFrame = useCallback((delta: number) => {
    if (frames.length === 0) return;
    setPlaying(false);
    const next = Math.max(0, Math.min(frames.length - 1, frameIdxRef.current + delta));
    frameIdxRef.current = next;
    setFrameIdx(next);
  }, [frames.length]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!frames.length || !result) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Text style={styles.errorText}>Unable to load kick replay.</Text>
        <TouchableOpacity style={styles.nextBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.nextBtnText}>BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentFrame = frames[frameIdx];
  const failingCriteria = result.criteria.filter(c => !c.pass && c.severity !== 'info');
  const passingCriteria = result.criteria.filter(c => c.pass && c.severity !== 'info');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>

        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backX}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.eyebrow}>{kickMode.toUpperCase()} • {leg.toUpperCase()} LEG</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Big score */}
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreNum}>{result.score}</Text>
          <Text style={styles.scoreSlash}>/100</Text>
        </View>
        <Text style={[
          styles.verdict,
          result.verdict === 'SNAP' && { color: colors.accent },
          result.verdict === 'PUSH' && { color: colors.warning },
          (result.verdict === 'LOW' || result.verdict === 'SLOPPY') && { color: colors.error },
        ]}>{result.verdict} • {result.tier}</Text>

        {/* Skeleton replay canvas */}
        <View style={[styles.replayBox, { width: REPLAY_W, height: REPLAY_H }]}>
          <SkeletonReplay
            landmarks={currentFrame.image}
            width={REPLAY_W}
            height={REPLAY_H}
            highlightLeg={leg}
          />
          <View style={styles.frameLabel}>
            <Text style={styles.frameLabelText}>
              {frameIdx === result.peakFrameIdx ? 'PEAK' : frameIdx === result.chamberFrameIdx ? 'CHAMBER' : `Frame ${frameIdx + 1}/${frames.length}`}
            </Text>
          </View>
        </View>

        {/* Playback controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => stepFrame(-1)}>
            <Text style={styles.ctrlText}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctrlBtn, styles.playBtn]} onPress={togglePlay}>
            <Text style={styles.playText}>{playing ? '❚❚' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => stepFrame(1)}>
            <Text style={styles.ctrlText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Scrubber */}
        <View style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { width: `${(frameIdx / Math.max(1, frames.length - 1)) * 100}%` }]} />
          {/* Markers */}
          <View style={[styles.scrubMark, { left: `${(result.chamberFrameIdx / frames.length) * 100}%`, backgroundColor: colors.warning }]} />
          <View style={[styles.scrubMark, { left: `${(result.peakFrameIdx / frames.length) * 100}%`, backgroundColor: colors.primary }]} />
        </View>

        <View style={styles.jumpRow}>
          <TouchableOpacity style={styles.jumpBtn} onPress={jumpToChamber}>
            <Text style={styles.jumpText}>CHAMBER</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.jumpBtn, styles.jumpPrimary]} onPress={jumpToPeak}>
            <Text style={[styles.jumpText, { color: colors.white }]}>PEAK FRAME</Text>
          </TouchableOpacity>
        </View>

        {/* Key metrics */}
        <Text style={styles.sectionH}>METRICS</Text>
        <View style={styles.metricsGrid}>
          <Metric label="PEAK ANGLE" value={result.metrics.peakKneeAngleDeg.toFixed(0) + '°'} />
          <Metric label="SNAP SPEED" value={result.metrics.peakKneeAngularVelDegPerSec.toFixed(0) + '°/s'} />
          <Metric label="FOOT SPEED" value={result.metrics.peakFootSpeedMS.toFixed(2) + ' m/s'} />
          <Metric label="CHAMBER" value={result.metrics.chamberMs.toFixed(0) + ' ms'} />
          <Metric label="EXTENSION" value={result.metrics.extensionMs.toFixed(0) + ' ms'} />
          <Metric label="TOTAL TIME" value={result.metrics.totalMs.toFixed(0) + ' ms'} />
          <Metric label="RECOIL/EXT" value={result.metrics.recoilToExtensionRatio.toFixed(2)} />
          <Metric label="FRAMES" value={String(frames.length)} />
          <Metric label="PEAK FRAME" value={`#${result.peakFrameIdx + 1}`} />
        </View>

        {/* Issues */}
        {failingCriteria.length > 0 && (
          <>
            <Text style={styles.sectionH}>{failingCriteria.length} ISSUE{failingCriteria.length > 1 ? 'S' : ''}</Text>
            {failingCriteria.map(c => (
              <CriterionRow key={c.id} c={c} />
            ))}
          </>
        )}

        {passingCriteria.length > 0 && (
          <>
            <Text style={styles.sectionH}>{passingCriteria.length} PASSED</Text>
            {passingCriteria.map(c => (
              <CriterionRow key={c.id} c={c} />
            ))}
          </>
        )}

        {/* Next kick CTA */}
        <TouchableOpacity style={styles.nextBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.nextBtnText}>NEXT KICK</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CriterionRow({ c }: { c: CriterionResult }) {
  return (
    <View style={[styles.critRow, c.pass ? styles.critPass : styles.critFail]}>
      <View style={[styles.critDot, { backgroundColor: c.pass ? colors.accent : colors.error }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.critLabel}>{c.label}</Text>
        <Text style={styles.critMeta}>
          {c.value.toFixed(c.unit === 'ratio' ? 2 : 1)} {c.unit} • target {c.target}
        </Text>
        {!c.pass && <Text style={styles.critCue}>{c.cue}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: spacing.lg },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backX: {
    color: colors.white, fontSize: 22, fontWeight: '600', width: 24,
  },
  eyebrow: {
    fontFamily: fonts.oswaldRegular, fontSize: 11,
    color: colors.textMuted, letterSpacing: 1.5,
  },
  errorText: { color: colors.error, fontSize: 16, marginBottom: spacing.lg },

  scoreBlock: {
    flexDirection: 'row', alignItems: 'baseline', alignSelf: 'center',
  },
  scoreNum: {
    fontFamily: fonts.montserratBlack, fontSize: 88, color: colors.white,
    lineHeight: 96, includeFontPadding: false,
  },
  scoreSlash: {
    fontFamily: fonts.oswaldRegular, fontSize: 18,
    color: 'rgba(255,255,255,0.5)', marginLeft: 4,
  },
  verdict: {
    fontFamily: fonts.montserratBlack, fontSize: 22,
    color: colors.white, letterSpacing: 2.5, alignSelf: 'center',
    marginBottom: spacing.lg,
  },

  replayBox: {
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 4,
    borderWidth: 1, borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  frameLabel: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  frameLabelText: {
    color: colors.white, fontFamily: fonts.oswaldBold, fontSize: 11, letterSpacing: 1.2,
  },

  controlsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing.lg, marginTop: spacing.md,
  },
  ctrlBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    backgroundColor: colors.primary, borderColor: colors.primary,
    width: 60, height: 60, borderRadius: 30,
  },
  ctrlText: { color: colors.white, fontSize: 16, includeFontPadding: false },
  playText: { color: colors.white, fontSize: 24, includeFontPadding: false, textAlign: 'center', marginLeft: 3 },

  scrubTrack: {
    height: 6, marginTop: spacing.lg,
    backgroundColor: colors.cardBorder, borderRadius: 3,
    overflow: 'visible',
  },
  scrubFill: {
    height: '100%', backgroundColor: colors.white, borderRadius: 3,
  },
  scrubMark: {
    position: 'absolute', top: -3, width: 3, height: 12,
  },

  jumpRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
  },
  jumpBtn: {
    flex: 1, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.white,
    borderRadius: 4, alignItems: 'center',
  },
  jumpPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  jumpText: {
    fontFamily: fonts.montserratBold, fontSize: 12,
    color: colors.white, letterSpacing: 1.5,
  },

  sectionH: {
    fontFamily: fonts.oswaldBold, fontSize: 13,
    color: colors.textMuted, letterSpacing: 1.8,
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },

  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  metricCell: {
    width: (REPLAY_W - spacing.sm * 2) / 3,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.cardBorder,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  metricLabel: {
    fontFamily: fonts.oswaldRegular, fontSize: 9,
    color: colors.textMuted, letterSpacing: 1,
  },
  metricValue: {
    fontFamily: fonts.montserratBold, fontSize: 16,
    color: colors.white, marginTop: 2,
  },

  critRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.cardElevated,
    borderRadius: 4, marginBottom: spacing.xs,
    borderLeftWidth: 3,
  },
  critPass: { borderLeftColor: colors.accent },
  critFail: { borderLeftColor: colors.error },
  critDot: {
    width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: spacing.sm,
  },
  critLabel: {
    fontFamily: fonts.montserratBold, fontSize: 13, color: colors.white,
  },
  critMeta: {
    fontFamily: fonts.interRegular, fontSize: 11,
    color: colors.textMuted, marginTop: 2,
  },
  critCue: {
    fontFamily: fonts.interMedium, fontSize: 12,
    color: colors.warning, marginTop: 4,
  },

  nextBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  nextBtnText: {
    fontFamily: fonts.montserratBlack, fontSize: 16,
    color: colors.white, letterSpacing: 1.5,
  },
});
