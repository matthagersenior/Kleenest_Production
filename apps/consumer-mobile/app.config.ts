import type { ExpoConfig } from 'expo/config';

const easProjectId = process.env.EAS_PROJECT_ID;

if (!easProjectId) {
  console.warn('[Kleenest] EAS_PROJECT_ID is not set. Local Expo development can continue, but EAS-linked services require the project ID.');
}

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
  web: {
    output: 'single',
    bundler: 'metro',
    name: 'Kleenest Consumer Preview',
    shortName: 'Kleenest',
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
  experiments: { typedRoutes: true, baseUrl: '/Kleenest_Production' },
  extra: {
    appRole: 'consumer',
    previewRole: 'non-blocking-web-preview',
    eas: easProjectId ? { projectId: easProjectId } : undefined,
  },
};

export default config;
