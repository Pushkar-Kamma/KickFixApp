import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'NewPassword'>;

export default function NewPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordChecks = useMemo(() => ({
    minLength: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{}|;':"<>?,.\/`~]/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  }), [password, confirmPassword]);

  const canSubmit = passwordChecks.minLength && passwordChecks.hasLower && passwordChecks.hasUpper && passwordChecks.hasNumber && passwordChecks.hasSpecial && passwordChecks.matches && !isLoading;

  const handleUpdate = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
      } else {
        // Password updated — user is now signed in via the recovery session.
        // onAuthStateChange in RootNavigator will auto-navigate to MainTabs.
        // If not, navigate to Login.
        navigation.navigate('PasswordUpdated');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <View style={[styles.content, { paddingTop: insets.top + spacing.xxl }]}>

          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/Images/kickfix-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandKick}>KICK</Text>
            <Text style={styles.brandFix}>FIX</Text>
          </View>

          <Text style={styles.title}>New Credentials</Text>
          <Text style={styles.subtitle}>Your identity has been verified.{'\n'}Enter your new password.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>NEW PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />

            <View style={styles.requirements}>
              <Text style={[styles.reqText, passwordChecks.minLength && styles.reqMet]}>
                {passwordChecks.minLength ? '✓' : '✗'} At least 8 characters
              </Text>
              <Text style={[styles.reqText, passwordChecks.hasLower && styles.reqMet]}>
                {passwordChecks.hasLower ? '✓' : '✗'} Lowercase letter
              </Text>
              <Text style={[styles.reqText, passwordChecks.hasUpper && styles.reqMet]}>
                {passwordChecks.hasUpper ? '✓' : '✗'} Uppercase letter
              </Text>
              <Text style={[styles.reqText, passwordChecks.hasNumber && styles.reqMet]}>
                {passwordChecks.hasNumber ? '✓' : '✗'} Number
              </Text>
              <Text style={[styles.reqText, passwordChecks.hasSpecial && styles.reqMet]}>
                {passwordChecks.hasSpecial ? '✓' : '✗'} Special character (!@#$...)
              </Text>
            </View>

            <Text style={[styles.label, { marginTop: spacing.md }]}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter password"
              placeholderTextColor={colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!isLoading}
            />
            {confirmPassword.length > 0 && (
              <Text style={[styles.reqText, passwordChecks.matches ? styles.reqMet : styles.reqFail]}>
                {passwordChecks.matches ? '✓ Passwords match' : '✗ Passwords do not match'}
              </Text>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
              onPress={handleUpdate}
              disabled={!canSubmit}
              activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Updating…' : 'UPDATE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl },

  logoRow: { alignItems: 'center', marginBottom: spacing.md },
  logoImage: { width: 60, height: 60 },

  brandRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg },
  brandKick: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.textPrimary, letterSpacing: 2 },
  brandFix: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.primary, letterSpacing: 2 },

  title: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.interRegular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  form: {},
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
