const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const webAliases = {
  '@maplibre/maplibre-react-native': path.resolve(__dirname, 'web/maplibrePreview.tsx'),
  'expo-secure-store': path.resolve(__dirname, 'web/secureStorePreview.ts'),
  'expo-notifications': path.resolve(__dirname, 'web/notificationsPreview.ts'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webAliases[moduleName]) {
    return { type: 'sourceFile', filePath: webAliases[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
