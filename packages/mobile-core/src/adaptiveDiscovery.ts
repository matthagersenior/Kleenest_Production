import { getKleenestSupabaseClient } from './index';

export type AmenityMatchRule='all'|'any';
export const MILE_METERS=1609.344;
export const NEARBY_RADIUS_METERS=[1609,8047,16093,40234,80467] as const;
export const ADAPTIVE_RADIUS_METERS=[8047,16093,40234,80467,160934,402336] as const;
export const MAX_NEARBY_RADIUS_METERS=402336;
export type AdaptiveNearbyResult={
  rows:any[];
  requestedRadiusMeters:number;
  effectiveRadiusMeters:number;
  maxRadiusMeters:number;
  expanded:boolean;
  attemptedRadiiMeters:number[];
};

function normalizedAmenities(values:string[]){
  const names=[...new Set((values||[]).map(value=>String(value).trim()).filter(Boolean))];
  if(names.length>24)throw new Error('Choose no more than 24 amenities.');
  if(names.some(name=>name.length>80))throw new Error('An amenity name is too long.');
  return names;
}
function validMatchRule(value:AmenityMatchRule):AmenityMatchRule{
  if(value!=='all'&&value!=='any')throw new Error('Amenity matching must be all or any.');
  return value;
}
function boundedRadius(value:number){
  const radius=Math.round(Number(value));
  if(!Number.isFinite(radius)||radius<100||radius>MAX_NEARBY_RADIUS_METERS)throw new Error('Search radius is outside the supported range.');
  return radius;
}
function boundedSearch(value:string){
  const search=String(value||'').trim();
  if(new TextEncoder().encode(search).length>320)throw new Error('Search text is too long.');
  return search;
}

export async function listNearbyRestroomsV3(input:{latitude:number;longitude:number;radiusMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;limit?:number}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90)throw new Error('Latitude is outside the supported range.');
  if(!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error('Longitude is outside the supported range.');
  const radiusMeters=boundedRadius(input.radiusMeters);
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const amenityMatch=validMatchRule(input.amenityMatch||'any');
  const limit=Math.max(1,Math.min(100,Math.round(input.limit||30)));
  const {data,error}=await getKleenestSupabaseClient().rpc('map_network_nearby_v3',{
    p_lat:latitude,p_lng:longitude,p_radius_m:radiusMeters,p_limit:limit,p_category:'restroom',p_search:boundedSearch(input.search||'')||null,p_amenity_names:amenityNames,p_amenity_match:amenityMatch,
  });
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function findAdaptiveNearbyRestrooms(input:{latitude:number;longitude:number;requestedRadiusMeters:number;maxRadiusMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;autoExpand?:boolean;targetCount?:number;limit?:number}):Promise<AdaptiveNearbyResult>{
  const requestedRadiusMeters=boundedRadius(input.requestedRadiusMeters);
  const maxRadiusMeters=Math.max(requestedRadiusMeters,boundedRadius(input.maxRadiusMeters));
  const targetCount=Math.max(1,Math.min(10,Math.round(input.targetCount||3)));
  const limit=Math.max(targetCount,Math.min(50,Math.round(input.limit||30)));
  const radii=[requestedRadiusMeters];
  if(input.autoExpand!==false){
    for(const radius of ADAPTIVE_RADIUS_METERS)if(radius>requestedRadiusMeters&&radius<=maxRadiusMeters)radii.push(radius);
    if(radii[radii.length-1]!==maxRadiusMeters)radii.push(maxRadiusMeters);
  }
  const attemptedRadiiMeters:number[]=[];
  let rows:any[]=[];
  let effectiveRadiusMeters=requestedRadiusMeters;
  for(const radiusMeters of [...new Set(radii)]){
    attemptedRadiiMeters.push(radiusMeters);
    effectiveRadiusMeters=radiusMeters;
    rows=await listNearbyRestroomsV3({latitude:input.latitude,longitude:input.longitude,radiusMeters,search:input.search,amenityNames:input.amenityNames,amenityMatch:input.amenityMatch,limit});
    if(rows.length>=targetCount)break;
  }
  return {rows,requestedRadiusMeters,effectiveRadiusMeters,maxRadiusMeters,expanded:effectiveRadiusMeters>requestedRadiusMeters,attemptedRadiiMeters};
}

export async function listRestroomsAlongRoute(input:{routeGeoJSON:any;corridorMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;limit?:number}){
  const geometry=input.routeGeoJSON;
  if(!geometry||geometry.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>5000)throw new Error('Build a valid route before searching along it.');
  const corridorMeters=Math.round(Number(input.corridorMeters));
  if(!Number.isFinite(corridorMeters)||corridorMeters<100||corridorMeters>40234)throw new Error('Route corridor is outside the supported range.');
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const amenityMatch=validMatchRule(input.amenityMatch||'any');
  const limit=Math.max(1,Math.min(50,Math.round(input.limit||40)));
  const {data,error}=await getKleenestSupabaseClient().rpc('map_network_along_route_v1',{
    p_route_geojson:geometry,p_corridor_m:corridorMeters,p_limit:limit,p_category:'restroom',p_search:boundedSearch(input.search||'')||null,p_amenity_names:amenityNames,p_amenity_match:amenityMatch,
  });
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
