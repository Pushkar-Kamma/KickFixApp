import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { colorsA, colorsB } from '../theme/themeOptions';

const { width } = Dimensions.get('window');

function ThemePreview({ label, c }: { label: string; c: typeof colorsA }) {
  return (
    <View style={[styles.themeBlock, { backgroundColor: c.background }]}>
      {/* Header */}
      <Text style={[styles.themeLabel, { color: c.primary }]}>{label}</Text>

      {/* Score Display (Training Mode - 6ft away) */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>TRAINING MODE (6ft)</Text>
        <Text style={[styles.scoreHuge, { color: c.scoreGood }]}>92</Text>
        <Text style={[styles.scoreLabel, { color: c.textSecondary }]}>SCORE</Text>
        <View style={styles.kickCountRow}>
          <Text style={[styles.kickCount, { color: c.accent }]}>8</Text>
          <Text style={[styles.kickCountDivider, { color: c.textMuted }]}> / </Text>
          <Text style={[styles.kickCount, { color: c.textPrimary }]}>12</Text>
        </View>
        <Text style={[styles.feedbackGood, { color: c.scoreGood }]}>Great Snap! 172°</Text>
        <Text style={[styles.feedbackBad, { color: c.scoreBad }]}>Hands Dropped!</Text>
      </View>

      {/* Mid Score */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>MID SCORE EXAMPLE</Text>
        <Text style={[styles.scoreMedium, { color: c.scoreMid }]}>65</Text>
        <Text style={[styles.scoreLabel, { color: c.textSecondary }]}>SCORE</Text>
      </View>

      {/* Bad Score */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>LOW SCORE EXAMPLE</Text>
        <Text style={[styles.scoreMedium, { color: c.scoreBad }]}>35</Text>
        <Text style={[styles.scoreLabel, { color: c.textSecondary }]}>SCORE</Text>
      </View>

      {/* Dashboard Stats */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>DASHBOARD (normal distance)</Text>
        <Text style={[styles.h1, { color: c.textPrimary }]}>Dashboard</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>Track your training journey</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: c.surfaceLight, borderColor: c.cardBorder }]}>
            <Text style={[styles.statNum, { color: c.textPrimary }]}>42</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>TOTAL KICKS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.surfaceLight, borderColor: c.cardBorder }]}>
            <Text style={[styles.statNum, { color: c.scoreGood }]}>78%</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>ACCURACY</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: c.surfaceLight, borderColor: c.cardBorder }]}>
            <Text style={[styles.statNum, { color: c.primary }]}>5</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>SESSIONS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.surfaceLight, borderColor: c.cardBorder }]}>
            <Text style={[styles.statNum, { color: c.warning }]}>7</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>BEST STREAK</Text>
          </View>
        </View>
      </View>

      {/* Button Styles */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>BUTTONS</Text>
        <View style={[styles.button, { backgroundColor: c.primary }]}>
          <Text style={[styles.buttonText, { color: c.primary === '#FFFFFF' ? c.black : c.white }]}>
            START TRAINING
          </Text>
        </View>
        <View style={[styles.buttonOutline, { backgroundColor: 'rgba(229, 57, 53, 0.12)', borderColor: 'rgba(229, 57, 53, 0.30)' }]}>
          <Text style={[styles.buttonOutlineText, { color: c.primary }]}>ROUNDHOUSE</Text>
        </View>
      </View>

      {/* Mode Selector */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>KICK MODE SELECTOR</Text>
        <View style={styles.modeRow}>
          <View style={[styles.modeActive, { backgroundColor: c.primary }]}>
            <Text style={[styles.modeText, { color: c.primary === '#FFFFFF' ? c.black : c.white }]}>
              Roundhouse
            </Text>
          </View>
          <View style={[styles.modeInactive, { borderColor: c.cardBorder }]}>
            <Text style={[styles.modeText, { color: c.textSecondary }]}>Side Kick</Text>
          </View>
          <View style={[styles.modeInactive, { borderColor: c.cardBorder }]}>
            <Text style={[styles.modeText, { color: c.textSecondary }]}>Front Snap</Text>
          </View>
        </View>
      </View>

      {/* Recent Kick Card */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[styles.cardCaption, { color: c.textMuted }]}>RECENT KICK</Text>
        <View style={styles.recentKickRow}>
          <View>
            <Text style={[styles.recentKickType, { color: c.textPrimary }]}>Roundhouse</Text>
            <Text style={[styles.recentKickMeta, { color: c.textMuted }]}>Left Leg · 2m ago</Text>
          </View>
          <Text style={[styles.recentKickScore, { color: c.scoreGood }]}>85</Text>
        </View>
        <View style={styles.recentKickRow}>
          <View>
            <Text style={[styles.recentKickType, { color: c.textPrimary }]}>Side Kick</Text>
            <Text style={[styles.recentKickMeta, { color: c.textMuted }]}>Right Leg · 5m ago</Text>
          </View>
          <Text style={[styles.recentKickScore, { color: c.scoreBad }]}>42</Text>
        </View>
      </View>

      {/* Tab Bar Preview */}
      <View style={[styles.tabBar, { backgroundColor: c.tabBarBackground, borderTopColor: c.tabBarBorder }]}>
        <View style={styles.tabItem}>
          <Text style={{ fontSize: 20 }}>📊</Text>
          <Text style={[styles.tabLabel, { color: c.primary }]}>Home</Text>
        </View>
        <View style={styles.tabItem}>
          <Text style={{ fontSize: 20 }}>🎯</Text>
          <Text style={[styles.tabLabel, { color: c.tabBarInactive }]}>Train</Text>
        </View>
        <View style={styles.tabItem}>
          <Text style={{ fontSize: 20 }}>👤</Text>
          <Text style={[styles.tabLabel, { color: c.tabBarInactive }]}>Profile</Text>
        </View>
      </View>
    </View>
  );
}

