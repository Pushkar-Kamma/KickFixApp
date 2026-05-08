import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getRecentKicks, deleteKick } from '../services/kicks';
import { readCachedRecentKicks, writeCachedRecentKicks, removeCachedKick } from '../services/kicksCache';
import { loadKickFrames } from '../services/kickFrames';
import SkeletonReplay from '../components/SkeletonReplay';
import type { Landmark } from '../engine/biomech';
import type { HomeStackParamList, DbKick } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'KickHistory'>;

const { width: SCREEN_W } = Dimensions.get('window');
const PEAK_W = SCREEN_W - spacing.lg * 2 - spacing.md * 2;
const PEAK_H = PEAK_W * 1.1;

export default function KickHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [kicks, setKicks] = useState<DbKick[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Cache of peak frames per kickId, fetched on demand when card is expanded.
  const [peaks, setPeaks] = useState<Record<string, { lm: Landmark[]; leg: 'Left' | 'Right' } | 'loading' | 'missing'>>({});

  // Lazily load the peak frame for a kick when its card is expanded.
  const ensurePeakLoaded = useCallback(async (kickId: string) => {
    setPeaks(prev => {
      if (prev[kickId]) return prev; // already loaded or loading
      return { ...prev, [kickId]: 'loading' };
    });
    const data = await loadKickFrames(kickId);
    setPeaks(prev => {
      if (!data || !data.frames.length) return { ...prev, [kickId]: 'missing' };
      const idx = Math.min(Math.max(0, data.peakIdx), data.frames.length - 1);
      return { ...prev, [kickId]: { lm: data.frames[idx].image, leg: data.leg } };
    });
  }, []);

  const handleToggleExpand = useCallback((kickId: string, isExpanded: boolean) => {
    setExpandedId(isExpanded ? null : kickId);
    if (!isExpanded) ensurePeakLoaded(kickId);
  }, [ensurePeakLoaded]);

  // Cache-first: render local immediately, then fetch fresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      setUserId(session.user.id);

      // 1. Load cached instantly
      const cached = await readCachedRecentKicks(session.user.id);
      if (!cancelled && cached.length > 0) setKicks(cached);

      // 2. Fetch fresh in background
      setRefreshing(true);
      const { data } = await getRecentKicks(session.user.id, 100);
      if (cancelled) return;
      if (data) {
        setKicks(data);
        writeCachedRecentKicks(session.user.id, data).catch(() => {});
      }
      setRefreshing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = useCallback((kick: DbKick) => {
    Alert.alert(
      'Delete this kick?',
      `${kick.kick_type} — ${kick.engine_data.score}/100`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic UI — remove from list immediately
            setKicks(prev => prev.filter(k => k.id !== kick.id));
            if (expandedId === kick.id) setExpandedId(null);
            if (userId) removeCachedKick(userId, kick.id).catch(() => {});
            const { error } = await deleteKick(kick.id);
            if (error) {
              Alert.alert('Delete failed', error.message);
              // Re-fetch to restore truth if delete failed
              if (userId) {
                const { data } = await getRecentKicks(userId, 100);
                if (data) {
                  setKicks(data);
                  writeCachedRecentKicks(userId, data).catch(() => {});
                }
              }
            }
          },
        },
      ],
    );
  }, [userId, expandedId]);

  // Group kicks by date
  const grouped: Record<string, DbKick[]> = {};
  for (const kick of kicks) {
    const day = kick.created_at.slice(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(kick);
  }
  const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const scoreColor = (score: number) =>
    score >= 80 ? colors.scoreGood : score >= 50 ? colors.scoreMid : colors.scoreBad;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}>

        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Kick History</Text>
          {refreshing && <Text style={styles.refreshLabel}>refreshing…</Text>}
        </View>

        {sortedDays.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No kicks recorded yet</Text>
          </View>
        ) : (
          sortedDays.map(day => (
            <View key={day}>
              <Text style={styles.dayHeader}>{formatDate(day)}</Text>
              {grouped[day].map(kick => {
                const isExpanded = expandedId === kick.id;
                return (
                  <TouchableOpacity
                    key={kick.id}
                    style={styles.kickCard}
                    onPress={() => handleToggleExpand(kick.id, isExpanded)}
                    onLongPress={() => handleDelete(kick)}
                    delayLongPress={400}
                    activeOpacity={0.8}>
                    <View style={styles.kickHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.kickType}>{kick.kick_type}</Text>
                        <Text style={styles.kickMeta}>
                          {kick.engine_data.leg} · {formatTime(kick.created_at)}
                        </Text>
                      </View>
                      <Text style={[styles.kickScore, { color: scoreColor(kick.engine_data.score) }]}>
                        {kick.engine_data.score}
                      </Text>
                    </View>

                    {isExpanded && (
                      <View style={styles.expanded}>
                        {/* Peak skeleton snapshot */}
                        <Text style={styles.expandLabel}>PEAK</Text>
                        <View style={styles.peakBox}>
                          {(() => {
                            const p = peaks[kick.id];
                            if (!p || p === 'loading') {
                              return <ActivityIndicator color={colors.primary} />;
                            }
                            if (p === 'missing') {
                              return <Text style={styles.peakMissing}>No replay saved</Text>;
                            }
                            return (
                              <SkeletonReplay
                                landmarks={p.lm}
                                width={PEAK_W}
                                height={PEAK_H}
                                highlightLeg={p.leg}
                              />
                            );
                          })()}
                        </View>

                        <Text style={[styles.expandLabel, { marginTop: spacing.md }]}>FEEDBACK</Text>
                        {kick.engine_data.feedback.map((f, i) => (
                          <Text key={i} style={styles.feedbackLine}>• {f}</Text>
                        ))}
                        {kick.engine_data.errors.length > 0 && (
                          <>
                            <Text style={[styles.expandLabel, { marginTop: spacing.sm }]}>ERRORS</Text>
                            {kick.engine_data.errors.map((e, i) => (
                              <Text key={i} style={styles.errorLine}>✗ {e}</Text>
                            ))}
                          </>
                        )}
                        <Text style={styles.angleText}>
                          Peak Angle: {Math.floor(kick.engine_data.peakAngle)}°
                        </Text>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDelete(kick)}
                          activeOpacity={0.7}>
                          <Text style={styles.deleteBtnText}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  backBtn: { fontFamily: fonts.interBold, fontSize: 16, color: colors.primary, marginBottom: spacing.md },

  title: { fontFamily: fonts.montserratExtraBold, fontSize: 28, color: colors.textPrimary, marginBottom: spacing.lg },

  titleRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  refreshLabel: {
    fontFamily: fonts.interRegular, fontSize: 11, color: colors.textMuted,
    letterSpacing: 1,
  },

  deleteBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.error,
    borderRadius: 4,
  },
  deleteBtnText: {
    fontFamily: fonts.oswaldBold, fontSize: 11, color: colors.error,
    letterSpacing: 1.5,
  },

  peakBox: {
    width: PEAK_W,
    height: PEAK_H,
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: 4,
  },
  peakMissing: {
    fontFamily: fonts.interRegular, fontSize: 12, color: colors.textMuted,
  },

  dayHeader: {
    fontFamily: fonts.oswaldBold,
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  kickCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  kickHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kickType: { fontFamily: fonts.interBold, fontSize: 16, color: colors.textPrimary },
  kickMeta: { fontFamily: fonts.interRegular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  kickScore: { fontFamily: fonts.montserratBlack, fontSize: 28 },

  expanded: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  expandLabel: { fontFamily: fonts.oswaldRegular, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  feedbackLine: { fontFamily: fonts.interRegular, fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  errorLine: { fontFamily: fonts.interRegular, fontSize: 14, color: colors.error, lineHeight: 22 },
  angleText: { fontFamily: fonts.interMedium, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },

  emptyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontFamily: fonts.interRegular, fontSize: 14, color: colors.textSecondary },
});
