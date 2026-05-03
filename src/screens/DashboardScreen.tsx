import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getSessionStats, getRecentSessions } from '../services/sessions';
import { getRecentKicks } from '../services/kicks';
import { getProfile } from '../services/profiles';
import type { HomeStackParamList, DbKick } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Dashboard'>;
const { width: SCREEN_W } = Dimensions.get('window');

/* ── Geometric SVG-style icons (rendered as Text with custom shapes) ── */
// Sharp lightning bolt: two parallelograms forming a Z-bolt
function BoltIcon({ size = 28, color = colors.primary }: { size?: number; color?: string }) {
  const w = size * 0.55;
  const h = size;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      {/* Upper slash */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: w * 0.35,
        width: w * 0.55,
        height: h * 0.55,
        backgroundColor: color,
        transform: [{ skewX: '-20deg' }],
      }} />
      {/* Lower slash */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: w * 0.10,
        width: w * 0.55,
        height: h * 0.55,
        backgroundColor: color,
        transform: [{ skewX: '-20deg' }],
      }} />
      {/* Center bridge */}
      <View style={{
        position: 'absolute',
        top: h * 0.40,
        left: w * 0.20,
        width: w * 0.60,
        height: h * 0.20,
        backgroundColor: color,
        transform: [{ skewX: '-20deg' }],
      }} />
    </View>
  );
}

function ReticleIcon({ size = 22, color = colors.white }: { size?: number; color?: string }) {
  const s = size;
  const t = 2;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: t, borderColor: color }} />
      <View style={{ position: 'absolute', width: t, height: s * 0.4, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: s * 0.4, height: t, backgroundColor: color }} />
    </View>
  );
}

function DocIcon({ size = 22, color = colors.white }: { size?: number; color?: string }) {
  const t = 2;
  return (
    <View style={{ width: size * 0.7, height: size, borderWidth: t, borderColor: color, borderRadius: 3 }}>
      <View style={{ marginTop: size * 0.2, marginLeft: size * 0.1, width: size * 0.35, height: t, backgroundColor: color }} />
      <View style={{ marginTop: size * 0.12, marginLeft: size * 0.1, width: size * 0.25, height: t, backgroundColor: color }} />
      <View style={{ marginTop: size * 0.12, marginLeft: size * 0.1, width: size * 0.3, height: t, backgroundColor: color }} />
    </View>
  );
}

function HexagonOutline({ size = 120 }: { size?: number }) {
  // True 6-sided hexagon: 6 thin bars rotated around center
  const R = size * 0.42;          // distance from center to side midpoint
  const sideLen = R * 1.155;      // 2*R*tan(30°) ≈ R * 1.155
  const thickness = 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: 0.18 }}>
      {[0, 60, 120, 180, 240, 300].map(deg => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            width: sideLen,
            height: thickness,
            backgroundColor: colors.white,
            transform: [{ rotate: `${deg}deg` }, { translateY: -R }],
          }}
        />
      ))}
    </View>
  );
}

