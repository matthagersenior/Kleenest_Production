import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
let singleton: SupabaseClient | null = null;
export function getKleenestSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  singleton = createClient(url, key, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
  return singleton;
}
export async function listNearbyRestrooms(latitude: number, longitude: number, radiusMeters = 8047, search = '') {
  const { data, error } = await getKleenestSupabaseClient().rpc('map_network_nearby_v1', { p_lat: latitude, p_lng: longitude, p_radius_m: radiusMeters, p_limit: 100, p_category: null, p_search: search.trim() || null, p_amenity_names: null });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
export async function getMobileAccountSummary() {
  const { data, error } = await getKleenestSupabaseClient().rpc('user_subscription_summary');
  if (error) throw error;
  return data || {};
}
export async function getMobileLocations(ids: string[]) {
  const unique=[...new Set(ids.filter(Boolean).map(String))];
  if(!unique.length)return [];
  const {data,error}=await getKleenestSupabaseClient().from('locations').select('id,name,address,city,state,postal_code,latitude,longitude,rating,review_count,cleanliness_pct,accessible,changing_table,verification_status').in('id',unique);
  if(error)throw error;
  return data||[];
}
export async function getMobileLocation(id:string){const rows=await getMobileLocations([id]);return rows[0]||null;}
export async function listMobileLocationReviews(locationId:string,limit=30){const {data,error}=await getKleenestSupabaseClient().from('reviews').select('id,location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status,business_reply,business_replied_at,created_at').eq('location_id',locationId).eq('status','published').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data||[];}
export async function toggleMobileFavorite(locationId:string){const {data,error}=await getKleenestSupabaseClient().rpc('kleenest_toggle_favorite',{p_location_id:locationId});if(error)throw error;return data;}
export async function mobileCheckIn(locationId:string,latitude:number,longitude:number){const {data,error}=await getKleenestSupabaseClient().rpc('kleenest_map_check_in',{p_location_id:locationId,p_lat:latitude,p_lng:longitude});if(error)throw error;return data;}
export async function createMobileReview(input:{locationId:string;checkInId?:string|null;stars:number;cleanlinessPct?:number|null;comment?:string}){const {data,error}=await getKleenestSupabaseClient().rpc('create_review',{p_location_id:input.locationId,p_check_in_id:input.checkInId||null,p_stars:Number(input.stars),p_cleanliness_pct:input.cleanlinessPct==null?null:Number(input.cleanlinessPct),p_comment:input.comment?.trim()||null});if(error)throw error;return data;}
export async function buildMobileRoute(originCoordinates:[number,number], stopLocationIds:string[]) {
  const ids=[...new Set(stopLocationIds.filter(Boolean).map(String))];
  if(!ids.length)throw new Error('Add at least one stop before building the route.');
  const locations=await getMobileLocations(ids);const byId=new Map(locations.map((row:any)=>[String(row.id),row]));const ordered=ids.map(id=>byId.get(id));
  if(ordered.some(row=>!row))throw new Error('One or more route stops are unavailable.');
  const stopCoordinates=ordered.map((row:any)=>[Number(row.longitude),Number(row.latitude)] as [number,number]);
  if(stopCoordinates.some(([lng,lat])=>!Number.isFinite(lng)||!Number.isFinite(lat)))throw new Error('One or more stops do not have valid coordinates.');
  const points=[originCoordinates,...stopCoordinates];
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map(([lng,lat])=>`${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=true`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Routing provider could not build this route.');
  const payload=await response.json();const route=payload?.routes?.[0];if(!route)throw new Error('No drivable route was found through those stops.');
  return {originCoordinates,stopLocationIds:ids,stopLocations:ordered,stopCoordinates,destinationCoordinates:stopCoordinates.at(-1),geometry:route.geometry,distanceMiles:+(route.distance/1609.344).toFixed(1),durationMinutes:Math.max(1,Math.round(route.duration/60)),provider:'osrm'};
}
export async function persistMobileRoute(route:any,name='My route') {
  const {data,error}=await getKleenestSupabaseClient().rpc('create_route_plan',{p_name:name,p_start_lat:+route.originCoordinates[1],p_start_lng:+route.originCoordinates[0],p_end_lat:+route.destinationCoordinates[1],p_end_lng:+route.destinationCoordinates[0],p_distance_miles:+route.distanceMiles,p_estimated_minutes:+route.durationMinutes,p_stop_location_ids:route.stopLocationIds});
  if(error)throw error;return {...route,routeId:data?.route_id||data?.id||data};
}
export function mobileNavigationUrl(route:any) {
  if(!route?.stopCoordinates?.length)return '';
  const origin=`${route.originCoordinates[1]},${route.originCoordinates[0]}`;const points=route.stopCoordinates.map(([lng,lat]:[number,number])=>`${lat},${lng}`);const destination=points.at(-1);const waypoints=points.slice(0,-1).join('|');
  const params=new URLSearchParams({api:'1',origin,destination,travelmode:'driving'});if(waypoints)params.set('waypoints',waypoints);return `https://www.google.com/maps/dir/?${params.toString()}`;
}
export const KLEENEST_APP_VERSION = '0.1.0';
