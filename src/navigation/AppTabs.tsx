import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import TrainStack from './TrainStack';
import ProfileStack from './ProfileStack';
import { colors, spacing, fonts } from '../theme';
import type { MainTabParamList } from '../types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/* ── Geometric Tab Icons — unified 2px stroke outlines ── */

function HomeIcon({ focused }: { focused: boolean }) {
  const c = focused ? colors.white : colors.tabBarInactive;
  // Bold solid house: chunky filled square body + triangular roof on top.
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Roof: solid downward triangle */}
      <View style={{
        position: 'absolute', top: 0,
        width: 0, height: 0,
        borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 9,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: c,
      }} />
      {/* Body: solid filled square */}
      <View style={{
        width: 16, height: 11,
        backgroundColor: c,
      }} />
    </View>
  );
}

function TrainIcon({ focused }: { focused: boolean }) {
  const c = focused ? colors.white : colors.tabBarInactive;
  // Bold target: thick solid ring + solid center dot. No rounded corners on the cross.
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring — thick stroke */}
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: c }} />
      {/* Solid center dot */}
      <View style={{ position: 'absolute', width: 6, height: 6, backgroundColor: c }} />
    </View>
  );
}

function ProfileIcon({ focused }: { focused: boolean }) {
  const c = focused ? colors.white : colors.tabBarInactive;
  // Bold blocky bust: solid square head + solid trapezoidal shoulders. Sharp edges.
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center' }}>
      {/* Head: solid square */}
      <View style={{ width: 10, height: 10, backgroundColor: c }} />
      {/* Shoulders: solid wide block */}
      <View style={{
        width: 20, height: 10,
        backgroundColor: c,
        marginTop: 2,
      }} />
    </View>
  );
}

function TabItem({ name, focused, IconComponent }: {
  name: string;
  focused: boolean;
  IconComponent: React.FC<{ focused: boolean }>;
}) {
  return (
    <View style={styles.tabItem}>
      <IconComponent focused={focused} />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {name.toUpperCase()}
      </Text>
      {focused && <View style={styles.tabIndicator} />}
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => <TabItem name="Home" focused={focused} IconComponent={HomeIcon} />,
        }}
      />
      <Tab.Screen
        name="Train"
        component={TrainStack}
        options={{
          tabBarIcon: ({ focused }) => <TabItem name="Train" focused={focused} IconComponent={TrainIcon} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => <TabItem name="Profile" focused={focused} IconComponent={ProfileIcon} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.tabBarBackground,
    borderTopColor: colors.tabBarBorder,
    borderTopWidth: 1,
    height: 72,
    paddingTop: spacing.sm,
    elevation: 0,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
  },
  tabLabel: {
    fontFamily: fonts.oswaldRegular,
    fontSize: 10,
    color: colors.tabBarInactive,
    marginTop: 4,
    letterSpacing: 1,
  },
  tabLabelActive: {
    color: colors.white,
  },
  tabIndicator: {
    width: 22,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
});
