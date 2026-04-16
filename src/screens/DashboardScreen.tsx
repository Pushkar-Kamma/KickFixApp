import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '../theme';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md },
        ]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={typography.caption}>WELCOME BACK</Text>
          <Text style={[typography.h1, { marginTop: spacing.xs }]}>
            Dashboard
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Total Kicks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>0%</Text>
            <Text style={styles.statLabel}>Accuracy</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>0</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: colors.warning }]}>--</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={typography.h3}>Recent Activity</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🥋</Text>
            <Text style={styles.emptyTitle}>No kicks yet</Text>
            <Text style={styles.emptyBody}>
              Head to the Camera tab and start training. Your kick history will
              appear here.
            </Text>
          </View>
        </View>

        {/* Quick Tips */}
        <View style={styles.section}>
          <Text style={typography.h3}>Quick Tips</Text>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>Getting Started</Text>
            <Text style={styles.tipBody}>
              Stand 6-8 feet from your phone. Make sure your full body is visible.
              The AI will automatically detect when you throw a kick.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>Best Results</Text>
            <Text style={styles.tipBody}>
              Wear contrasting clothes against your background. Good lighting
              helps the pose detection accuracy significantly.
            </Text>
          </View>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  section: {
    marginBottom: spacing.lg,
  },

  emptyState: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  tipCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  tipBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
