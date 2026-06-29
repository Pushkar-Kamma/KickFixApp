// CreateAccountScreen — upgrades a guest (anonymous) user into a permanent
// account by attaching an email + password. Supabase keeps the SAME user id,
// so all kicks/sessions/profile carry over. After this, a confirmation email
// is sent; once confirmed the account is permanent and works on any device.

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { ProfileStackParamList } from '../types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'CreateAccount'>;

export default function CreateAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const e = email.trim();
    if (e.length < 5 || !e.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    // Attaches email+password to the existing anonymous user (same id → data kept).
    const { error } = await supabase.auth.updateUser({ email: e, password });
    setLoading(false);
    if (error) {
      Alert.alert('Could not create account', error.message);
      return;
    }
    Alert.alert(
      'Almost done',
      `We sent a confirmation link to ${e}. Tap it to finish creating your account. Your progress is saved.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.sub}>Keep your kicks and stats forever, and use them on any device.</Text>

        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{loading ? 'CREATING…' : 'CREATE ACCOUNT'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.montserratExtraBold, fontSize: 28, color: colors.textPrimary, marginBottom: spacing.sm },
  sub: { fontFamily: fonts.interRegular, fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
  label: { fontFamily: fonts.oswaldBold, fontSize: 12, color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md, paddingVertical: 14, color: colors.textPrimary, fontFamily: fonts.interRegular, fontSize: 16,
  },
  button: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl },
  buttonText: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white, letterSpacing: 1 },
  cancel: { fontFamily: fonts.interMedium, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
