import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import type { DbProfile, ProfileStackParamList } from '../types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

function InfoRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.infoRow}
      onPress={onEdit}
      disabled={!onEdit}
      activeOpacity={onEdit ? 0.6 : 1}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRight}>
        <Text style={styles.infoValue}>{value}</Text>
        {onEdit && <Text style={styles.editChevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [email, setEmail] = useState('');

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setEmail(session.user.email ?? '');
    const { data } = await getProfile(session.user.id);
    if (data) setProfile(data);
  }, []);

  useEffect(() => {
    if (isFocused) loadProfile();
  }, [isFocused, loadProfile]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const initial = (profile?.username ?? 'K')[0].toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.pageTitle}>Profile</Text>

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.username}>{profile?.username ?? 'Fighter'}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <InfoRow
          label="Username"
          value={profile?.username ?? '—'}
          onEdit={() => navigation.navigate('EditUsername')}
        />
        <InfoRow
          label="Height"
          value={profile?.height_cm ? `${profile.height_cm} cm` : '—'}
          onEdit={() => navigation.navigate('EditProfile')}
        />
        <InfoRow
          label="Belt"
          value={profile?.belt_level ?? '—'}
          onEdit={() => navigation.navigate('EditProfile')}
        />

        {/* Preferences */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <InfoRow label="Training Preference" value="Kicks" />

        {/* About */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <InfoRow label="Version" value="0.0.1" />
        <InfoRow label="AI Model" value="MediaPipe Pose" />

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  pageTitle: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 28,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  avatarSection: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontFamily: fonts.montserratBlack,
    fontSize: 36,
    color: colors.white,
  },
  username: {
    fontFamily: fonts.montserratBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  email: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  sectionLabel: {
    fontFamily: fonts.oswaldBold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  infoLabel: {
    fontFamily: fonts.interRegular,
    fontSize: 16,
    color: colors.textSecondary,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoValue: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  editChevron: {
    fontFamily: fonts.interBold,
    fontSize: 22,
    color: colors.primary,
  },

  signOutButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  signOutText: {
    fontFamily: fonts.montserratBold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 1,
  },
});
