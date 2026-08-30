import { getSupabase } from '../lib/supabase.js';
import { getLocations } from './locations.js';

const DEFAULT_ROUTER='https://router.project-osrm.org';
const GEOCODERS=[
  {url:q=>`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`,parse:p=>p?.features?.[0]?.geometry?.coordinates},
  {url:q=>`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,parse:p=>p?.[0]?[Number(p[0].lon),Number(p[0].lat)]:null},
];
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]);
const direct=value=>{const m=String(value||'').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);return m?[+m[2],+m[1]]:null;};

async function geocode(value){
  const point=direct(value); if(valid(point)) return point;
  const query=String(value||'').trim(); if(!query) throw new Error('Choose a starting location.');
  for(const provider of GEOCODERS){try{const response=await fetch(provider.url(query),{headers:{Accept:'application/json'}});if(!response.ok)continue;const next=provider.parse(await response.json());if(valid(next))return [+next[0],+next[1]];}catch{}}
  throw new Error(`Unable to locate “${query}”. Try a fuller address, city/state, or ZIP code.`);
}

export async function buildRoute({origin,stopLocationIds}){
  const ids=[...new Set((stopLocationIds||[]).filter(Boolean).map(String))];
  if(!ids.length) throw new Error('Add at least one stop before building the route.');
  const [start,locations]=await Promise.all([geocode(origin),getLocations(ids)]);
  const byId=new Map(locations.map(row=>[String(row.id),row]));
  const ordered=ids.map(id=>byId.get(id));
  if(ordered.some(row=>!row)) throw new Error('One or more route stops are no longer available.');
  const stopPoints=ordered.map(row=>[Number(row.longitude),Number(row.latitude)]);
  if(stopPoints.some(point=>!valid(point))) throw new Error('One or more stops do not have valid coordinates.');
  const points=[start,...stopPoints];
  const provider=String(import.meta.env.VITE_ROUTING_PROVIDER_URL||DEFAULT_ROUTER).replace(/\/$/,'');
  const response=await fetch(`${provider}/route/v1/driving/${points.map(([lon,lat])=>`${lon},${lat}`).join(';')}?overview=full&geometries=geojson&steps=true`,{headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error('Routing provider could not build this route.');
  const payload=await response.json(); const route=payload?.routes?.[0];
  if(!route) throw new Error('No drivable route was found through those stops.');
  return {origin,originCoordinates:start,stopLocationIds:ids,stopLocations:ordered,stopCoordinates:stopPoints,destinationCoordinates:stopPoints.at(-1),geometry:route.geometry,distanceMeters:route.distance,distanceMiles:+(route.distance/1609.344).toFixed(1),durationSeconds:route.duration,durationMinutes:Math.max(1,Math.round(route.duration/60)),steps:route.legs?.flatMap(leg=>leg.steps||[])||[],provider:'osrm'};
}

export async function persistRoute(route,name='My route'){
  if(!route?.stopLocationIds?.length) throw new Error('Build a route before saving it.');
  const {data,error}=await getSupabase().rpc('create_route_plan',{p_name:name,p_start_lat:+route.originCoordinates[1],p_start_lng:+route.originCoordinates[0],p_end_lat:+route.destinationCoordinates[1],p_end_lng:+route.destinationCoordinates[0],p_distance_miles:+route.distanceMiles,p_estimated_minutes:+route.durationMinutes,p_stop_location_ids:route.stopLocationIds});
  if(error) throw error;
  return {...route,routeId:data?.route_id||data?.id||data};
}

export function navigationUrl(route){
  if(!route?.stopCoordinates?.length) return '';
  const origin=route.originCoordinates?.slice().reverse().join(',');
  const points=route.stopCoordinates.map(([lon,lat])=>`${lat},${lon}`);
  const destination=points.at(-1); const waypoints=points.slice(0,-1).join('|');
  const params=new URLSearchParams({api:'1',origin,destination,travelmode:'driving'}); if(waypoints)params.set('waypoints',waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
