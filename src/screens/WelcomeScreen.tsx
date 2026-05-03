import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import type { AuthStackParamList } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const QUOTES = [
  { text: 'A true martial artist is not one who fears change, but one who causes it.', author: 'Mas Oyama' },
  { text: 'The more you sweat in training, the less you bleed in combat.', author: 'Richard Marcinko' },
  { text: 'Knowing is not enough, we must apply. Willing is not enough, we must do.', author: 'Bruce Lee' },
  { text: 'There is no first strike in karate.', author: 'Gichin Funakoshi' },
  { text: 'The best fighter is never angry.', author: 'Lao Tzu' },
  { text: 'Training has no limits. You can always do better.', author: 'Mas Oyama' },
  { text: 'Seek nothing outside of yourself.', author: 'Miyamoto Musashi' },
];

export default function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % QUOTES.length);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const current = QUOTES[quoteIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Quote */}
        <View style={styles.quoteSection}>
          <Text style={styles.quote}>"{current.text}"</Text>
          <Text style={styles.quoteAuthor}>{current.author}</Text>
        </View>

        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/Images/kickfix-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.brandRow}>
            <Text style={styles.brandKick}>KICK</Text>
            <Text style={styles.brandFix}>FIX</Text>
          </View>
          <Text style={styles.tagline}>AI-Powered Martial Arts Coach</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>SIGN UP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>LOGIN</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    minHeight: Dimensions.get('window').height - 40,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl,
  },

  quoteSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  quote: {
    fontFamily: fonts.interRegular,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  quoteAuthor: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  logoSection: {
    alignItems: 'center',
  },
  logo: {
    width: 350,
    height: 350,
    marginBottom: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandKick: {
    fontFamily: fonts.montserratBlack,
    fontSize: 56,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  brandFix: {
    fontFamily: fonts.montserratBlack,
    fontSize: 56,
    color: colors.primary,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.interRegular,
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  buttonSection: {
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.montserratBold,
    fontSize: 18,
    color: colors.white,
    letterSpacing: 1,
  },
  secondaryButton: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.montserratBold,
    fontSize: 18,
    color: colors.primary,
    letterSpacing: 1,
  },
});
