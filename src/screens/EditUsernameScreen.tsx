import React, { useState, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { ProfileStackParamList } from '../types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditUsername'>;

export default function EditUsernameScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [confirmUsername, setConfirmUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = useMemo(() => ({
    minLength: username.trim().length >= 3,
    matches: username.trim().length > 0 && username.trim() === confirmUsername.trim(),
  }), [username, confirmUsername]);

  const canSubmit = checks.minLength && checks.matches && !isLoading;

  const handleUpdate = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Not authenticated.');
        setIsLoading(false);
        return;
      }

      // Check uniqueness
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .neq('id', session.user.id)
        .maybeSingle();

      if (existing) {
        setError('Username already taken. Choose another.');
        setIsLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', session.user.id);

      if (updateError) {
        setError(updateError.message);
      } else {
        navigation.goBack();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Update failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <View style={[styles.content, { paddingTop: insets.top + spacing.md }]}>

          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Change Username</Text>
          <Text style={styles.subtitle}>Enter your new username twice to confirm.</Text>

          <Text style={styles.label}>NEW USERNAME</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 3 characters"
            placeholderTextColor={colors.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!isLoading}
          />

          <View style={styles.requirements}>
            <Text style={[styles.reqText, checks.minLength && styles.reqMet]}>
              {checks.minLength ? '✓' : '✗'} At least 3 characters
            </Text>
          </View>

          <Text style={[styles.label, { marginTop: spacing.lg }]}>CONFIRM USERNAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter username"
            placeholderTextColor={colors.textMuted}
            value={confirmUsername}
            onChangeText={setConfirmUsername}
            autoCapitalize="none"
            editable={!isLoading}
          />
          {confirmUsername.length > 0 && (
            <Text style={[styles.reqText, checks.matches ? styles.reqMet : styles.reqFail]}>
              {checks.matches ? '✓ Usernames match' : '✗ Usernames do not match'}
            </Text>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
            onPress={handleUpdate}
            disabled={!canSubmit}
            activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Updating…' : 'UPDATE USERNAME'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl },

  backBtn: { fontFamily: fonts.interBold, fontSize: 16, color: colors.primary, marginBottom: spacing.lg },

  title: { fontFamily: fonts.montserratExtraBold, fontSize: 26, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.interRegular, fontSize: 15, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },

  label: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: fonts.interRegular,
    color: colors.textPrimary,
  },

  requirements: { marginTop: spacing.sm, gap: 4 },
  reqText: { fontFamily: fonts.interRegular, fontSize: 13, color: colors.textMuted },
  reqMet: { color: colors.accent },
  reqFail: { color: colors.error },

  errorText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  primaryButtonText: {
    fontFamily: fonts.montserratBold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 1,
  },
});
