import type { ExpoConfig } from 'expo/config';

const PRODUCTION_EAS_PROJECT_ID = '22a65aa3-c615-4c4f-a34d-084babc28fd7';
const configuredEasProjectId = process.env.EAS_PROJECT_ID;
const standaloneAndroid = process.env.KLEENEST_STANDALONE_ANDROID === '1';

if (configuredEasProjectId && configuredEasProjectId !== PRODUCTION_EAS_PROJECT_ID) {
  throw new Error(`[Kleenest] EAS_PROJECT_ID drift detected. Expected ${PRODUCTION_EAS_PROJECT_ID}, received ${configuredEasProjectId}.`);
}

const easProjectId = configuredEasProjectId || PRODUCTION_EAS_PROJECT_ID;
const devClientPlugins: NonNullable<ExpoConfig['plugins']> = standaloneAndroid
  ? []
  : [['expo-dev-client', { launchMode: 'most-recent' }]];

const config: ExpoConfig = {
  name: 'Kleenest',
  slug: 'kleenest-consumer',
  version: '0.1.0',
  runtimeVersion: 'kleenest-consumer-0.1.0',
  ...(standaloneAndroid ? {} : { icon: './assets/app-icon.png' }),
  updates: {
    enabled: true,
    url: `https://u.expo.dev/${easProjectId}`,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    requestHeaders: { 'expo-channel-name': 'consumer-production' },
  },
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
    ...(standaloneAndroid ? {} : { icon: './assets/app-icon.png' }),
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    intentFilters: [{
      action: 'VIEW',
      autoVerify: false,
      data: [{ scheme: 'kleenest' }],
      category: ['BROWSABLE', 'DEFAULT'],
    }],
  },
  web: {
    output: 'single',
    bundler: 'metro',
    name: 'Kleenest',
    shortName: 'Kleenest',
  },
  plugins: [
    'expo-router',
    'expo-location',
    'expo-secure-store',
    ...devClientPlugins,
    '@maplibre/maplibre-react-native',
    ['expo-camera', { cameraPermission: 'Kleenest uses your camera to scan Kleenest restroom QR codes.' }],
    ['expo-image-picker', { photosPermission: 'Kleenest uses your photo library so you can choose a public contributor profile photo.', microphonePermission: false }],
    ['expo-notifications', { defaultChannel: 'kleenest-updates' }],
  ],
  experiments: { typedRoutes: true, baseUrl: '/Kleenest_Production' },
  extra: {
    appRole: 'consumer',
    otaChannel: 'consumer-production',
    previewRole: 'non-blocking-web-preview',
    productionEnvironment: {
      expoProjectId: PRODUCTION_EAS_PROJECT_ID,
      supabaseProjectRef: 'ssgesjzdvdsqacdtasje',
    },
    eas: { projectId: easProjectId },
  },
};

export default config;
