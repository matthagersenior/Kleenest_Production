import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';

const storage={getItem:(key:string)=>SecureStore.getItemAsync(key),setItem:(key:string,value:string)=>SecureStore.setItemAsync(key,value),removeItem:(key:string)=>SecureStore.deleteItemAsync(key)};
let singleton:SupabaseClient|null=null;
export function getKleenestSupabaseClient():SupabaseClient{
  if(singleton)return singleton;
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  singleton=createClient(url,key,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'}});
  return singleton;
}
export async function currentMobileUser(){const{data,error}=await getKleenestSupabaseClient().auth.getUser();if(error)throw error;if(!data?.user)throw new Error('Sign in to continue.');return data.user;}
export const profileColumns='id,display_name,username,avatar_url,bio,points,level,streak,total_check_ins,total_reviews';
export async function hydrateMobileProfiles(ids:string[]){const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return[];const{data,error}=await getKleenestSupabaseClient().from('profiles').select(profileColumns).in('id',unique);if(error)throw error;const byId=new Map((data||[]).map((profile:any)=>[String(profile.id),profile]));return unique.map(id=>byId.get(String(id))).filter(Boolean);}