// Heavy bag silhouette: outlined capsule with chain dots above
function HeavyBagIcon({ size = 60 }: { size?: number }) {
  const w = size * 0.55;
  const h = size;
  return (
    <View style={{ width: size, height: h, alignItems: 'center', opacity: 0.22 }}>
      {/* chain dots */}
      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.white, marginBottom: 2 }} />
      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.white, marginBottom: 2 }} />
      {/* top cap strap */}
      <View style={{ width: w * 0.45, height: 4, backgroundColor: colors.white, marginBottom: 1 }} />
      {/* bag body — outlined capsule */}
      <View style={{
        width: w,
        height: h * 0.72,
        borderWidth: 2,
        borderColor: colors.white,
        borderTopLeftRadius: w * 0.45,
        borderTopRightRadius: w * 0.45,
        borderBottomLeftRadius: w * 0.30,
        borderBottomRightRadius: w * 0.30,
      }}>
        {/* horizontal seam line */}
        <View style={{
          position: 'absolute',
          top: '60%',
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: colors.white,
          opacity: 0.6,
        }} />
      </View>
    </View>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [username, setUsername] = useState('');
  const [stats, setStats] = useState({ totalKicks: 0, goodKicks: 0, badKicks: 0, bestStreak: 0, sessionCount: 0 });
  const [recentKicks, setRecentKicks] = useState<DbKick[]>([]);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;

    const { data: profile } = await getProfile(uid);
    if (profile?.username) setUsername(profile.username);

    const s = await getSessionStats(uid);
    setStats(s);

    const { data: kicks } = await getRecentKicks(uid, 10);
    if (kicks) setRecentKicks(kicks);

    const { data: sessions } = await getRecentSessions(uid, 90);
    if (sessions) {
      const map: Record<string, number> = {};
      for (const sess of sessions) {
        const day = sess.started_at.slice(0, 10);
        map[day] = (map[day] || 0) + (sess.total_kicks ?? 0);
      }
      setHeatmap(map);
    }
  }, []);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused, loadData]);

  const accuracy = stats.totalKicks > 0
    ? Math.round((stats.goodKicks / stats.totalKicks) * 100)
    : 0;

  // Last 35 days for heatmap
  const today = new Date();
  const days: string[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const getHeatColor = (count: number) => {
    if (count === 0) return colors.card;
    if (count < 5) return 'rgba(211, 47, 47, 0.20)';
    if (count < 15) return 'rgba(211, 47, 47, 0.45)';
    if (count < 30) return 'rgba(211, 47, 47, 0.70)';
    return colors.primary;
  };

  const scoreColor = (score: number) =>
    score >= 80 ? colors.white : score >= 50 ? colors.textSecondary : colors.primary;

  const hasData = stats.totalKicks > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.greeting}>Hey {username || 'Fighter'},</Text>
        <Text style={styles.subtitle}>Your Stats</Text>

        {/* Stat Cards */}
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalKicks}</Text>
            <Text style={styles.statLabel}>KICKS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{accuracy}%</Text>
            <Text style={styles.statLabel}>ACCURACY</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.sessionCount}</Text>
            <Text style={styles.statLabel}>SESSIONS</Text>
          </View>
        </View>

        {/* Practice Activity */}
        <Text style={styles.sectionTitle}>Practice Activity</Text>
        {hasData ? (
          <View style={styles.heatmapCard}>
            <View style={styles.heatmapGrid}>
              {days.map(day => (
                <View
                  key={day}
                  style={[styles.heatCell, { backgroundColor: getHeatColor(heatmap[day] || 0) }]}
                />
              ))}
            </View>
            <View style={styles.heatLegend}>
              <Text style={styles.heatLegendText}>Less</Text>
              {[0, 3, 10, 20, 40].map(v => (
                <View key={v} style={[styles.heatCell, { backgroundColor: getHeatColor(v) }]} />
              ))}
              <Text style={styles.heatLegendText}>More</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <HexagonOutline size={100} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyBody}>Your training heatmap will fill up as you practice.</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.getParent()?.navigate('Train')}
              activeOpacity={0.85}>
              <Text style={styles.emptyButtonText}>RECORD YOUR FIRST KICK</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('SetGoals')}
            activeOpacity={0.8}>
            <ReticleIcon size={24} color={colors.primary} />
            <Text style={styles.actionText}>Set Goals</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('KickHistory')}
            activeOpacity={0.8}>
            <DocIcon size={24} color={colors.primary} />
            <Text style={styles.actionText}>Kick History</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Kicks */}
        <Text style={styles.sectionTitle}>Recent Kicks</Text>
        {recentKicks.length === 0 ? (
          <View style={styles.emptyState}>
            <HeavyBagIcon size={64} />
            <Text style={styles.emptyTitle}>No kicks recorded</Text>
            <Text style={styles.emptyBody}>Head to Train and throw your first kick.</Text>
          </View>
        ) : (
          recentKicks.slice(0, 5).map(kick => (
            <View key={kick.id} style={styles.kickRow}>
              <View style={styles.kickScoreBadge}>
                <Text style={[styles.kickScoreText, { color: scoreColor(kick.engine_data.score) }]}>
                  {kick.engine_data.score}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kickType}>{kick.kick_type}</Text>
                <Text style={styles.kickMeta}>
                  {kick.engine_data.leg} leg · {new Date(kick.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: spacing.md }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  greeting: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 28,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.oswaldBold,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },

  /* ── Stats ── */
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: '#161111',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: fonts.montserratBlack,
    fontSize: 32,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  statLabel: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginTop: spacing.xs,
  },

  /* ── Streak ── */
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#161111',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  streakLabel: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  streakValue: {
    fontFamily: fonts.montserratBold,
    fontSize: 20,
    color: colors.textPrimary,
  },

  /* ── Sections ── */
  sectionTitle: {
    fontFamily: fonts.oswaldBold,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  /* ── Heatmap ── */
  heatmapCard: {
    backgroundColor: '#161111',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatCell: { width: 16, height: 16, borderRadius: 3 },
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, justifyContent: 'flex-end' },
  heatLegendText: { fontFamily: fonts.interRegular, fontSize: 10, color: colors.textMuted },

  /* ── Empty States ── */
  emptyState: {
    backgroundColor: '#161111',
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.montserratBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyBody: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  emptyButtonText: {
    fontFamily: fonts.montserratBold,
    fontSize: 14,
    color: colors.white,
    letterSpacing: 1,
  },
  ghostLeg: {
    width: 40,
    height: 60,
    alignItems: 'center',
    opacity: 0.12,
  },
  ghostLegUpper: {
    width: 8,
    height: 30,
    backgroundColor: colors.white,
    borderRadius: 4,
  },
  ghostLegLower: {
    width: 8,
    height: 25,
    backgroundColor: colors.white,
    borderRadius: 4,
    transform: [{ rotate: '-30deg' }],
    marginTop: -2,
    marginLeft: 10,
  },

  /* ── Action Buttons ── */
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionButton: {
    flex: 1,
    backgroundColor: '#161111',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionText: {
    fontFamily: fonts.montserratBold,
    fontSize: 14,
    color: colors.white,
    letterSpacing: 0.5,
  },

  /* ── Recent Kicks ── */
  kickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  kickScoreBadge: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    backgroundColor: '#161111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kickScoreText: {
    fontFamily: fonts.montserratBlack,
    fontSize: 20,
  },
  kickType: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  kickMeta: {
    fontFamily: fonts.interRegular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
