import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();

export async function createReverificationQr(businessId:string,locationId:string){
  const{data,error}=await client().rpc('business_create_reverification_qr',{p_business_id:businessId,p_location_id:locationId});
  if(error)throw error;
  if(!data)throw new Error('Reverification QR authority returned no asset.');
  return data;
}
