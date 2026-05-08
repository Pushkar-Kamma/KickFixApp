import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getSessionStats } from '../services/sessions';
import { getRecentKicks } from '../services/kicks';
import { getProfile } from '../services/profiles';
import { getDailyProgress, getStreak, readGoals, maybeAdvanceStreak, type DailyProgress, type StreakState, type UserGoals } from '../services/goals';
import { getFighterAttributes, type FighterAttributes } from '../services/attributes';
import AttributeRadar from '../components/AttributeRadar';
import type { HomeStackParamList, DbKick } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Dashboard'>;
const { width: SCREEN_W } = Dimensions.get('window');

/* Heatmap cell sizing — sized so 12 weeks fit comfortably with a small day-label column */
const HM_DAY_LABEL_W = 12;
const HM_GAP = 3;
const HM_CELL = Math.floor((SCREEN_W - 32 /* horizontal padding */ - 32 /* card padding */ - HM_DAY_LABEL_W - HM_GAP * 11) / 12);

/** Format a Date as YYYY-MM-DD using LOCAL components (not UTC). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

/* ── Goals card ── */
function GoalsCard({
  goals, progress, streak, onPressSet,
}: {
  goals: UserGoals;
  progress: DailyProgress | null;
  streak: StreakState;
  onPressSet: () => void;
}) {
  // Empty state — user hasn't set any goals yet
  if (!progress || !progress.hasAnyGoal) {
    return (
      <TouchableOpacity style={goalStyles.emptyCard} onPress={onPressSet} activeOpacity={0.85}>
        <Text style={goalStyles.emptyTitle}>SET YOUR DAILY GOALS</Text>
        <Text style={goalStyles.emptyBody}>
          Track kicks, time and score targets to keep yourself sharp.
        </Text>
        <Text style={goalStyles.emptyCta}>SET GOALS  →</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={goalStyles.card} onPress={onPressSet} activeOpacity={0.9}>
      <View style={goalStyles.headerRow}>
        <Text style={goalStyles.headerTitle}>TODAY'S GOALS</Text>
        {streak.current > 0 && (
          <Text style={goalStyles.streakText}>🔥 {streak.current} day streak</Text>
        )}
      </View>
      {goals.dailyKicks !== undefined && (
        <GoalRow
          label="KICKS"
          current={progress.kicksToday}
          target={goals.dailyKicks}
          unit=""
          met={progress.goalKicksMet}
        />
      )}
      {goals.dailyMinutes !== undefined && (
        <GoalRow
          label="TIME"
          current={progress.minutesToday}
          target={goals.dailyMinutes}
          unit=" min"
          met={progress.goalMinutesMet}
        />
      )}
      {goals.avgScoreTarget !== undefined && (
        <GoalRow
          label="AVG SCORE"
          current={progress.avgScoreToday ?? 0}
          target={goals.avgScoreTarget}
          unit=""
          met={progress.goalScoreMet}
        />
      )}
    </TouchableOpacity>
  );
}

function GoalRow({ label, current, target, unit, met }: {
  label: string; current: number; target: number; unit: string; met: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <View style={goalStyles.goalRow}>
      <View style={goalStyles.goalRowHeader}>
        <Text style={goalStyles.goalLabel}>{label}</Text>
        <Text style={[goalStyles.goalValue, met && { color: colors.accent }]}>
          {current} / {target}{unit}
        </Text>
      </View>
      <View style={goalStyles.barTrack}>
        <View style={[
          goalStyles.barFill,
          { width: `${pct}%`, backgroundColor: met ? colors.accent : colors.primary },
        ]} />
      </View>
    </View>
  );
}

const goalStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.primaryTintBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontFamily: fonts.oswaldBold, fontSize: 14, color: colors.white,
    letterSpacing: 1.5,
  },
  emptyBody: {
    fontFamily: fonts.interRegular, fontSize: 13, color: colors.textSecondary,
    marginTop: 6, marginBottom: spacing.sm, lineHeight: 18,
  },
  emptyCta: {
    fontFamily: fonts.montserratBold, fontSize: 12, color: colors.primary,
    letterSpacing: 1.5,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontFamily: fonts.oswaldBold, fontSize: 13, color: colors.textMuted,
    letterSpacing: 1.5,
  },
  streakText: {
    fontFamily: fonts.montserratBold, fontSize: 12, color: colors.white,
  },
  goalRow: {
    marginTop: spacing.sm,
  },
  goalRowHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 4,
  },
  goalLabel: {
    fontFamily: fonts.oswaldRegular, fontSize: 11, color: colors.textMuted,
    letterSpacing: 1.2,
  },
  goalValue: {
    fontFamily: fonts.montserratBold, fontSize: 13, color: colors.white,
  },
  barTrack: {
    height: 6, backgroundColor: colors.trackBg, borderRadius: 3, overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: 3,
  },
});

