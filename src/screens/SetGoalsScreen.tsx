import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import type { HomeStackParamList } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'SetGoals'>;

export default function SetGoalsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [kicksGoal, setKicksGoal] = useState('');
  const [timeGoal, setTimeGoal] = useState('');
  const [scoreGoal, setScoreGoal] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Goals stored locally for MVP — will move to Supabase later
    setSaved(true);
    setTimeout(() => navigation.goBack(), 1200);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Set Your Goals</Text>
        <Text style={styles.subtitle}>Track your progress and stay motivated</Text>

        {/* Goal Cards */}
        <View style={styles.goalCard}>
          <Text style={styles.goalIcon}>🥊</Text>
          <View style={styles.goalInfo}>
            <Text style={styles.goalLabel}>DAILY KICKS TARGET</Text>
            <TextInput
              style={styles.goalInput}
              placeholder="e.g. 50"
              placeholderTextColor={colors.textMuted}
              value={kicksGoal}
              onChangeText={t => setKicksGoal(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.goalCard}>
          <Text style={styles.goalIcon}>⏱️</Text>
          <View style={styles.goalInfo}>
            <Text style={styles.goalLabel}>DAILY TIME (MINUTES)</Text>
            <TextInput
              style={styles.goalInput}
              placeholder="e.g. 30"
              placeholderTextColor={colors.textMuted}
              value={timeGoal}
              onChangeText={t => setTimeGoal(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.goalCard}>
          <Text style={styles.goalIcon}>🎯</Text>
          <View style={styles.goalInfo}>
            <Text style={styles.goalLabel}>AVG SCORE TARGET</Text>
            <TextInput
              style={styles.goalInput}
              placeholder="e.g. 80"
              placeholderTextColor={colors.textMuted}
              value={scoreGoal}
              onChangeText={t => setScoreGoal(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {saved ? (
          <View style={styles.savedBanner}>
            <Text style={styles.savedText}>✓ Goals saved!</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>SAVE GOALS</Text>
          </TouchableOpacity>
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

  title: { fontFamily: fonts.montserratExtraBold, fontSize: 28, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.interRegular, fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl },

  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  goalIcon: { fontSize: 32 },
  goalInfo: { flex: 1 },
  goalLabel: { fontFamily: fonts.oswaldRegular, fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.xs },
  goalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontFamily: fonts.montserratBold,
    color: colors.textPrimary,
  },

  savedBanner: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  savedText: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryButtonText: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white, letterSpacing: 1 },
});
