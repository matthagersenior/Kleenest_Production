import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kleenest',
  slug: 'kleenest-consumer',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'kleenest',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.kleenest.app',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: { NSLocationWhenInUseUsageDescription: 'Kleenest uses your location to find nearby restrooms and help calculate routes.' },
  },
  android: {
    package: 'com.kleenest.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
  },
  plugins: [
    'expo-router',
    'expo-location',
    'expo-secure-store',
    '@maplibre/maplibre-react-native',
    ['expo-camera', { cameraPermission: 'Kleenest uses your camera to scan Kleenest restroom QR codes.' }],
    ['expo-image-picker', { photosPermission: 'Kleenest uses your photo library so you can choose a public contributor profile photo.', microphonePermission: false }],
    ['expo-notifications', { defaultChannel: 'kleenest-updates' }],
  ],
  experiments: { typedRoutes: true },
  extra: { appRole: 'consumer', eas: { projectId: process.env.EAS_PROJECT_ID } },
};
export default config;