export default function ThemeCompare() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Text style={styles.pageTitle}>Pick Your Theme</Text>
      <Text style={styles.pageSubtitle}>Scroll to compare both options</Text>

      <ThemePreview label="🔴 THEME A: RED + BLACK" c={colorsA} />

      <View style={styles.divider} />

      <ThemePreview label="⚪ THEME B: MONOCHROME" c={colorsB} />

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  pageTitle: { fontSize: 28, fontFamily: 'Montserrat-Black', color: '#FFF', textAlign: 'center', marginTop: 60, letterSpacing: 1 },
  pageSubtitle: { fontSize: 14, fontFamily: 'Inter_24pt-Regular', color: '#888', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  divider: { height: 2, backgroundColor: '#333', marginVertical: 32, marginHorizontal: 24 },

  themeBlock: { paddingHorizontal: 20, paddingVertical: 24, borderRadius: 16, marginHorizontal: 12 },
  themeLabel: { fontSize: 22, fontFamily: 'Montserrat-Black', letterSpacing: 2, marginBottom: 16, textAlign: 'center' },

  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardCaption: { fontSize: 11, fontFamily: 'Oswald-Regular', letterSpacing: 1, marginBottom: 8 },

  // Training mode (big scores for 6ft)
  scoreHuge: { fontSize: 96, fontFamily: 'Montserrat-Black', textAlign: 'center', lineHeight: 100 },
  scoreMedium: { fontSize: 64, fontFamily: 'Montserrat-Black', textAlign: 'center', lineHeight: 70 },
  scoreLabel: { fontSize: 14, fontFamily: 'Oswald-Bold', textAlign: 'center', letterSpacing: 2, marginTop: -4 },
  kickCountRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', marginTop: 8 },
  kickCount: { fontSize: 40, fontFamily: 'Montserrat-ExtraBold' },
  kickCountDivider: { fontSize: 24, fontFamily: 'Inter_24pt-Regular' },
  feedbackGood: { fontSize: 22, fontFamily: 'Inter_28pt-Bold', textAlign: 'center', marginTop: 8 },
  feedbackBad: { fontSize: 22, fontFamily: 'Inter_28pt-Bold', textAlign: 'center', marginTop: 4 },

  // Dashboard normal
  h1: { fontSize: 32, fontFamily: 'Montserrat-ExtraBold', letterSpacing: -0.5 },
  body: { fontSize: 16, fontFamily: 'Inter_24pt-Regular', marginTop: 4, lineHeight: 24 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 28, fontFamily: 'Montserrat-ExtraBold' },
  statLabel: { fontSize: 11, fontFamily: 'Oswald-Regular', letterSpacing: 0.5, marginTop: 2 },

  // Buttons
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontFamily: 'Montserrat-Bold', letterSpacing: 1 },
  buttonOutline: { borderRadius: 10, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  buttonOutlineText: { fontSize: 14, fontFamily: 'Oswald-Bold', letterSpacing: 0.5 },

  // Mode selector
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modeActive: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modeInactive: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  modeText: { fontSize: 13, fontFamily: 'Oswald-Bold' },

  // Recent kicks
  recentKickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  recentKickType: { fontSize: 16, fontFamily: 'Inter_28pt-Bold' },
  recentKickMeta: { fontSize: 12, fontFamily: 'Inter_24pt-Regular', marginTop: 2 },
  recentKickScore: { fontSize: 32, fontFamily: 'Montserrat-Black' },

  // Tab bar
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 10, paddingBottom: 6, marginTop: 8, borderRadius: 12 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
