import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
export async function listSingleUseAccessOffers(){const{data,error}=await client().rpc('get_single_use_access_offers');if(error)throw error;return Array.isArray(data)?data:[];}
export async function listSingleUseAccessPurchases(){const{data,error}=await client().rpc('list_single_use_access_purchases');if(error)throw error;return Array.isArray(data)?data:[];}
export async function claimSingleUseAccess(offerId:string){const{data,error}=await client().rpc('purchase_single_use_access',{p_offer_id:offerId});if(error)throw error;return data;}
export async function redeemSingleUseAccess(purchaseId:string){const{data,error}=await client().rpc('redeem_single_use_access',{p_purchase_id:purchaseId});if(error)throw error;return data;}
export async function preferredEligibility(locationId:string){const{data,error}=await client().rpc('can_activate_preferred_location',{p_location_id:locationId});if(error)throw error;const row=Array.isArray(data)?data[0]:data;return row||{eligible:false,reason:'unavailable'};}
export async function activatePreferredLocation(locationId:string){const{data,error}=await client().rpc('activate_preferred_location',{p_location_id:locationId});if(error)throw error;return data;}
export async function deactivatePreferredLocation(locationId:string){const{data,error}=await client().rpc('deactivate_preferred_location',{p_location_id:locationId});if(error)throw error;return data;}
export async function recordPreferredLocationUse(locationId:string){const{data,error}=await client().rpc('record_preferred_location_use',{p_location_id:locationId});if(error)throw error;return data;}
export async function listMyPreferredActivations(){const{data,error}=await client().from('preferred_location_activations').select('id,location_id,partner_program_id,activated_at,last_used_at,use_count,deactivated_at').is('deactivated_at',null).order('activated_at',{ascending:false});if(error)throw error;return data||[];}
