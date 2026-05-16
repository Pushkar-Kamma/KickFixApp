import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import * as Sentry from '@sentry/react-native';
import {SENTRY_DSN} from '@env';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Initialize Sentry as early as possible — before any app code runs.
// DSN is loaded from .env (safe to ship; the DSN is publishable by design).
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // 0.1 = sample 10% of transactions for performance monitoring.
    // Pure crash reporting is always 100%.
    tracesSampleRate: 0.1,
    // Don't send PII by default. Stack traces + device info only.
    sendDefaultPii: false,
    // Disable in development so we don't pollute Sentry with dev noise.
    enabled: !__DEV__,
  });
}

AppRegistry.registerComponent(appName, () => App);
