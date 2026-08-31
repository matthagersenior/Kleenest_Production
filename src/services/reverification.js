import { getSupabase } from '../lib/supabase.js';

function requireId(value,label){if(!value)throw new Error(`${label} is required.`);return value}
async function rpc(name,args){const{data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data}

export function getBusinessReverificationQueue(businessId){
  return rpc('business_reverification_queue',{p_business_id:requireId(businessId,'Business id')});
}

export function createBusinessReverificationQr(businessId,locationId){
  return rpc('business_create_reverification_qr',{
    p_business_id:requireId(businessId,'Business id'),
    p_location_id:requireId(locationId,'Location id'),
  });
}
