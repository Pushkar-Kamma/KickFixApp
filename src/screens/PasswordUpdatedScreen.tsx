import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'PasswordUpdated'>;

export default function PasswordUpdatedScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
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

        <Text style={styles.title}>Password Updated</Text>

        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>

        <Text style={styles.message}>
          Your password has been successfully updated.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>LOGIN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center' },

  logoRow: { marginBottom: spacing.md },
  logoImage: { width: 60, height: 60 },

  brandRow: { flexDirection: 'row', marginBottom: spacing.xxl },
  brandKick: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.textPrimary, letterSpacing: 2 },
  brandFix: { fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.primary, letterSpacing: 2 },

  title: {
    fontFamily: fonts.montserratExtraBold,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  checkMark: { fontSize: 40, color: colors.white },

  message: {
    fontFamily: fonts.interRegular,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    fontFamily: fonts.montserratBold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 1,
  },
});
