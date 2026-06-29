import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import BootSplash from 'react-native-bootsplash';
import EncryptedStorage from 'react-native-encrypted-storage';
import AppTabs from './AppTabs';
import AuthStack from './AuthStack';
import { ProfileSetupScreen } from '../screens';
import type { RootStackParamList } from '../types';
import { colors } from '../theme';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import type { Session } from '@supabase/supabase-js';

const Stack = createNativeStackNavigator<RootStackParamList>();
const HAS_PROFILE_KEY = 'kickfix.hasProfile';

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // Background refresh of profile status. Updates cache + state without blocking UI.
  const refreshProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await getProfile(userId);
      const has = !!data?.username;
      setHasProfile(has);
      EncryptedStorage.setItem(HAS_PROFILE_KEY, has ? '1' : '0').catch(() => {});
    } catch {
      // ignore — keep cached value
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      // Safety: never sit on splash longer than 4s no matter what.
      const timeout = setTimeout(() => {
        if (isMounted && !isReady) setIsReady(true);
      }, 4000);

      try {
        // Read cached hasProfile FIRST — sync render decision without network.
        const cached = await EncryptedStorage.getItem(HAS_PROFILE_KEY).catch(() => null);
        if (isMounted && cached === '1') setHasProfile(true);

        // No session -> AuthStack (Welcome offers Continue as Guest or Sign In).
        // Guest is user-initiated from Welcome via ensureAnonSession, not automatic.
        const s = (await supabase.auth.getSession()).data.session ?? null;
        if (!isMounted) return;
        setSession(s);

        // Refresh profile in background — do NOT await, don't block render.
        if (s?.user) refreshProfile(s.user.id);
      } catch {
        if (!isMounted) return;
        setSession(null);
      } finally {
        clearTimeout(timeout);
        if (isMounted) setIsReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        refreshProfile(newSession.user.id);
      } else {
        setHasProfile(false);
        EncryptedStorage.removeItem(HAS_PROFILE_KEY).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshProfile]);

  const isAuthenticated = !!session?.user;

  // Hide the native splash screen as soon as auth state is resolved.
  // Do NOT wait for profileLoading — a slow profile fetch would keep splash up.
  // The loading spinner below covers the brief gap if profile check is still running.
  useEffect(() => {
    if (isReady) {
      BootSplash.hide({ fade: true }).catch(() => {});
    }
  }, [isReady]);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.textPrimary,
          border: colors.cardBorder,
          notification: colors.error,
        },
      }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !hasProfile ? (
          <Stack.Screen name="ProfileSetup">
            {() => <ProfileSetupScreen onComplete={() => setHasProfile(true)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="MainTabs" component={AppTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
