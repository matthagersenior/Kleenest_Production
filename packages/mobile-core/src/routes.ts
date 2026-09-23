import { getKleenestSupabaseClient } from './client';
import { getMobileLocations } from './locations';

export async function listMobileRouteStops(routeId:string){const id=String(routeId||'').trim();if(!id)return[];const{data,error}=await getKleenestSupabaseClient().from('route_stops').select('id,route_id,location_id,stop_order,arrived_at,checked_in_at,completed_at').eq('route_id',id).order('stop_order',{ascending:true});if(error)throw error;return data||[];}
export async function arriveMobileRouteStop(routeId:string,routeStopId:string,checkInId:string){const{data,error}=await getKleenestSupabaseClient().rpc('arrive_route_stop',{p_route_id:routeId,p_route_stop_id:routeStopId,p_check_in_id:checkInId});if(error)throw error;return data;}
export async function buildMobileRoute(originCoordinates:[number,number],stopLocationIds:string[]){const ids=[...new Set(stopLocationIds.filter(Boolean).map(String))];if(!ids.length)throw new Error('Add at least one stop before building the route.');const locations=await getMobileLocations(ids);const byId=new Map(locations.map((row:any)=>[String(row.id),row]));const ordered=ids.map(id=>byId.get(id));if(ordered.some(row=>!row))throw new Error('One or more route stops are unavailable.');const stopCoordinates=ordered.map((row:any)=>[Number(row.longitude),Number(row.latitude)]as[number,number]);if(stopCoordinates.some(([lng,lat])=>!Number.isFinite(lng)||!Number.isFinite(lat)))throw new Error('One or more stops do not have valid coordinates.');const points=[originCoordinates,...stopCoordinates];const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map(([lng,lat])=>`${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=true`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Routing provider could not build this route.');const payload=await response.json();const route=payload?.routes?.[0];if(!route)throw new Error('No drivable route was found through those stops.');return{originCoordinates,stopLocationIds:ids,stopLocations:ordered,stopCoordinates,destinationCoordinates:stopCoordinates.at(-1),geometry:route.geometry,distanceMiles:+(route.distance/1609.344).toFixed(1),durationMinutes:Math.max(1,Math.round(route.duration/60)),provider:'osrm'};}
export async function buildMobileRouteToDestination(originCoordinates:[number,number],destinationCoordinates:[number,number],destinationLabel='Destination'){
  const [originLng,originLat]=originCoordinates.map(Number) as [number,number];
  const [destinationLng,destinationLat]=destinationCoordinates.map(Number) as [number,number];
  if(!Number.isFinite(originLng)||!Number.isFinite(originLat)||!Number.isFinite(destinationLng)||!Number.isFinite(destinationLat))throw new Error('Route coordinates are invalid.');
  if(originLat < -90||originLat > 90||destinationLat < -90||destinationLat > 90||originLng < -180||originLng > 180||destinationLng < -180||destinationLng > 180)throw new Error('Route coordinates are outside the supported range.');
  const points:[[number,number],[number,number]]=[[originLng,originLat],[destinationLng,destinationLat]];
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map(([lng,lat])=>`${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=true`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Routing provider could not build a route to that destination.');
  const payload=await response.json();
  const route=payload?.routes?.[0];
  if(!route)throw new Error('No drivable route was found to that destination.');
  return{originCoordinates:[originLng,originLat] as [number,number],stopLocationIds:[],stopLocations:[],stopCoordinates:[],destinationCoordinates:[destinationLng,destinationLat] as [number,number],destinationLabel:String(destinationLabel||'Destination'),geometry:route.geometry,distanceMiles:+(route.distance/1609.344).toFixed(1),durationMinutes:Math.max(1,Math.round(route.duration/60)),provider:'osrm',directDestination:true};
}

export async function persistMobileRoute(route:any,name='My route'){const{data,error}=await getKleenestSupabaseClient().rpc('create_route_plan',{p_name:name,p_start_lat:+route.originCoordinates[1],p_start_lng:+route.originCoordinates[0],p_end_lat:+route.destinationCoordinates[1],p_end_lng:+route.destinationCoordinates[0],p_distance_miles:+route.distanceMiles,p_estimated_minutes:+route.durationMinutes,p_stop_location_ids:route.stopLocationIds});if(error)throw error;return{...route,routeId:data?.route_id||data?.id||data};}
export function mobileNavigationUrl(route:any){
  if(!route?.originCoordinates)return'';
  const origin=`${route.originCoordinates[1]},${route.originCoordinates[0]}`;
  const stopPoints=(Array.isArray(route?.stopCoordinates)?route.stopCoordinates:[]).map(([lng,lat]:[number,number])=>`${lat},${lng}`);
  const explicitDestination=Array.isArray(route?.destinationCoordinates)&&route.destinationCoordinates.length===2
    ?`${route.destinationCoordinates[1]},${route.destinationCoordinates[0]}`
    :'';
  const destination=explicitDestination||stopPoints.at(-1)||'';
  if(!destination)return'';
  const waypointPoints=explicitDestination&&stopPoints.at(-1)===explicitDestination?stopPoints.slice(0,-1):stopPoints;
  const params=new URLSearchParams({api:'1',origin,destination,travelmode:'driving'});
  if(waypointPoints.length)params.set('waypoints',waypointPoints.join('|'));
  return`https://www.google.com/maps/dir/?${params.toString()}`;
}
