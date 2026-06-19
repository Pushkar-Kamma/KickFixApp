import React, { useState, useRef } from 'react';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPasswordOTP'>;

const CODE_LENGTH = 6;

export default function ForgotPasswordOTPScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { email } = route.params;
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length === 0) {
      const next = [...code];
      next[index] = '';
      setCode(next);
      return;
    }
    if (cleaned.length === CODE_LENGTH) {
      const next = cleaned.split('');
      setCode(next);
      inputs.current[CODE_LENGTH - 1]?.focus();
      return;
    }
    const next = [...code];
    next[index] = cleaned[0];
    setCode(next);
    if (index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && code[index] === '' && index > 0) {
      const next = [...code];
      next[index - 1] = '';
      setCode(next);
      inputs.current[index - 1]?.focus();
    }
  };

  const fullCode = code.join('');
  const canSubmit = fullCode.length === CODE_LENGTH && !isLoading;

  const handleVerify = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: 'recovery',
      });
      if (verifyError) {
        setError(verifyError.message);
      } else {
        navigation.navigate('NewPassword', { email });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed.');
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
        <View style={[styles.content, { paddingTop: insets.top + spacing.xl }]}>

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

          <Text style={styles.title}>Verify Your Identity</Text>
          <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}</Text>

          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputs.current[i] = ref; }}
                style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
                value={digit}
                onChangeText={t => handleChange(t, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={i === 0 ? CODE_LENGTH : 1}
                editable={!isLoading}
                selectionColor={colors.primary}
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backText}><Text style={styles.backLink}>Go Back</Text></Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
            onPress={handleVerify}
            disabled={!canSubmit}
            activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Verifying…' : 'SUBMIT'}
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

  logoRow: { alignItems: 'center', marginBottom: spacing.md },
  logoImage: { width: 60, height: 60 },

  brandRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg },
  brandKick: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.textPrimary, letterSpacing: 2 },
  brandFix: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.primary, letterSpacing: 2 },

  title: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: spacing.lg },
  codeBox: {
    width: 48, height: 56,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    textAlign: 'center',
    fontSize: 24, fontFamily: fonts.montserratBold, color: colors.textPrimary,
  },
  codeBoxFilled: { borderColor: colors.primary },

  errorText: { fontFamily: fonts.interRegular, fontSize: 14, color: colors.error, textAlign: 'center', marginBottom: spacing.md },

  backText: { fontFamily: fonts.interRegular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  backLink: { fontFamily: fonts.interBold, color: colors.primary },

  primaryButton: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white, letterSpacing: 1 },
});
