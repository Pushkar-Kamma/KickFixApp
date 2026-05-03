import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && !isLoading;

  const handleNext = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
      );
      if (resetError) {
        setError(resetError.message);
      } else {
        navigation.navigate('ForgotPasswordOTP', { email: email.trim() });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send reset code.');
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

          {/* Icon */}
          <View style={styles.iconRow}>
            <Text style={styles.lockIcon}>🔒</Text>
          </View>

          <Text style={styles.title}>Oh no! I Forgot?</Text>
          <Text style={styles.subtitle}>
            Provide the email associated with your account.
          </Text>

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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
              onPress={handleNext}
              disabled={!canSubmit}
              activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Sending…' : 'NEXT'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backRow}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}>
              <Text style={styles.backText}>
                <Text style={styles.backLink}>Back to Sign In</Text>
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

  iconRow: { alignItems: 'center', marginBottom: spacing.lg },
  lockIcon: { fontSize: 64 },

  title: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
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

  backRow: { alignItems: 'center', marginTop: spacing.lg },
  backText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  backLink: {
    fontFamily: fonts.interBold,
    color: colors.primary,
  },
});
