import type { ExpoConfig } from 'expo/config';

const EXPECTED_EAS_PROJECT_ID='90d1d6ff-1376-4065-a00c-7cf0415e4347';
const configuredEasProjectId=process.env.EAS_PROJECT_ID;
if(configuredEasProjectId&&configuredEasProjectId!==EXPECTED_EAS_PROJECT_ID){
  throw new Error(`[Kleenest Fleet] EAS_PROJECT_ID drift detected. Expected ${EXPECTED_EAS_PROJECT_ID}, received ${configuredEasProjectId}.`);
}
const EAS_PROJECT_ID=configuredEasProjectId||EXPECTED_EAS_PROJECT_ID;
const otaChannel=process.env.EXPO_PUBLIC_OTA_CHANNEL||'fleet-production';
const googleServicesFile=process.env.GOOGLE_SERVICES_JSON||'./google-services.json';

const config:ExpoConfig={
  name:'Kleenest Fleet',slug:'kleenest-fleet',version:'1.0.0',runtimeVersion:'kleenest-fleet-1.0.0',
  icon:'./assets/app-icon.png',orientation:'portrait',scheme:'kleenest-fleet',userInterfaceStyle:'automatic',
  updates:{enabled:true,url:`https://u.expo.dev/${EAS_PROJECT_ID}`,checkAutomatically:'ON_LOAD',fallbackToCacheTimeout:0,requestHeaders:{'expo-channel-name':otaChannel}},
  ios:{
    bundleIdentifier:'com.kleenest.fleet',supportsTablet:true,config:{usesNonExemptEncryption:false},
    infoPlist:{
      NSLocationWhenInUseUsageDescription:'Kleenest Fleet uses your location to plan, dispatch and execute routes with geofence-aware stops.',
      NSLocationAlwaysAndWhenInUseUsageDescription:'Kleenest Fleet uses background location only when you enable Live Network route execution and geofence-aware stop alerts.',
      UIBackgroundModes:['location'],
    },
  },
  android:{
    package:'com.kleenest.fleet',icon:'./assets/app-icon.png',googleServicesFile,
    permissions:['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION'],
    blockedPermissions:['android.permission.RECORD_AUDIO','android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins:[
    'expo-router','expo-secure-store','@maplibre/maplibre-react-native',
    ['expo-location',{
      locationWhenInUsePermission:'Kleenest Fleet uses your location to plan, dispatch and execute routes with geofence-aware stops.',
      locationAlwaysAndWhenInUsePermission:'Kleenest Fleet uses background location only when you enable Live Network route execution and geofence-aware stop alerts.',
      isAndroidBackgroundLocationEnabled:true,isAndroidForegroundServiceEnabled:true,isIosBackgroundLocationEnabled:true,
    }],
    ['expo-notifications',{defaultChannel:'live-network'}],
  ],
  experiments:{typedRoutes:true},
  extra:{appRole:'fleet',otaChannel,productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},eas:{projectId:EAS_PROJECT_ID}},
};
export default config;
