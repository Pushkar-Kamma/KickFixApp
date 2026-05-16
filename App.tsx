import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { RootNavigator } from './src/navigation';

function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <RootNavigator />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

// Wrap with Sentry to capture React render errors. No-op in dev.
export default Sentry.wrap(App);
