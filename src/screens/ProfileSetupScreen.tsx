import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar,
  Image, ScrollView, KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { upsertProfile } from '../services/profiles';

const BELTS = [
  'White', 'Yellow', 'Orange', 'Green', 'Blue',
  'Purple', 'Brown', 'Red', 'Black', 'N/A',
];

const HEIGHTS: string[] = [];
for (let h = 120; h <= 220; h++) {
  HEIGHTS.push(`${h}`);
}

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
};

function Dropdown({ label, value, options, onSelect, placeholder, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalOption, item === value && styles.modalOptionActive]}
                  onPress={() => { onSelect(item); setOpen(false); }}>
                  <Text style={[styles.modalOptionText, item === value && styles.modalOptionTextActive]}>
                    {label === 'HEIGHT (CM)' ? `${item} cm` : item}
                  </Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              style={styles.modalList}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function ProfileSetupScreen({ onComplete }: { onComplete: () => void }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [belt, setBelt] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length >= 3 && !isLoading;

  const handleSetup = async () => {
    setError(null);
    setIsLoading(true);

    // Hard timeout — if any Supabase call hangs (network, RLS, etc) the user
    // gets an error instead of being stuck with a permanently grey button.
    // Accept PromiseLike so Supabase query builders (thenables) type-check.
    const withTimeout = <T,>(p: PromiseLike<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out. Check your connection.`)), ms),
        ),
      ]);

    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(), 10000, 'Session check',
      );
      if (!session?.user) {
        setError('Not authenticated. Please sign in again.');
        setIsLoading(false);
        return;
      }

      // Check username uniqueness
      const { data: existing, error: lookupErr } = await withTimeout(
        supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim())
          .neq('id', session.user.id)
          .maybeSingle(),
        15000,
        'Username check',
      );
      if (lookupErr) {
        setError(`Username check failed: ${lookupErr.message}`);
        setIsLoading(false);
        return;
      }

      if (existing) {
        setError('Username already taken. Choose another.');
        setIsLoading(false);
        return;
      }

      const { error: profileError } = await withTimeout(
        upsertProfile(session.user.id, {
          username: username.trim(),
          belt_level: belt || null,
          height_cm: heightCm ? parseInt(heightCm, 10) : null,
        }),
        15000,
        'Profile save',
      );
      if (profileError) {
        setError(profileError.message);
      } else {
        onComplete();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Setup failed.');
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

          <Text style={styles.title}>Profile Setup</Text>

          <View style={styles.form}>
            <Text style={styles.label}>USERNAME *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Your display name"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!isLoading}
            />

            <Dropdown
              label="BELT"
              value={belt}
              options={BELTS}
              onSelect={setBelt}
              placeholder="Select belt"
              disabled={isLoading}
            />

            <Dropdown
              label="HEIGHT (CM)"
              value={heightCm}
              options={HEIGHTS}
              onSelect={setHeightCm}
              placeholder="Select height"
              disabled={isLoading}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
              onPress={handleSetup}
              disabled={!canSubmit}
              activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Setting up…' : 'SET UP'}
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
    marginBottom: spacing.xl,
  },

  form: {},
  label: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  textInput: {
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
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputText: {
    fontSize: 16,
    fontFamily: fonts.interRegular,
    color: colors.textPrimary,
  },
  placeholder: { color: colors.textMuted },
  chevron: { fontSize: 14, color: colors.textMuted },

  row: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1 },

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

  // Modal dropdown styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: 400,
  },
  modalTitle: {
    fontFamily: fonts.oswaldBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalList: { maxHeight: 320 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  modalOptionActive: {
    backgroundColor: colors.primaryTint,
  },
  modalOptionText: {
    fontFamily: fonts.interRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalOptionTextActive: {
    color: colors.primary,
    fontFamily: fonts.interBold,
  },
});