export default function DashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [username, setUsername] = useState('');
  const [stats, setStats] = useState({ totalKicks: 0, goodKicks: 0, badKicks: 0, bestStreak: 0, sessionCount: 0 });
  const [recentKicks, setRecentKicks] = useState<DbKick[]>([]);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [streak, setStreak] = useState<StreakState>({ current: 0, longest: 0, lastMetDate: '' });
  const [goals, setGoals] = useState<UserGoals>({});
  const [heatTip, setHeatTip] = useState<{ date: string; count: number } | null>(null);
  const [attrs, setAttrs] = useState<FighterAttributes | null>(null);

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

    // Heatmap: source = kicks table (single source of truth, matches stats card).
    // Last 12 weeks (84 days) — enough for the visible grid.
    const heatStart = new Date();
    heatStart.setHours(0, 0, 0, 0);
    heatStart.setDate(heatStart.getDate() - 90);
    const { data: heatKicks } = await supabase
      .from('kicks')
      .select('created_at')
      .eq('user_id', uid)
      .gte('created_at', heatStart.toISOString());
    if (heatKicks) {
      const map: Record<string, number> = {};
      for (const k of heatKicks) {
        // Bucket by LOCAL date (not UTC). Otherwise late-evening kicks in
        // positive timezones get pushed to the next day.
        const day = localDateKey(new Date(k.created_at));
        map[day] = (map[day] || 0) + 1;
      }
      setHeatmap(map);
    }

    // Goals + streak
    const dp = await getDailyProgress(uid);
    setProgress(dp);
    // Advance streak if today's goals are now met
    const st = await maybeAdvanceStreak(uid, dp);
    setStreak(st);
    const g = await readGoals(uid);
    setGoals(g);

    // Fighter attributes (30d)
    const a = await getFighterAttributes(uid, '30d');
    setAttrs(a);
  }, []);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused, loadData]);

  const accuracy = stats.totalKicks > 0
    ? Math.round((stats.goodKicks / stats.totalKicks) * 100)
    : 0;

  // 12 weeks (84 days) for heatmap. Build columns: each is a Sun→Sat week.
  // Last column ends with today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = localDateKey(today);
  const dayOfWeek = today.getDay(); // 0 = Sun
  // Total cells = 12 weeks * 7 + (days into current week)
  const WEEKS = 12;
  const heatmapDays: string[] = [];
  // Start at the Sunday WEEKS-1 weeks before the Sunday of this week
  const startSunday = new Date(today);
  startSunday.setDate(today.getDate() - dayOfWeek - (WEEKS - 1) * 7);
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(startSunday);
      dt.setDate(startSunday.getDate() + w * 7 + d);
      heatmapDays.push(localDateKey(dt));
    }
  }

  // Personalized color buckets: based on the user's median non-zero day.
  const dayCounts = heatmapDays.map(d => heatmap[d] || 0);
  const nonZero = dayCounts.filter(c => c > 0).sort((a, b) => a - b);
  const median = nonZero.length
    ? nonZero[Math.floor(nonZero.length / 2)]
    : 0;

  const getHeatColor = (count: number, dateKey: string) => {
    // Future days = transparent (haven't happened yet)
    if (dateKey > todayKey) return 'transparent';
    if (count === 0) return colors.trackBg; // "empty but tracked" — dark grey
    if (median === 0) return colors.primary; // first kick ever
    const ratio = count / median;
    if (ratio < 0.25) return 'rgba(211, 47, 47, 0.20)';
    if (ratio < 0.75) return 'rgba(211, 47, 47, 0.45)';
    if (ratio < 1.25) return 'rgba(211, 47, 47, 0.75)';
    return colors.primary;
  };

  // Heatmap summary stats
  const totalKicks12w = dayCounts.reduce((s, c) => s + c, 0);
  const bestDay = dayCounts.reduce((m, c) => Math.max(m, c), 0);
  const activeDays = nonZero.length;

  // Month labels: show month name above each column where the month changes
  const monthLabels: { col: number; label: string }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const firstDay = heatmapDays[w * 7];
    const m = new Date(firstDay).getMonth();
    if (m !== prevMonth) {
      monthLabels.push({ col: w, label: new Date(firstDay).toLocaleDateString('en-US', { month: 'short' }) });
      prevMonth = m;
    }
  }

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

        {/* Goals Card */}
        <GoalsCard
          goals={goals}
          progress={progress}
          streak={streak}
          onPressSet={() => navigation.navigate('SetGoals')}
        />

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
            {/* Summary line */}
            <Text style={styles.heatSummary}>
              {totalKicks12w} kicks · {activeDays} active days · best {bestDay}
            </Text>

            {/* Month labels row */}
            <View style={styles.monthRow}>
              <View style={{ width: HM_DAY_LABEL_W }} />
              {Array.from({ length: WEEKS }).map((_, w) => {
                const lbl = monthLabels.find(m => m.col === w);
                return (
                  <View key={w} style={{ width: HM_CELL + HM_GAP, alignItems: 'flex-start' }}>
                    {lbl ? <Text style={styles.monthLabel}>{lbl.label}</Text> : null}
                  </View>
                );
              })}
            </View>

            {/* Grid: 7 rows × 12 cols, with day labels on left */}
            <View style={styles.heatBody}>
              <View style={styles.dayLabelCol}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <Text key={i} style={[styles.dayLabel, i % 2 === 1 ? null : { opacity: 0 }]}>{d}</Text>
                ))}
              </View>
              <View style={styles.heatGrid}>
                {Array.from({ length: WEEKS }).map((_, w) => (
                  <View key={w} style={styles.heatCol}>
                    {Array.from({ length: 7 }).map((__, d) => {
                      const dateKey = heatmapDays[w * 7 + d];
                      const count = heatmap[dateKey] || 0;
                      const isToday = dateKey === todayKey;
                      const isFuture = dateKey > todayKey;
                      return (
                        <TouchableOpacity
                          key={d}
                          activeOpacity={0.6}
                          disabled={isFuture}
                          onPress={() => setHeatTip({ date: dateKey, count })}
                          style={[
                            styles.heatCell,
                            { backgroundColor: getHeatColor(count, dateKey) },
                            isToday && styles.heatCellToday,
                            isFuture && { borderWidth: 0 },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            {/* Tooltip */}
            {heatTip && (
              <View style={styles.heatTip}>
                <Text style={styles.heatTipDate}>
                  {new Date(heatTip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={styles.heatTipCount}>
                  {heatTip.count === 0 ? 'No kicks' : `${heatTip.count} kick${heatTip.count === 1 ? '' : 's'}`}
                </Text>
              </View>
            )}

            {/* Legend */}
            <View style={styles.heatLegend}>
              <Text style={styles.heatLegendText}>Less</Text>
              {[colors.trackBg, 'rgba(211, 47, 47, 0.20)', 'rgba(211, 47, 47, 0.45)', 'rgba(211, 47, 47, 0.75)', colors.primary].map((bg, i) => (
                <View key={i} style={[styles.heatCell, { backgroundColor: bg }]} />
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

        {/* Action Buttons (Set Goals / Kick History) — moved below Fighter Attributes */}

        {/* Fighter Attributes preview */}
        {attrs && attrs.hasEnoughData && (
          <TouchableOpacity
            style={styles.attrCard}
            onPress={() => navigation.navigate('FighterAttributes')}
            activeOpacity={0.85}>
            <View style={styles.attrLeft}>
              <AttributeRadar
                size={120}
                overall={null}
                showLabels={false}
                axes={[
                  { label: 'TECHNIQUE', value: attrs.technique },
                  { label: 'POWER', value: attrs.power },
                  { label: 'SPEED', value: attrs.speed },
                  { label: 'DEFENSE', value: attrs.defense },
                  { label: 'FOOTWORK', value: attrs.footwork },
                  { label: 'CONDITIONING', value: attrs.conditioning },
                ]}
              />
            </View>
            <View style={styles.attrRight}>
              <Text style={styles.attrEyebrow}>FIGHTER</Text>
              <Text style={styles.attrOverall}>{attrs.overall}</Text>
              <Text style={styles.attrTier}>
                {attrs.overall >= 90 ? 'ELITE' : attrs.overall >= 75 ? 'ADVANCED' : attrs.overall >= 55 ? 'INTERMEDIATE' : 'NOVICE'}
              </Text>
              <Text style={styles.attrCta}>VIEW STATS →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Action Buttons (Set Goals / Kick History) */}
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

        <TouchableOpacity
          onPress={() => navigation.navigate('KickHistory')}
          activeOpacity={0.7}>
          <Text style={styles.sectionTitle}>Recent Kicks</Text>
        </TouchableOpacity>
        {recentKicks.length === 0 ? (
          <View style={styles.emptyState}>
            <HeavyBagIcon size={64} />
            <Text style={styles.emptyTitle}>No kicks recorded</Text>
            <Text style={styles.emptyBody}>Head to Train and throw your first kick.</Text>
          </View>
        ) : (
          recentKicks.slice(0, 5).map(kick => (
            <TouchableOpacity
              key={kick.id}
              style={styles.kickRow}
              onPress={() => navigation.navigate('KickHistory')}
              activeOpacity={0.7}>
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
            </TouchableOpacity>
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
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
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

  /* ── Heatmap (12-week grid) ── */
  heatmapCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heatSummary: {
    fontFamily: fonts.interMedium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  monthRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  monthLabel: {
    fontFamily: fonts.interRegular,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  heatBody: {
    flexDirection: 'row',
  },
  dayLabelCol: {
    width: HM_DAY_LABEL_W,
    justifyContent: 'space-between',
    paddingTop: 1,
    paddingBottom: 1,
  },
  dayLabel: {
    fontFamily: fonts.interRegular,
    fontSize: 9,
    color: colors.textMuted,
    height: HM_CELL,
    lineHeight: HM_CELL,
  },
  heatGrid: {
    flexDirection: 'row',
  },
  heatCol: {
    marginRight: HM_GAP,
    justifyContent: 'space-between',
  },
  heatCell: {
    width: HM_CELL,
    height: HM_CELL,
    borderRadius: 3,
    marginBottom: HM_GAP,
  },
  heatCellToday: {
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  heatTip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  heatTipDate: {
    fontFamily: fonts.oswaldBold,
    fontSize: 11,
    color: colors.white,
    letterSpacing: 1,
  },
  heatTipCount: {
    fontFamily: fonts.interMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, justifyContent: 'flex-end' },
  heatLegendText: { fontFamily: fonts.interRegular, fontSize: 10, color: colors.textMuted },

  /* ── Fighter Attributes preview ── */
  attrCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  attrLeft: { width: 120, height: 120 },
  attrRight: { flex: 1, paddingLeft: spacing.md, justifyContent: 'center' },
  attrEyebrow: {
    fontFamily: fonts.oswaldRegular, fontSize: 11,
    color: colors.textMuted, letterSpacing: 1.5,
  },
  attrOverall: {
    fontFamily: fonts.montserratBlack, fontSize: 48, color: colors.white,
    lineHeight: 52, includeFontPadding: false, marginVertical: 2,
  },
  attrTier: {
    fontFamily: fonts.oswaldBold, fontSize: 13, color: colors.primary,
    letterSpacing: 1.8, marginBottom: spacing.xs,
  },
  attrCta: {
    fontFamily: fonts.montserratBold, fontSize: 11, color: colors.primary,
    letterSpacing: 1.5,
  },

  /* ── Empty States ── */
  emptyState: {
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
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
