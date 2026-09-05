import type { ExpoConfig } from 'expo/config';

const EXPECTED_EAS_PROJECT_ID='15ac343b-81bf-459b-8c25-1b2fc8b293de';
const configuredEasProjectId=process.env.EAS_PROJECT_ID;
if(configuredEasProjectId&&configuredEasProjectId!==EXPECTED_EAS_PROJECT_ID){
  throw new Error(`[Kleenest Business] EAS_PROJECT_ID drift detected. Expected ${EXPECTED_EAS_PROJECT_ID}, received ${configuredEasProjectId}.`);
}
const EAS_PROJECT_ID=configuredEasProjectId||EXPECTED_EAS_PROJECT_ID;
const otaChannel=process.env.EXPO_PUBLIC_OTA_CHANNEL||'business-production';

const config:ExpoConfig={
  name:'Kleenest Business',slug:'kleenest-business',version:'1.0.0',runtimeVersion:'kleenest-business-1.0.0',
  icon:'./assets/app-icon.png',orientation:'portrait',scheme:'kleenest-business',userInterfaceStyle:'automatic',
  updates:{enabled:true,url:`https://u.expo.dev/${EAS_PROJECT_ID}`,checkAutomatically:'ON_LOAD',fallbackToCacheTimeout:0,requestHeaders:{'expo-channel-name':otaChannel}},
  ios:{
    bundleIdentifier:'com.kleenest.business',supportsTablet:true,config:{usesNonExemptEncryption:false},
    infoPlist:{
      NSLocationWhenInUseUsageDescription:'Kleenest Business uses location to operate nearby Live Network and location workflows you enable.',
      NSLocationAlwaysAndWhenInUseUsageDescription:'Kleenest Business uses background location only when you enable Live Network geofence alerts for your business locations.',
      UIBackgroundModes:['location'],
    },
  },
  android:{
    package:'com.kleenest.business',icon:'./assets/app-icon.png',
    permissions:['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION'],
    blockedPermissions:['android.permission.RECORD_AUDIO','android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins:[
    'expo-router','expo-secure-store',
    ['expo-location',{
      locationWhenInUsePermission:'Kleenest Business uses location to operate nearby Live Network and location workflows you enable.',
      locationAlwaysAndWhenInUsePermission:'Kleenest Business uses background location only when you enable Live Network geofence alerts for your business locations.',
      isAndroidBackgroundLocationEnabled:true,isAndroidForegroundServiceEnabled:true,isIosBackgroundLocationEnabled:true,
    }],
    ['expo-notifications',{defaultChannel:'live-network'}],
    ['expo-image-picker',{photosPermission:'Kleenest Business uses your photo library only when you choose business branding or other media to upload.',microphonePermission:false}],
  ],
  experiments:{typedRoutes:true},
  extra:{appRole:'business',otaChannel,productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},eas:{projectId:EAS_PROJECT_ID}},
};
export default config;
