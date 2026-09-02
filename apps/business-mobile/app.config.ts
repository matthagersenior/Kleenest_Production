import type { ExpoConfig } from 'expo/config';
const projectId=process.env.EAS_PROJECT_ID;
const config:ExpoConfig={name:'Kleenest Business',slug:'kleenest-business',version:'1.0.0',orientation:'portrait',scheme:'kleenest-business',userInterfaceStyle:'automatic',android:{package:'com.kleenest.business'},ios:{bundleIdentifier:'com.kleenest.business',supportsTablet:true,config:{usesNonExemptEncryption:false}},plugins:['expo-router','expo-secure-store',['expo-notifications',{defaultChannel:'kleenest-business-updates'}]],extra:{appRole:'business',releaseChannel:process.env.KLEENEST_RELEASE_CHANNEL||'development',productionEnvironment:{supabaseProjectRef:'ssgesjzdvdsqacdtasje'},...(projectId?{eas:{projectId}}:{})}};
export default config;
