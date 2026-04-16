import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppTabs from './AppTabs';
import AuthStack from './AuthStack';
import type { RootStackParamList } from '../types';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  // For now, skip auth and go straight to the app.
  // When Supabase is wired in Step 2, this will check session state.
  const isAuthenticated = true;

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
        {isAuthenticated ? (
          <Stack.Screen name="MainTabs" component={AppTabs} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
