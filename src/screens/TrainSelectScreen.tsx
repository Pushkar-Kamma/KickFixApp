import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, Modal, Pressable, Alert,
  Image, ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import type { TrainStackParamList, KickMode, AnalysisMode } from '../types';

type Props = NativeStackScreenProps<TrainStackParamList, 'TrainSelect'>;

/* ── Kick image assets ── */
const KICK_IMAGES: Record<KickMode, ImageSourcePropType> = {
  'Roundhouse': require('../../assets/Images/Roundhouseicon.png'),
  'Front Snap': require('../../assets/Images/Frontkickicon.png'),
  'Side Kick':  require('../../assets/Images/Sidekickicon.png'),
};

// Small play triangle for Technique Video link
function PlayIcon({ size = 12, color = colors.white }: { size?: number; color?: string }) {
  return (
    <View style={{
      width: 0, height: 0,
      borderTopWidth: size * 0.6, borderBottomWidth: size * 0.6, borderLeftWidth: size,
      borderTopColor: 'transparent', borderBottomColor: 'transparent',
      borderLeftColor: color,
    }} />
  );
}

const KICK_TYPES: {
  mode: KickMode;
  label: string;
  desc: string;
}[] = [
  { mode: 'Roundhouse', label: 'ROUNDHOUSE', desc: 'Rotational power kick' },
  { mode: 'Front Snap', label: 'FRONT SNAP', desc: 'Fast linear snap kick' },
  { mode: 'Side Kick',  label: 'SIDE KICK',  desc: 'Lateral thrust kick' },
];

/* ── Kick image rendering ── */

export default function TrainSelectScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [username, setUsername] = useState('');
  const [pressedMode, setPressedMode] = useState<KickMode | null>(null);
  const [sheetMode, setSheetMode] = useState<KickMode | null>(null);

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data: profile } = await getProfile(session.user.id);
    if (profile?.username) setUsername(profile.username);
  }, []);

  useEffect(() => {
    if (isFocused) loadProfile();
  }, [isFocused, loadProfile]);

  const handleSelectKick = (mode: KickMode) => {
    setPressedMode(mode);
    // brief red highlight then open sheet
    setTimeout(() => {
      setPressedMode(null);
      setSheetMode(mode);
    }, 140);
  };

  const startSession = (analysisMode: AnalysisMode) => {
    if (!sheetMode) return;
    const mode = sheetMode;
    setSheetMode(null);
    navigation.navigate('Camera', { kickMode: mode, analysisMode });
  };

  const showVideoStub = () => {
    Alert.alert('Technique Video', 'Tutorial videos coming soon.');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.greeting}>Hey {username || 'Fighter'},</Text>
        <Text style={styles.sectionTitle}>Let's Train And Get Better</Text>

        <View style={styles.grid}>
          {KICK_TYPES.map(({ mode, label, desc }) => {
            const isPressed = pressedMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.kickCard, isPressed && styles.kickCardPressed]}
                onPress={() => handleSelectKick(mode)}
                activeOpacity={0.9}>
                <View style={styles.iconWrap}>
                  <Image
                    source={KICK_IMAGES[mode]}
                    style={styles.kickImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.kickLabel}>{label}</Text>
                <Text style={styles.kickDesc}>{desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: spacing.md }} />
      </ScrollView>

      {/* ── Bottom Sheet: analysis mode selection ── */}
      <Modal
        transparent
        visible={sheetMode !== null}
        animationType="slide"
        onRequestClose={() => setSheetMode(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetMode(null)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
            onPress={(e) => e.stopPropagation()}>

            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            {/* Selected kick header */}
            <Text style={styles.sheetEyebrow}>SELECTED</Text>
            <Text style={styles.sheetTitle}>{sheetMode?.toUpperCase()}</Text>

            {/* Tertiary: Technique video link */}
            <TouchableOpacity
              style={styles.videoLink}
              onPress={showVideoStub}
              activeOpacity={0.7}>
              <PlayIcon size={11} color={colors.white} />
              <Text style={styles.videoLinkText}>Technique Video</Text>
            </TouchableOpacity>

            {/* Primary CTA */}
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={() => startSession('Quick')}
              activeOpacity={0.85}>
              <Text style={styles.primaryCtaText}>QUICK ANALYSIS</Text>
            </TouchableOpacity>

            {/* Secondary ghost */}
            <TouchableOpacity
              style={styles.ghostCta}
              onPress={() => startSession('Full')}
              activeOpacity={0.7}>
              <Text style={styles.ghostCtaText}>FULL ANALYSIS</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  sectionTitle: {
    fontFamily: fonts.oswaldBold,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },

  grid: { gap: spacing.md },

  /* Massive athletic cards — sharp corners, warm-dark fill */
  kickCard: {
    backgroundColor: colors.card,
    borderRadius: 4,            // sharp, geometric
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent', // reserved space so press highlight doesn't shift layout
  },
  kickCardPressed: {
    borderColor: colors.primary,
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  kickImage: {
    width: 96,
    height: 96,
  },
  kickLabel: {
    fontFamily: fonts.montserratBlack,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  kickDesc: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  /* ── Bottom Sheet ── */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.cardBorder,
    marginBottom: spacing.lg,
  },
  sheetEyebrow: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  sheetTitle: {
    fontFamily: fonts.montserratBlack,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: spacing.md,
  },

  /* Tertiary: tiny text link */
  videoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
  },
  videoLinkText: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    color: colors.white,
    textDecorationLine: 'underline',
  },

  /* Primary CTA — massive solid red */
  primaryCta: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryCtaText: {
    fontFamily: fonts.montserratBlack,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 1.5,
  },

  /* Secondary — ghost */
  ghostCta: {
    backgroundColor: 'transparent',
    borderRadius: 4,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  ghostCtaText: {
    fontFamily: fonts.montserratBold,
    fontSize: 14,
    color: colors.white,
    letterSpacing: 1.5,
  },
});
