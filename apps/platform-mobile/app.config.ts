import type { ExpoConfig } from 'expo/config';

const EXPECTED_EAS_PROJECT_ID='9b5527b5-c8b1-47c1-a961-3e2d5e549a62';
const configuredEasProjectId=process.env.EAS_PROJECT_ID;
if(configuredEasProjectId&&configuredEasProjectId!==EXPECTED_EAS_PROJECT_ID){
  throw new Error(`[KleenestOS] EAS_PROJECT_ID drift detected. Expected ${EXPECTED_EAS_PROJECT_ID}, received ${configuredEasProjectId}.`);
}
const EAS_PROJECT_ID=configuredEasProjectId||EXPECTED_EAS_PROJECT_ID;
const otaChannel=process.env.EXPO_PUBLIC_OTA_CHANNEL||'owner-production';
const nativePushConfigured=process.env.KLEENEST_NATIVE_PUSH_CONFIGURED==='1';

const config:ExpoConfig={
  name:'KleenestOS',slug:'kleenest-owner',version:'1.0.0',runtimeVersion:'kleenest-owner-1.0.0',
  icon:'./assets/app-icon.png',orientation:'portrait',scheme:'kleenest-owner',userInterfaceStyle:'automatic',
  updates:{enabled:true,url:`https://u.expo.dev/${EAS_PROJECT_ID}`,checkAutomatically:'ON_LOAD',fallbackToCacheTimeout:0,requestHeaders:{'expo-channel-name':otaChannel}},
  ios:{bundleIdentifier:'com.kleenest.platform',supportsTablet:true,config:{usesNonExemptEncryption:false}},
  android:{package:'com.kleenest.platform',icon:'./assets/app-icon.png',...(nativePushConfigured?{googleServicesFile:'./google-services.json'}:{}),blockedPermissions:['android.permission.ACCESS_BACKGROUND_LOCATION','android.permission.RECORD_AUDIO','android.permission.SYSTEM_ALERT_WINDOW']},
  plugins:['expo-router','expo-secure-store',['expo-notifications',{defaultChannel:'kleenestos-operations'}]],
  experiments:{typedRoutes:true},
  extra:{appRole:'owner',otaChannel,nativePushConfigured,productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},eas:{projectId:EAS_PROJECT_ID}},
};
export default config;
