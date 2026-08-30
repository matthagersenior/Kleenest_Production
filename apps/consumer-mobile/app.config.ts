import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kleenest',
  slug: 'kleenest-consumer',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'kleenest',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'com.kleenest.app',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: { NSLocationWhenInUseUsageDescription: 'Kleenest uses your location to find nearby restrooms and help calculate routes.' },
  },
  android: {
    package: 'com.kleenest.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  plugins: ['expo-router', 'expo-location', 'expo-secure-store'],
  experiments: { typedRoutes: true },
  extra: { appRole: 'consumer', eas: { projectId: process.env.EAS_PROJECT_ID } },
};
export default config;
