import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TrainSelectScreen, CameraScreen } from '../screens';
import type { TrainStackParamList } from '../types';

const Stack = createNativeStackNavigator<TrainStackParamList>();

export default function TrainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TrainSelect" component={TrainSelectScreen} />
      <Stack.Screen name="Camera" component={CameraScreen} />
    </Stack.Navigator>
  );
}
