import type { ExpoConfig } from 'expo/config';
const projectId=process.env.EAS_PROJECT_ID;
const config:ExpoConfig={name:'Kleenest Platform',slug:'kleenest-platform',version:'1.0.0',orientation:'portrait',scheme:'kleenest-platform',userInterfaceStyle:'automatic',android:{package:'com.kleenest.platform'},ios:{bundleIdentifier:'com.kleenest.platform',supportsTablet:true,config:{usesNonExemptEncryption:false}},plugins:['expo-router','expo-secure-store',['expo-notifications',{defaultChannel:'kleenest-platform-updates'}]],extra:{appRole:'platform',releaseChannel:process.env.KLEENEST_RELEASE_CHANNEL||'development',productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},...(projectId?{eas:{projectId}}:{})}};
export default config;
