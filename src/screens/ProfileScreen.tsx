import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, StatusBar, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { replayWalkthrough } from '../lib/walkthrough';
import { getProfile, deleteMyAccount } from '../services/profiles';
import type { DbProfile, ProfileStackParamList } from '../types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

// App / support constants
const APP_VERSION = '1.0.6';
const FEEDBACK_EMAIL = 'dojo@kickfix.edstart.xyz';
const PRIVACY_URL = 'https://pushkar-kamma.github.io/KickFixApp/privacy-policy.html';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.KickFix';
const PLAY_MARKET_URL = 'market://details?id=app.KickFix';

async function openUrl(url: string, fallback?: string) {
  try {
    await Linking.openURL(url);
  } catch {
    if (fallback) {
      try { await Linking.openURL(fallback); } catch { /* nothing we can do */ }
    }
  }
}

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

// Tappable row for links/actions (no value, just label + chevron).
function ActionRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.infoRow} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.editChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [email, setEmail] = useState('');
  const [isGuest, setIsGuest] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setEmail(session.user.email ?? '');
    setIsGuest(session.user.is_anonymous === true);
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your kicks, sessions, and profile data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Second confirmation — destructive + irreversible warrants two taps.
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be erased immediately. Type DELETE in your head and tap below to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Permanently Delete',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await deleteMyAccount();
                    if (error) {
                      Alert.alert('Delete failed', error.message);
                      return;
                    }
                    // Sign out to clear local session + tokens. The DB row is
                    // already gone, so supabase will detect the invalid session
                    // and route the user back to login.
                    await supabase.auth.signOut();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const initial = (profile?.username ?? 'K')[0].toUpperCase();

  const handleSendFeedback = () => {
    openUrl(`mailto:${FEEDBACK_EMAIL}?subject=KickFix%20Feedback`);
  };
  const handleRate = () => {
    openUrl(PLAY_MARKET_URL, PLAY_URL);
  };
  const handlePrivacy = () => {
    openUrl(PRIVACY_URL);
  };
  const handleReplayTutorial = () => {
    replayWalkthrough();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
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
          <Text style={styles.email}>{isGuest ? 'Guest account' : email}</Text>
        </View>

        {isGuest && (
          <TouchableOpacity
            style={styles.upgradeCard}
            onPress={() => navigation.navigate('CreateAccount')}
            activeOpacity={0.85}>
            <Text style={styles.upgradeTitle}>Create an account</Text>
            <Text style={styles.upgradeSub}>Save your progress and use it on any device. Your kicks stay.</Text>
          </TouchableOpacity>
        )}

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

        {/* Support */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <ActionRow label="Replay Tutorial" onPress={handleReplayTutorial} />
        <ActionRow label="Send Feedback" onPress={handleSendFeedback} />
        <ActionRow label="Rate KickFix" onPress={handleRate} />
        <ActionRow label="Privacy Policy" onPress={handlePrivacy} />

        {/* About */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <InfoRow label="Version" value={APP_VERSION} />
        <InfoRow label="AI Model" value="MediaPipe Pose" />

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

        {/* Delete Account — destructive, distinct from Sign Out */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Text style={styles.deleteText}>DELETE ACCOUNT</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  upgradeCard: {
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintBorder,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  upgradeTitle: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white, marginBottom: 2 },
  upgradeSub: { fontFamily: fonts.interRegular, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

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

  deleteButton: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  deleteText: {
    fontFamily: fonts.montserratBold,
    fontSize: 13,
    color: colors.error,
    letterSpacing: 1.5,
  },
});
