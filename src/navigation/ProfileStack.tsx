import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '../screens';
import EditUsernameScreen from '../screens/EditUsernameScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import type { ProfileStackParamList } from '../types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EditUsername" component={EditUsernameScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
    </Stack.Navigator>
  );
}
