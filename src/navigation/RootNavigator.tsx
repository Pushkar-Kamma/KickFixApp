import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import BootSplash from 'react-native-bootsplash';
import AppTabs from './AppTabs';
import AuthStack from './AuthStack';
import { ProfileSetupScreen } from '../screens';
import type { RootStackParamList } from '../types';
import { colors } from '../theme';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import type { Session } from '@supabase/supabase-js';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const checkProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data } = await getProfile(userId);
      setHasProfile(!!data?.username);
    } catch {
      setHasProfile(false);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      // Timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.log('[RootNav] Timeout — forcing ready');
        if (isMounted) {
          setSession(null);
          setIsReady(true);
        }
      }, 5000);

      try {
        console.log('[RootNav] Getting session...');
        const { data } = await supabase.auth.getSession();
        console.log('[RootNav] Session result:', !!data.session);
        if (!isMounted) return;
        const s = data.session ?? null;
        setSession(s);
        if (s?.user) {
          console.log('[RootNav] Checking profile for', s.user.id);
          await checkProfile(s.user.id);
          console.log('[RootNav] Profile check done');
        }
      } catch (e) {
        console.log('[RootNav] Error:', e);
        if (!isMounted) return;
        setSession(null);
      } finally {
        clearTimeout(timeout);
        console.log('[RootNav] Setting isReady=true');
        if (isMounted) setIsReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        await checkProfile(newSession.user.id);
      } else {
        setHasProfile(false);
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [checkProfile]);

  const isAuthenticated = !!session?.user;

  // Hide the native splash screen once auth is resolved.
  // Wrapped in try/catch so a missing native module never crashes the app.
  useEffect(() => {
    if (isReady && !profileLoading) {
      BootSplash.hide({ fade: true }).catch(() => {});
    }
  }, [isReady, profileLoading]);

  if (!isReady || profileLoading) {
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
