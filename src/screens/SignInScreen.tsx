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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function SignInScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !isLoading;
  }, [email, password, isLoading]);

  const handleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) setError(authError.message);
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed.');
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
        <View style={[styles.content, { paddingTop: insets.top + spacing.xxl }]}>

          {/* Logo */}
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
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}>
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
              onPress={handleSignIn}
              disabled={!canSubmit}
              activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Signing in…' : 'SIGN IN'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchRow}
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.7}
              disabled={isLoading}>
              <Text style={styles.switchText}>
                Don't have an account?{' '}
                <Text style={styles.switchLink}>Sign Up</Text>
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

  brandRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.xxl },
  brandKick: {
    fontFamily: fonts.montserratBlack,
    fontSize: 42,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  brandFix: {
    fontFamily: fonts.montserratBlack,
    fontSize: 42,
    color: colors.primary,
    letterSpacing: 2,
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

  forgotRow: { alignSelf: 'flex-end', marginTop: spacing.sm },
  forgotText: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.primary,
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

