import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen, SetGoalsScreen, KickHistoryScreen } from '../screens';
import type { HomeStackParamList } from '../types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="SetGoals" component={SetGoalsScreen} />
      <Stack.Screen name="KickHistory" component={KickHistoryScreen} />
    </Stack.Navigator>
  );
}
