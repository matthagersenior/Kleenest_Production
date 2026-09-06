import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type BusinessProductAccess={business_id?:string;plan?:string|null;business_tier?:string|null;fleet_enabled?:boolean|null;enterprise_enabled?:boolean|null;location_count?:number|null;[key:string]:unknown};
export async function getBusinessProductAccess(businessId:string):Promise<BusinessProductAccess|null>{const{data,error}=await getKleenestSupabaseClient().rpc('get_business_product_access',{p_business_id:businessId});if(error)throw error;const rows=Array.isArray(data)?data:[];return(rows[0]??null) as BusinessProductAccess|null;}
export async function getBusinessServiceEntitlement(businessId:string):Promise<Record<string,unknown>|null>{const{data,error}=await getKleenestSupabaseClient().rpc('get_business_service_entitlement',{p_business_id:businessId});if(error)throw error;const value=Array.isArray(data)?data[0]:data;return value&&typeof value==='object'?value as Record<string,unknown>:null;}
