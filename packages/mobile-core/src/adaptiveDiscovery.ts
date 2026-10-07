import { getKleenestSupabaseClient } from './index';

export type AmenityMatchRule='all'|'any';
export const MILE_METERS=1609.344;
export const NEARBY_RADIUS_METERS=[1609,3219,8047,16093,40234,80467] as const;
export const ADAPTIVE_RADIUS_METERS=[1609,3219,8047,16093,40234,80467,160934,402336] as const;
export const DENSE_LOCAL_RESULT_COUNT=12;
export const MODERATE_LOCAL_RESULT_COUNT=25;
export const MAX_NEARBY_RADIUS_METERS=402336;
export const LIVE_DISCOVERY_RADIUS_METERS=40234;
const liveDiscoveryRequests=new Map<string,Promise<any>>();
const overtureHydrationRequests=new Map<string,number>();

export async function queueOvertureHydration(input:{latitude:number;longitude:number;radiusMeters:number}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  boundedCoordinate(latitude,longitude);
  const radiusMeters=Math.min(40234,Math.max(1609,boundedRadius(input.radiusMeters)));
  const key=[latitude.toFixed(2),longitude.toFixed(2),radiusMeters].join(':');
  const last=overtureHydrationRequests.get(key)||0;
  if(Date.now()-last<5*60_000)return null;
  overtureHydrationRequests.set(key,Date.now());
  const {data,error}=await getKleenestSupabaseClient().rpc('enqueue_place_discovery_hydration',{
    p_latitude:latitude,
    p_longitude:longitude,
    p_radius_meters:radiusMeters,
  });
  if(error){
    overtureHydrationRequests.delete(key);
    throw error;
  }
  return data||null;
}

