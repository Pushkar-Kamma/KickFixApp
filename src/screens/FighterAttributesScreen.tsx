/**
 * Fighter Attributes screen — full-screen 6-axis radar + per-attribute breakdown.
 * Toggle between 7d / 30d / all-time windows.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Dimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getFighterAttributes, type AttrWindow, type FighterAttributes } from '../services/attributes';
import AttributeRadar from '../components/AttributeRadar';
import type { HomeStackParamList } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'FighterAttributes'>;

const { width: SCREEN_W } = Dimensions.get('window');
const RADAR_SIZE = Math.min(SCREEN_W - spacing.lg * 2, 340);

const tierFor = (n: number) =>
  n >= 90 ? 'ELITE' : n >= 75 ? 'ADVANCED' : n >= 55 ? 'INTERMEDIATE' : 'NOVICE';

export default function FighterAttributesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [window, setWindow] = useState<AttrWindow>('30d');
  const [attrs, setAttrs] = useState<FighterAttributes | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (w: AttrWindow) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const a = await getFighterAttributes(session.user.id, w);
    setAttrs(a);
    setLoading(false);
  }, []);

  useEffect(() => { load(window); }, [window, load]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backX}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.eyebrow}>FIGHTER ATTRIBUTES</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Window toggle */}
        <View style={styles.toggleRow}>
          {(['7d', '30d', 'all'] as AttrWindow[]).map(w => {
            const active = window === w;
            return (
              <TouchableOpacity
                key={w}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                onPress={() => setWindow(w)}
                activeOpacity={0.7}>
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {w === '7d' ? '7 DAYS' : w === '30d' ? '30 DAYS' : 'ALL TIME'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !attrs?.hasEnoughData ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NOT ENOUGH DATA</Text>
            <Text style={styles.emptyBody}>
              Log at least 10 kicks to unlock your attribute profile.{'\n'}
              You have {attrs?.totalKicks ?? 0} so far.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.radarWrap}>
              <AttributeRadar
                size={RADAR_SIZE}
                overall={attrs.overall}
                axes={[
                  { label: 'TECHNIQUE',    value: attrs.technique },
                  { label: 'POWER',        value: attrs.power },
                  { label: 'SPEED',        value: attrs.speed },
                  { label: 'DEFENSE',      value: attrs.defense },
                  { label: 'FOOTWORK',     value: attrs.footwork },
                  { label: 'CONDITIONING', value: attrs.conditioning },
                ]}
              />
            </View>

            <Text style={styles.tierText}>{tierFor(attrs.overall)}</Text>
            <Text style={styles.kicksMeta}>
              based on {attrs.totalKicks} kick{attrs.totalKicks === 1 ? '' : 's'}
            </Text>

            {/* Bars */}
            <View style={styles.bars}>
              <Bar label="Technique"    value={attrs.technique} />
              <Bar label="Power"        value={attrs.power} />
              <Bar label="Speed"        value={attrs.speed} />
              <Bar label="Defense"      value={attrs.defense} />
              <Bar label="Footwork"     value={attrs.footwork} />
              <Bar label="Conditioning" value={attrs.conditioning} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${value}%` }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backX: { color: colors.white, fontSize: 22, fontWeight: '600', width: 24 },
  eyebrow: {
    fontFamily: fonts.oswaldBold, fontSize: 12, color: colors.textMuted, letterSpacing: 1.5,
  },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: {
    fontFamily: fonts.oswaldBold, fontSize: 11,
    color: colors.textSecondary, letterSpacing: 1.5,
  },
  toggleTextActive: { color: colors.white },

  radarWrap: { alignItems: 'center', marginVertical: spacing.md },

  tierText: {
    fontFamily: fonts.montserratBlack, fontSize: 16, color: colors.primary,
    letterSpacing: 2.5, textAlign: 'center', marginTop: spacing.sm,
  },
  kicksMeta: {
    fontFamily: fonts.interRegular, fontSize: 11, color: colors.textMuted,
    textAlign: 'center', marginTop: 4,
  },

  bars: { marginTop: spacing.xl, gap: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  barLabel: {
    fontFamily: fonts.interMedium, fontSize: 13, color: colors.textPrimary,
    width: 110,
  },
  barTrack: {
    flex: 1, height: 8, backgroundColor: colors.trackBg, borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  barValue: {
    fontFamily: fonts.montserratBold, fontSize: 13, color: colors.textPrimary,
    width: 32, textAlign: 'right', marginLeft: spacing.sm,
  },

  empty: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.xl, alignItems: 'center', marginTop: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.montserratBlack, fontSize: 16, color: colors.white,
    letterSpacing: 2, marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.interRegular, fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
});
