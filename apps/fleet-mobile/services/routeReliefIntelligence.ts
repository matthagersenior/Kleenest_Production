import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { currentFleetBusinessId,getFleetInventory } from './control';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export function getRouteReliefCoverage(businessId:string,routeId:string){return rpc('fleet_route_relief_coverage',{p_business_id:businessId,p_route_id:routeId});}
export function getVerifiedAccess(locationId:string){return rpc('kleenest_verified_access',{p_location_id:locationId});}
export async function getFleetRouteCoverageWorkspace(){
  const businessId=await currentFleetBusinessId();
  const inventory=await getFleetInventory(businessId);
  const routes=Array.isArray(inventory.routes)?inventory.routes:[];
  const active=routes.filter((route:any)=>!['completed','cancelled','archived'].includes(String(route.status||'').toLowerCase()));
  const selected=active[0]||routes[0]||null;
  const coverage=selected?await getRouteReliefCoverage(businessId,String(selected.id)):null;
  return{businessId,routes,selected,coverage};
}
