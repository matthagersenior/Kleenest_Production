import {
  getFleetRouteReliefCoverage,
  getVerifiedAccess,
  type RouteReliefCoverage,
  type VerifiedAccessProjection,
} from '@kleenest/mobile-core';
import { currentFleetBusinessId,getFleetInventory } from './control';

export const getRouteReliefCoverage=getFleetRouteReliefCoverage;
export { getVerifiedAccess };
export type { RouteReliefCoverage,VerifiedAccessProjection };

export async function getFleetRouteCoverageWorkspace(){
  const businessId=await currentFleetBusinessId();
  const inventory=await getFleetInventory(businessId);
  const routes=Array.isArray(inventory.routes)?inventory.routes:[];
  const active=routes.filter((route:any)=>!['completed','cancelled','archived'].includes(String(route.status||'').toLowerCase()));
  const selected=active[0]||routes[0]||null;
  const coverage=selected?await getFleetRouteReliefCoverage(businessId,String(selected.id)):null;
  return{businessId,routes,selected,coverage};
}
