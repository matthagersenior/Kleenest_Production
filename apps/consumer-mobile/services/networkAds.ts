import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();

export async function consumerNetworkAdsEnabled(){
  const{data,error}=await client().rpc('consumer_network_ads_enabled');
  if(error)return false;
  return data!==false;
}
