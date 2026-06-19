import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, fonts } from '../theme';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import type { ProfileStackParamList } from '../types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

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
  formatOption?: (v: string) => string;
};

function Dropdown({ label, value, options, onSelect, placeholder, formatOption }: DropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.dropdownInput}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}>
        <Text style={[styles.dropdownText, !value && styles.placeholder]}>
          {value ? (formatOption ? formatOption(value) : value) : placeholder}
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
                    {formatOption ? formatOption(item) : item}
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

export default function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [belt, setBelt] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadCurrent();
  }, []);

  const loadCurrent = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await getProfile(session.user.id);
    if (data) {
      setBelt(data.belt_level ?? '');
      setHeightCm(data.height_cm ? `${data.height_cm}` : '');
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Not authenticated.');
        setIsLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          belt_level: belt || null,
          height_cm: heightCm ? parseInt(heightCm, 10) : null,
        })
        .eq('id', session.user.id);

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        setTimeout(() => navigation.goBack(), 1000);
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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Update your physical details</Text>

        <Dropdown
          label="BELT"
          value={belt}
          options={BELTS}
          onSelect={setBelt}
          placeholder="Select belt"
        />

        <View style={{ height: spacing.md }} />

        <Dropdown
          label="HEIGHT (CM)"
          value={heightCm}
          options={HEIGHTS}
          onSelect={setHeightCm}
          placeholder="Select height"
          formatOption={v => `${v} cm`}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>✓ Updated!</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={isLoading}
            activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Saving…' : 'SAVE CHANGES'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },

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
  dropdownInput: {
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
  dropdownText: {
    fontSize: 16,
    fontFamily: fonts.interRegular,
    color: colors.textPrimary,
  },
  placeholder: { color: colors.textMuted },
  chevron: { fontSize: 14, color: colors.textMuted },

  errorText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  successBanner: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  successText: { fontFamily: fonts.montserratBold, fontSize: 16, color: colors.white },

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
