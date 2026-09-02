import type { ExpoConfig } from 'expo/config';
const projectId=process.env.EAS_PROJECT_ID;
const config:ExpoConfig={name:'Kleenest Fleet',slug:'kleenest-fleet',version:'1.0.0',orientation:'portrait',scheme:'kleenest-fleet',userInterfaceStyle:'automatic',android:{package:'com.kleenest.fleet'},ios:{bundleIdentifier:'com.kleenest.fleet',supportsTablet:true,config:{usesNonExemptEncryption:false}},plugins:['expo-router','expo-secure-store'],extra:{appRole:'fleet',releaseChannel:process.env.KLEENEST_RELEASE_CHANNEL||'development',productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},...(projectId?{eas:{projectId}}:{})}};
export default config;
