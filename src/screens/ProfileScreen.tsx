import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '../theme';

export default function ProfileScreen() {
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

        <Text style={typography.h1}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>K</Text>
          </View>
          <Text style={[typography.h2, { marginTop: spacing.md }]}>
            KickFix User
          </Text>
          <Text style={[typography.body, { marginTop: spacing.xs }]}>
            Sign in to save your progress
          </Text>
        </View>

        {/* Settings List */}
        <View style={styles.settingsGroup}>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
            ACCOUNT
          </Text>
          <TouchableOpacity style={styles.settingsRow} activeOpacity={0.7}>
            <Text style={styles.settingsLabel}>Sign In / Create Account</Text>
            <Text style={styles.settingsChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.settingsGroup}>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
            PREFERENCES
          </Text>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Default Kick Mode</Text>
            <Text style={styles.settingsValue}>Roundhouse</Text>
          </View>
          <View style={styles.settingsDivider} />
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Camera</Text>
            <Text style={styles.settingsValue}>Front</Text>
          </View>
        </View>

        <View style={styles.settingsGroup}>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
            ABOUT
          </Text>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Version</Text>
            <Text style={styles.settingsValue}>0.0.1</Text>
          </View>
          <View style={styles.settingsDivider} />
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>AI Model</Text>
            <Text style={styles.settingsValue}>MediaPipe Full</Text>
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

  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
  },

  settingsGroup: {
    marginBottom: spacing.lg,
  },
  settingsRow: {
    backgroundColor: colors.card,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  settingsValue: {
    fontSize: 15,
    color: colors.textMuted,
  },
  settingsChevron: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: '600',
  },
});
