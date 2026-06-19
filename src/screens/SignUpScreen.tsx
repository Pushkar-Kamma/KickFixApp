import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
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

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      passwordChecks.minLength &&
      passwordChecks.hasLower &&
      passwordChecks.hasUpper &&
      passwordChecks.hasNumber &&
      passwordChecks.hasSpecial &&
      passwordChecks.matches &&
      !isLoading
    );
  }, [email, passwordChecks, isLoading]);

  const handleSignUp = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(authError.message);
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        // Supabase returns success with empty identities[] when the email already exists
        // (anti-enumeration). Surface a clear message so the user can sign in instead.
        setError('An account with this email already exists. Please sign in.');
      } else {
        navigation.navigate('OTP', { email: email.trim() });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Sign up failed.');
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
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/Images/kickfix-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* Header */}
          <Text style={styles.title}>Hi! Welcome to KickFix</Text>
          <Text style={styles.subtitle}>Let's create an account.</Text>

          {/* Email info banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>
              📧  We recommend using a <Text style={styles.infoBold}>Gmail</Text> address.
              {'\n'}Verification emails are sent from{'\n'}
              <Text style={styles.infoHighlight}>dojo@kickfix.edstart.xyz</Text>
            </Text>
            <Text style={styles.infoHint}>Check spam/junk if you don't see it.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />

            {/* Password Requirements */}
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
              onPress={handleSignUp}
              disabled={!canSubmit}
              activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Creating…' : 'SIGN UP'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchRow}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
              disabled={isLoading}>
              <Text style={styles.switchText}>
                Already have an account?{' '}
                <Text style={styles.switchLink}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },

  logoRow: { alignItems: 'center', marginBottom: spacing.lg },
  logoImage: { width: 60, height: 60 },

  title: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 26,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.interRegular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },

  infoBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  infoText: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoBold: {
    fontFamily: fonts.interBold,
    color: colors.textPrimary,
  },
  infoHighlight: {
    fontFamily: fonts.interMedium,
    color: colors.primary,
  },
  infoHint: {
    fontFamily: fonts.interRegular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
  reqText: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.textMuted,
  },
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

  switchRow: { alignItems: 'center', marginTop: spacing.lg },
  switchText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  switchLink: {
    fontFamily: fonts.interBold,
    color: colors.primary,
  },
});