export async function harvestNearbyMapCandidates(input:{latitude:number;longitude:number;radiusMeters:number;amenityNames?:string[]}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  boundedCoordinate(latitude,longitude);
  const radiusMeters=Math.min(boundedRadius(input.radiusMeters),LIVE_DISCOVERY_RADIUS_METERS);
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const key=[latitude.toFixed(3),longitude.toFixed(3),radiusMeters,[...amenityNames].sort().join(',')].join(':');
  const existing=liveDiscoveryRequests.get(key);
  if(existing)return existing;
  const request=(async()=>{
    const {data,error}=await getKleenestSupabaseClient().functions.invoke('ingest-map-candidates-v3',{
      body:{latitude,longitude,radius_km:radiusMeters/1000,amenity_names:amenityNames,collect:true},
    });
    if(error)throw error;
    return data||null;
  })().finally(()=>{setTimeout(()=>liveDiscoveryRequests.delete(key),60_000)});
  liveDiscoveryRequests.set(key,request);
  return request;
}
export type AdaptiveNearbyResult={
  rows:any[];
  requestedRadiusMeters:number;
  effectiveRadiusMeters:number;
  maxRadiusMeters:number;
  expanded:boolean;
  attemptedRadiiMeters:number[];
  densityClass:'dense'|'moderate'|'sparse';
  resultCount:number;
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
function boundedCoordinate(latitude:number,longitude:number){
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90)throw new Error('Latitude is outside the supported range.');
  if(!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error('Longitude is outside the supported range.');
}
function rowId(row:any){return String(row?.location_id||row?.place_id||row?.id||'')}
function distanceOf(row:any){const distance=Number(row?.distance_meters);return Number.isFinite(distance)?distance:Number.POSITIVE_INFINITY}
function knownRestroomNegative(row:any){
  const tags=row?.osm_tags&&typeof row.osm_tags==='object'?row.osm_tags:{};
  const toilets=String(tags?.toilets||'').trim().toLowerCase();
  const access=String(tags?.['toilets:access']||tags?.access||'').trim().toLowerCase();
  return toilets==='no'||toilets==='none'||access==='private'||access==='no';
}
function evidenceRow(row:any){return {...row,restroom_candidate_status:'restroom_evidence',needs_restroom_verification:false}}
function candidateRow(row:any){return {...row,restroom_candidate_status:'needs_verification',needs_restroom_verification:true}}
function normalizedPlaceName(value:any){return String(value||'').normalize('NFKD').replace(/[\u2018\u2019'`]/g,'').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim()}
function placeDiscoveryKeys(row:any){
  const keys:string[]=[];
  const external=String(row?.source_external_id||row?.source_id||'').trim();
  if(external)keys.push('external:'+external);
  const latitude=Number(row?.latitude),longitude=Number(row?.longitude);
  const name=normalizedPlaceName(row?.name||row?.brand||row?.brand_name);
  if(name&&Number.isFinite(latitude)&&Number.isFinite(longitude))keys.push(`geo:${name}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`);
  return keys;
}
function discoveryDistanceMeters(latitude:number,longitude:number,row:any){
  const rowLatitude=Number(row?.latitude),rowLongitude=Number(row?.longitude);
  if(!Number.isFinite(rowLatitude)||!Number.isFinite(rowLongitude))return Number.POSITIVE_INFINITY;
  const toRadians=(value:number)=>value*Math.PI/180;
  const dLat=toRadians(rowLatitude-latitude),dLng=toRadians(rowLongitude-longitude);
  const a=Math.sin(dLat/2)**2+Math.cos(toRadians(latitude))*Math.cos(toRadians(rowLatitude))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function normalizedPlaceAddress(row:any){
  return normalizedPlaceName([row?.address,row?.city,row?.state,row?.postal_code].filter(Boolean).join(' '));
}
function genericPlaceIdentity(value:string){
  return ['public restroom','restroom','bathroom','toilet','toilets','unnamed service','service','store','shop','restaurant','cafe','parking','gas station','fuel','pharmacy','hotel','motel'].includes(value);
}
function primaryPlaceIdentity(row:any){
  const name=normalizedPlaceName(row?.name);
  const brand=normalizedPlaceName(row?.brand||row?.brand_name);
  if(name&&!genericPlaceIdentity(name)){
    // Cross-source chain feeds commonly append a store/unit number to the same physical brand.
    if(brand&&!genericPlaceIdentity(brand)&&name.startsWith(brand+' ')){
      const suffix=name.slice(brand.length).trim();
      if(/^(?:(?:store|location|shop|station|unit|no|number)\s*)?\d+[a-z0-9-]*$/.test(suffix))return brand;
    }
    return name;
  }
  const fallback=normalizedPlaceName(row?.business_name||row?.brand||row?.brand_name||row?.operator_name);
  return fallback&&!genericPlaceIdentity(fallback)?fallback:'';
}
function isUsefulPlaceValue(value:any){
  if(value==null||value==='')return false;
  if(Array.isArray(value))return value.length>0;
  if(typeof value==='object')return Object.keys(value).length>0;
  return true;
}
function placeRowPriority(row:any){
  let score=row?.canonical_pending===true?0:100;
  if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(rowId(row)))score+=40;
  if(row?.kleenest_business||row?.business_tier)score+=25;
  if(row?.is_verified||row?.network?.network_verified)score+=20;
  if(String(row?.address||'').trim())score+=4;
  if(String(row?.brand||row?.brand_name||'').trim())score+=3;
  return score;
}
function placeSourceLabels(row:any){
  const values=[
    ...(Array.isArray(row?.discovery_sources)?row.discovery_sources:[]),
    row?.source_dataset,
    row?.source,
  ].map((value:any)=>String(value||'').trim()).filter(Boolean);
  return [...new Set(values)];
}
function mergeDuplicatePlaceRows(left:any,right:any){
  const leftWins=placeRowPriority(left)>=placeRowPriority(right);
  const primary=leftWins?left:right;
  const secondary=leftWins?right:left;
  const merged={...primary};
  for(const [key,value] of Object.entries(secondary||{})){
    if(!isUsefulPlaceValue((merged as any)[key])&&isUsefulPlaceValue(value))(merged as any)[key]=value;
  }
  const sources=[...new Set([...placeSourceLabels(left),...placeSourceLabels(right)])];
  if(sources.length)(merged as any).discovery_sources=sources;
  return merged;
}
function samePhysicalPlace(left:any,right:any){
  const leftId=rowId(left),rightId=rowId(right);
  if(leftId&&rightId&&leftId===rightId)return true;
  const leftExternal=String(left?.source_external_id||left?.source_id||'').trim();
  const rightExternal=String(right?.source_external_id||right?.source_id||'').trim();
  if(leftExternal&&rightExternal&&leftExternal===rightExternal)return true;
  const leftIdentity=primaryPlaceIdentity(left),rightIdentity=primaryPlaceIdentity(right);
  if(!leftIdentity||leftIdentity!==rightIdentity)return false;
  if(!Number.isFinite(Number(left?.latitude))||!Number.isFinite(Number(left?.longitude))||!Number.isFinite(Number(right?.latitude))||!Number.isFinite(Number(right?.longitude)))return false;
  const meters=discoveryDistanceMeters(Number(left.latitude),Number(left.longitude),right);
  const leftAddress=normalizedPlaceAddress(left),rightAddress=normalizedPlaceAddress(right);
  const sameAddress=Boolean(leftAddress&&rightAddress&&leftAddress===rightAddress);
  const leftSource=normalizedPlaceName(left?.source||left?.source_dataset);
  const rightSource=normalizedPlaceName(right?.source||right?.source_dataset);
  const sameSource=Boolean(leftSource&&rightSource&&leftSource===rightSource);
  const thresholdMeters=sameAddress?180:sameSource?120:85;
  return meters<=thresholdMeters;
}
export function dedupePhysicalPlaceRows(rows:any[],limit=2000){
  const max=Math.max(1,Math.min(2000,Math.round(limit||2000)));
  const selected:any[]=[];
  const exactIndex=new Map<string,number>();
  const identityIndex=new Map<string,number[]>();
  const register=(index:number,row:any)=>{
    const id=rowId(row);
    if(id)exactIndex.set('id:'+id,index);
    const external=String(row?.source_external_id||row?.source_id||'').trim();
    if(external)exactIndex.set('external:'+external,index);
    const identity=primaryPlaceIdentity(row);
    if(identity){
      const indexes=identityIndex.get(identity)||[];
      if(!indexes.includes(index))indexes.push(index);
      identityIndex.set(identity,indexes);
    }
  };
  for(const row of rows||[]){
    if(!row)continue;
    let duplicateIndex=-1;
    const id=rowId(row);
    if(id&&exactIndex.has('id:'+id))duplicateIndex=exactIndex.get('id:'+id)!;
    const external=String(row?.source_external_id||row?.source_id||'').trim();
    if(duplicateIndex<0&&external&&exactIndex.has('external:'+external))duplicateIndex=exactIndex.get('external:'+external)!;
    const identity=primaryPlaceIdentity(row);
    if(duplicateIndex<0&&identity){
      for(const index of identityIndex.get(identity)||[]){
        if(samePhysicalPlace(selected[index],row)){duplicateIndex=index;break;}
      }
    }
    if(duplicateIndex>=0){
      selected[duplicateIndex]=mergeDuplicatePlaceRows(selected[duplicateIndex],row);
      register(duplicateIndex,selected[duplicateIndex]);
    }else{
      const index=selected.push({...row})-1;
      register(index,selected[index]);
    }
  }
  return selected.sort((a,b)=>distanceOf(a)-distanceOf(b)).slice(0,max);
}

export function mergeDiscoveredPlaceRows(canonicalRows:any[],liveRows:any[],limit=2000,origin?:{latitude:number;longitude:number}){
  const max=Math.max(1,Math.min(2000,Math.round(limit||2000)));
  const selected:any[]=[];
  const seen=new Set<string>();
  for(const row of canonicalRows||[]){
    selected.push({...row,canonical_pending:false});
    for(const key of placeDiscoveryKeys(row))seen.add(key);
  }
  for(const row of liveRows||[]){
    const keys=placeDiscoveryKeys(row);
    if(keys.some(key=>seen.has(key)))continue;
    const existingDistance=Number(row?.distance_meters);
    const distanceMeters=Number.isFinite(existingDistance)?existingDistance:(origin?discoveryDistanceMeters(origin.latitude,origin.longitude,row):Number.POSITIVE_INFINITY);
    const pending={...row,distance_meters:distanceMeters,canonical_pending:true,discovery_state:'discovered_unverified'};
    selected.push(pending);
    for(const key of keys)seen.add(key);
  }
  return dedupePhysicalPlaceRows(selected,max);
}

export function mergeNearbyDiscoveryRows(restroomRows:any[],candidateRows:any[],limit=500){
  const max=Math.max(1,Math.min(500,Math.round(limit||500)));
  const evidenceById=new Map<string,any>();
  for(const row of restroomRows||[]){const id=rowId(row);if(id)evidenceById.set(id,evidenceRow(row));}
  const candidatesById=new Map<string,any>();
  for(const row of candidateRows||[]){
    const id=rowId(row);
    if(!id||knownRestroomNegative(row))continue;
    if(evidenceById.has(id)){
      evidenceById.set(id,{...candidateRow(row),...evidenceById.get(id)});
      continue;
    }
    candidatesById.set(id,candidateRow(row));
  }
  const evidence=[...evidenceById.values()].sort((a,b)=>distanceOf(a)-distanceOf(b));
  const candidates=[...candidatesById.values()].sort((a,b)=>distanceOf(a)-distanceOf(b));
  // Nearby Explore is both a bathroom finder and a consumer-verification surface.
  // Keep all available local candidates up to the backend-supported 500-row window;
  // evidence rows are deduplicated and remain first-class rather than replacing businesses.
  const selected=[...evidence,...candidates]
    .sort((a,b)=>distanceOf(a)-distanceOf(b))
    .slice(0,max);
  return dedupePhysicalPlaceRows(selected,max);
}

export async function listNearbyRestroomsV3(input:{latitude:number;longitude:number;radiusMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;limit?:number}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  boundedCoordinate(latitude,longitude);
  const radiusMeters=boundedRadius(input.radiusMeters);
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const amenityMatch=validMatchRule(input.amenityMatch||'any');
  const limit=Math.max(1,Math.min(500,Math.round(input.limit||100)));
  const {data,error}=await getKleenestSupabaseClient().rpc('map_network_nearby_v3',{
    p_lat:latitude,p_lng:longitude,p_radius_m:radiusMeters,p_limit:limit,p_category:'restroom',p_search:boundedSearch(input.search||'')||null,p_amenity_names:amenityNames,p_amenity_match:amenityMatch,
  });
  if(error)throw error;
  return dedupePhysicalPlaceRows(Array.isArray(data)?data:[],limit);
}

export async function listNearbyMapCandidates(input:{latitude:number;longitude:number;radiusMeters:number;search?:string;limit?:number}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  boundedCoordinate(latitude,longitude);
  const radiusMeters=boundedRadius(input.radiusMeters);
  const limit=Math.max(1,Math.min(2000,Math.round(input.limit||2000)));
  const client=getKleenestSupabaseClient();
  let {data,error}=await client.rpc('map_network_nearby_all_v1',{
    p_lat:latitude,p_lng:longitude,p_radius_m:radiusMeters,p_limit:limit,p_search:boundedSearch(input.search||'')||null,
  });
  if(error&&/map_network_nearby_all_v1|PGRST202/i.test(String((error as any)?.message||(error as any)?.code||''))){
    ({data,error}=await client.rpc('map_network_nearby_v2',{
      p_lat:latitude,p_lng:longitude,p_radius_m:radiusMeters,p_limit:Math.min(limit,500),p_category:'all',p_search:boundedSearch(input.search||'')||null,p_amenity_names:null,
    }));
  }
  if(error)throw error;
  return dedupePhysicalPlaceRows(Array.isArray(data)?data:[],limit);
}

export async function findAdaptiveNearbyRestrooms(input:{latitude:number;longitude:number;requestedRadiusMeters:number;maxRadiusMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;autoExpand?:boolean;hardRadius?:boolean;limit?:number}):Promise<AdaptiveNearbyResult>{
  const requestedRadiusMeters=boundedRadius(input.requestedRadiusMeters);
  const maxRadiusMeters=Math.max(requestedRadiusMeters,boundedRadius(input.maxRadiusMeters));
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const amenityMatch=validMatchRule(input.amenityMatch||'any');
  const limit=Math.max(1,Math.min(500,Math.round(input.limit||500)));
  const hardRadius=input.hardRadius===true;
  const radii=[requestedRadiusMeters];
  if(!hardRadius&&input.autoExpand!==false){
    for(const radius of ADAPTIVE_RADIUS_METERS)if(radius>requestedRadiusMeters&&radius<=maxRadiusMeters)radii.push(radius);
    if(radii[radii.length-1]!==maxRadiusMeters)radii.push(maxRadiusMeters);
  }
  const attemptedRadiiMeters:number[]=[];
  let rows:any[]=[];
  let effectiveRadiusMeters=requestedRadiusMeters;
  let densityClass:'dense'|'moderate'|'sparse'='sparse';
  for(const radiusMeters of [...new Set(radii)]){
    attemptedRadiiMeters.push(radiusMeters);
    effectiveRadiusMeters=radiusMeters;
    const loadCanonical=async()=>{
      const verifiedPromise=listNearbyRestroomsV3({latitude:input.latitude,longitude:input.longitude,radiusMeters,search:input.search,amenityNames,amenityMatch,limit});
      if(amenityNames.length){
        const [restroomRows,candidateRows]=await Promise.all([
          verifiedPromise,
          listNearbyMapCandidates({latitude:input.latitude,longitude:input.longitude,radiusMeters,search:input.search,limit}),
        ]);
        const metadataById=new Map(candidateRows.map((row:any)=>[rowId(row),row]));
        return restroomRows.map((row:any)=>evidenceRow({...metadataById.get(rowId(row)),...row}));
      }
      const [restroomRows,candidateRows]=await Promise.all([
        verifiedPromise,
        listNearbyMapCandidates({latitude:input.latitude,longitude:input.longitude,radiusMeters,search:input.search,limit}),
      ]);
      return mergeNearbyDiscoveryRows(restroomRows,candidateRows,limit);
    };
    rows=await loadCanonical();

    const locallyEnough=(radiusMeters<=1609&&rows.length>=DENSE_LOCAL_RESULT_COUNT)
      ||(radiusMeters<=3219&&rows.length>=MODERATE_LOCAL_RESULT_COUNT)
      ||(radiusMeters>=8047&&rows.length>0);
    // OSM/Overpass is a supplement, not the primary discovery path. Only
    // harvest when canonical coverage is thin, and never block map/results.
    if(!locallyEnough&&radiusMeters<=LIVE_DISCOVERY_RADIUS_METERS){
      void harvestNearbyMapCandidates({
        latitude:input.latitude,
        longitude:input.longitude,
        radiusMeters,
        amenityNames,
      }).catch(()=>{});
    }

    // Count controls how far discovery widens, never how many local results survive.
    // Dense neighborhoods stay tight and keep the complete local set.
    if(radiusMeters<=1609&&rows.length>=DENSE_LOCAL_RESULT_COUNT){
      densityClass='dense';
      break;
    }
    if(radiusMeters<=3219&&rows.length>=MODERATE_LOCAL_RESULT_COUNT){
      densityClass='moderate';
      break;
    }

    // Once we reach a normal local radius, any usable default result set is
    // preferable to an unnecessary metro-wide expansion. If there are zero
    // results, keep widening until something useful appears or max is reached.
    if(radiusMeters>=8047&&rows.length>0){
      densityClass='sparse';
      break;
    }
  }
  return {
    rows,
    requestedRadiusMeters,
    effectiveRadiusMeters,
    maxRadiusMeters,
    expanded:effectiveRadiusMeters>requestedRadiusMeters,
    attemptedRadiiMeters,
    densityClass,
    resultCount:rows.length,
  };
}


export async function findAdaptiveNearbyPlaces(input:{latitude:number;longitude:number;requestedRadiusMeters:number;maxRadiusMeters:number;search?:string;autoExpand?:boolean;hardRadius?:boolean;limit?:number}):Promise<AdaptiveNearbyResult>{
  const requestedRadiusMeters=boundedRadius(input.requestedRadiusMeters);
  const maxRadiusMeters=Math.max(requestedRadiusMeters,boundedRadius(input.maxRadiusMeters));
  const limit=Math.max(1,Math.min(2000,Math.round(input.limit||2000)));
  const hardRadius=input.hardRadius===true;
  const radii=[requestedRadiusMeters];
  if(!hardRadius&&input.autoExpand!==false){
    for(const radius of ADAPTIVE_RADIUS_METERS)if(radius>requestedRadiusMeters&&radius<=maxRadiusMeters)radii.push(radius);
    if(radii[radii.length-1]!==maxRadiusMeters)radii.push(maxRadiusMeters);
  }
  const attemptedRadiiMeters:number[]=[];
  let rows:any[]=[];
  let effectiveRadiusMeters=requestedRadiusMeters;
  let densityClass:'dense'|'moderate'|'sparse'='sparse';
  for(const radiusMeters of [...new Set(radii)]){
    attemptedRadiiMeters.push(radiusMeters);
    effectiveRadiusMeters=radiusMeters;
    // Canonical discovery is the interactive path; supplemental OSM must not block results.
    const loadCanonical=()=>listNearbyMapCandidates({
      latitude:input.latitude,
      longitude:input.longitude,
      radiusMeters,
      search:input.search,
      limit,
    });
    rows=await loadCanonical();

    const locallyEnough=(radiusMeters<=1609&&rows.length>=DENSE_LOCAL_RESULT_COUNT)
      ||(radiusMeters<=3219&&rows.length>=MODERATE_LOCAL_RESULT_COUNT)
      ||(radiusMeters>=8047&&rows.length>0);
    // Canonical data and queued Overture hydration are primary. OSM/Overpass
    // is only a non-blocking supplement when local canonical coverage is thin.
    if(!locallyEnough&&radiusMeters<=LIVE_DISCOVERY_RADIUS_METERS){
      void harvestNearbyMapCandidates({
        latitude:input.latitude,
        longitude:input.longitude,
        radiusMeters,
        amenityNames:[],
      }).catch(()=>{});
    }

    if(radiusMeters<=1609&&rows.length>=DENSE_LOCAL_RESULT_COUNT){
      densityClass='dense';
      break;
    }
    if(radiusMeters<=3219&&rows.length>=MODERATE_LOCAL_RESULT_COUNT){
      densityClass='moderate';
      break;
    }
    if(radiusMeters>=8047&&rows.length>0){
      densityClass='sparse';
      break;
    }
  }
  void queueOvertureHydration({latitude:input.latitude,longitude:input.longitude,radiusMeters:effectiveRadiusMeters}).catch(()=>{});
  return {
    rows,
    requestedRadiusMeters,
    effectiveRadiusMeters,
    maxRadiusMeters,
    expanded:effectiveRadiusMeters>requestedRadiusMeters,
    attemptedRadiiMeters,
    densityClass,
    resultCount:rows.length,
  };
}

export async function refreshNearbyPlaceInventory(input:{latitude:number;longitude:number;radiusMeters:number;search?:string;limit?:number}){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  boundedCoordinate(latitude,longitude);
  const radiusMeters=boundedRadius(input.radiusMeters);
  const limit=Math.max(1,Math.min(2000,Math.round(input.limit||2000)));
  const liveRadiusMeters=Math.min(radiusMeters,LIVE_DISCOVERY_RADIUS_METERS);
  void queueOvertureHydration({latitude,longitude,radiusMeters}).catch(()=>{});
  const [canonicalRows,harvest]=await Promise.all([
    listNearbyMapCandidates({latitude,longitude,radiusMeters,search:input.search,limit}),
    harvestNearbyMapCandidates({latitude,longitude,radiusMeters:liveRadiusMeters,amenityNames:[]}).catch(()=>null),
  ]);
  return mergeDiscoveredPlaceRows(
    canonicalRows,
    Array.isArray(harvest?.locations)?harvest.locations:[],
    limit,
    {latitude,longitude},
  );
}

export type RouteDiscoveryCategory='restroom'|'all';

export async function listPlacesAlongRoute(input:{routeGeoJSON:any;corridorMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;category?:RouteDiscoveryCategory;limit?:number}){
  const geometry=input.routeGeoJSON;
  if(!geometry||geometry.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>5000)throw new Error('Build a valid route before searching along it.');
  const corridorMeters=Math.round(Number(input.corridorMeters));
  if(!Number.isFinite(corridorMeters)||corridorMeters<100||corridorMeters>40234)throw new Error('Route corridor is outside the supported range.');
  const amenityNames=normalizedAmenities(input.amenityNames||[]);
  const amenityMatch=validMatchRule(input.amenityMatch||'any');
  const category:RouteDiscoveryCategory=input.category==='restroom'?'restroom':'all';
  const limit=Math.max(1,Math.min(250,Math.round(input.limit||200)));
  const client=getKleenestSupabaseClient();
  const params={
    p_route_geojson:geometry,
    p_corridor_m:corridorMeters,
    p_limit:limit,
    p_category:category,
    p_search:boundedSearch(input.search||'')||null,
    p_amenity_names:amenityNames,
    p_amenity_match:amenityMatch,
  };
  let {data,error}=await client.rpc('map_network_along_route_v1',params);
  // Compatibility while the widened route projection migration is rolling out:
  // older deployments cap this RPC at 50 rows.
  if(error&&limit>50&&/limit|50/i.test(String((error as any)?.message||(error as any)?.details||''))){
    ({data,error}=await client.rpc('map_network_along_route_v1',{...params,p_limit:50}));
  }
  if(error)throw error;
  return dedupePhysicalPlaceRows(Array.isArray(data)?data:[],limit);
}

export async function listRestroomsAlongRoute(input:{routeGeoJSON:any;corridorMeters:number;search?:string;amenityNames?:string[];amenityMatch?:AmenityMatchRule;limit?:number}){
  return listPlacesAlongRoute({...input,category:'restroom'});
}
