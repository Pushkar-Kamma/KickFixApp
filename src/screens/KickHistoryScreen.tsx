import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getRecentKicks } from '../services/kicks';
import type { HomeStackParamList, DbKick } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'KickHistory'>;

export default function KickHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [kicks, setKicks] = useState<DbKick[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadKicks();
  }, []);

  const loadKicks = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await getRecentKicks(session.user.id, 100);
    if (data) setKicks(data);
  };

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

        <Text style={styles.title}>Kick History</Text>

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
                    onPress={() => setExpandedId(isExpanded ? null : kick.id)}
                    activeOpacity={0.8}>
                    <View style={styles.kickHeader}>
                      <View>
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
                        <Text style={styles.expandLabel}>FEEDBACK</Text>
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
