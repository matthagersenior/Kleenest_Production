export type RecommendationAuthorityRow=Record<string,unknown>;
export type RecommendationAuthorityCandidate={
  place:{kleenestPlaceId:string;name:string;latitude:number|null;longitude:number|null};
  score:number;
  trust:{confidence:number|null;verificationStatus:string;lastVerifiedAt:string|null;observationCount:number|null;freshnessAt:string|null};
  restroom:{publicAccess:boolean|null;wheelchairAccessible:boolean|null;changingTable:boolean|null;familyRestroom:boolean|null;open24Hours:boolean|null;smartRestroom:boolean|null;amenityNames:string[]};
  distanceMeters:number|null;
  distanceAheadMeters:number|null;
  detourMinutes:number|null;
  reasonCodes:string[];
  explanation:string;
  deepLink:string;
  source:'kleenest';
};

function finiteNumber(value:unknown):number|null{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function boolOrNull(value:unknown):boolean|null{
  if(value===true||value===false)return value;
  if(value===1||value==='1'||value==='true'||value==='yes')return true;
  if(value===0||value==='0'||value==='false'||value==='no')return false;
  return null;
}
function stringOrNull(value:unknown):string|null{const normalized=String(value??'').trim();return normalized||null;}
function clamp01(value:unknown):number|null{const parsed=finiteNumber(value);if(parsed===null)return null;return Math.max(0,Math.min(1,parsed>1?parsed/100:parsed));}
function placeId(row:RecommendationAuthorityRow){return String(row.location_id??row.place_id??row.id??'').trim();}
function verification(row:RecommendationAuthorityRow){
  if(row.needs_restroom_verification===true)return 'needs_verification';
  const raw=String(row.verification_status??row.restroom_verification_status??'').toLowerCase();
  if(raw.includes('conflict'))return 'conflicted';
  if(raw.includes('verified'))return 'verified';
  if(raw.includes('unverified'))return 'unverified';
  if(row.restroom_candidate_status==='restroom_evidence')return 'verified';
  return 'unknown';
}
function amenityNames(row:RecommendationAuthorityRow):string[]{
  const direct=row.amenity_names;
  if(Array.isArray(direct))return [...new Set(direct.map(String).map(v=>v.trim()).filter(Boolean))];
  const source=row.amenities;
  if(Array.isArray(source))return [...new Set(source.map(String).map(v=>v.trim()).filter(Boolean))];
  if(source&&typeof source==='object'){
    return Object.entries(source as Record<string,unknown>).filter(([,value])=>boolOrNull(value)===true).map(([key])=>key);
  }
  return[];
}
function attributes(row:RecommendationAuthorityRow){
  const names=amenityNames(row);
  return{
    publicAccess:boolOrNull(row.public_access??row.restroom_public_access),
    wheelchairAccessible:boolOrNull(row.wheelchair_accessible??row.accessible),
    changingTable:boolOrNull(row.changing_table),
    familyRestroom:boolOrNull(row.family_restroom),
    open24Hours:boolOrNull(row.open_24_hours??row.open24_hours),
    smartRestroom:boolOrNull(row.smart_bathroom)??(names.some(name=>/^(connected \/ smart restroom|smart restroom)$/i.test(name))?true:null),
    amenityNames:names,
  };
}
function reasons(verificationStatus:string,confidence:number|null,restroom:ReturnType<typeof attributes>,distanceMeters:number|null,detourMinutes:number|null){
  const out:string[]=[];
  if(verificationStatus==='verified')out.push('VERIFIED');
  if(verificationStatus==='needs_verification')out.push('NEEDS_VERIFICATION');
  if((confidence??0)>=.8)out.push('HIGH_CONFIDENCE');
  if(distanceMeters!==null&&distanceMeters<=8047)out.push('LOW_DISTANCE');
  if(detourMinutes!==null&&detourMinutes<=5)out.push('LOW_DETOUR');
  if(restroom.publicAccess===true)out.push('PUBLIC_ACCESS');
  if(restroom.wheelchairAccessible===true)out.push('ACCESSIBILITY_MATCH');
  if(restroom.smartRestroom===true)out.push('SMART_RESTROOM');
  return[...new Set(out)];
}
function scoreValue(verificationStatus:string,confidence:number|null,restroom:ReturnType<typeof attributes>,distanceMeters:number|null,detourMinutes:number|null){
  let value=35;
  if(verificationStatus==='verified')value+=25;
  if(verificationStatus==='needs_verification')value-=15;
  if(verificationStatus==='conflicted')value-=20;
  if(confidence!==null)value+=Math.round(confidence*20);
  if(restroom.publicAccess===true)value+=8;
  if(restroom.wheelchairAccessible===true)value+=4;
  if(restroom.smartRestroom===true)value+=3;
  if(distanceMeters!==null)value+=Math.max(0,8-Math.round(distanceMeters/3218));
  if(detourMinutes!==null)value+=Math.max(0,10-Math.round(detourMinutes));
  return Math.max(0,Math.min(100,value));
}
function explanation(reasonCodes:string[]){
  const phrases:string[]=[];
  if(reasonCodes.includes('VERIFIED'))phrases.push('verified restroom evidence');
  if(reasonCodes.includes('HIGH_CONFIDENCE'))phrases.push('high-confidence Kleenest data');
  if(reasonCodes.includes('PUBLIC_ACCESS'))phrases.push('public access');
  if(reasonCodes.includes('ACCESSIBILITY_MATCH'))phrases.push('accessibility information');
  if(reasonCodes.includes('SMART_RESTROOM'))phrases.push('connected Smart Restroom capability');
  if(reasonCodes.includes('LOW_DETOUR'))phrases.push('low route detour');
  if(reasonCodes.includes('LOW_DISTANCE'))phrases.push('close to the requested location');
  if(reasonCodes.includes('NEEDS_VERIFICATION'))phrases.push('candidate awaiting consumer verification');
  return phrases.length?phrases.join(', '):'Kleenest restroom candidate';
}

export function normalizeRecommendationAuthority(row:RecommendationAuthorityRow):RecommendationAuthorityCandidate|null{
  const id=placeId(row);if(!id)return null;
  const confidence=clamp01(row.confidence??row.confidence_score??row.trust_score);
  const verificationStatus=verification(row),restroom=attributes(row);
  const distanceMeters=finiteNumber(row.distance_meters),detourMinutes=finiteNumber(row.detour_minutes);
  const reasonCodes=reasons(verificationStatus,confidence,restroom,distanceMeters,detourMinutes);
  return{
    place:{kleenestPlaceId:id,name:String(row.name??row.place_name??row.location_name??'Kleenest place'),latitude:finiteNumber(row.latitude??row.lat),longitude:finiteNumber(row.longitude??row.lng??row.lon)},
    score:scoreValue(verificationStatus,confidence,restroom,distanceMeters,detourMinutes),
    trust:{confidence,verificationStatus,lastVerifiedAt:stringOrNull(row.last_verified_at??row.verified_at),observationCount:finiteNumber(row.observation_count??row.observations),freshnessAt:stringOrNull(row.freshness_at??row.updated_at)},
    restroom,distanceMeters,distanceAheadMeters:finiteNumber(row.distance_ahead_meters),detourMinutes,reasonCodes,
    explanation:explanation(reasonCodes),deepLink:`https://kleenest.app/place/${encodeURIComponent(id)}`,source:'kleenest',
  };
}
export function rankRecommendationAuthority(rows:RecommendationAuthorityRow[],limit=10):RecommendationAuthorityCandidate[]{
  const bounded=Math.max(1,Math.min(100,Math.round(limit||10)));
  return rows.map(normalizeRecommendationAuthority).filter((row):row is RecommendationAuthorityCandidate=>Boolean(row)).sort((a,b)=>
    b.score-a.score||
    (a.detourMinutes??Number.POSITIVE_INFINITY)-(b.detourMinutes??Number.POSITIVE_INFINITY)||
    (a.distanceMeters??Number.POSITIVE_INFINITY)-(b.distanceMeters??Number.POSITIVE_INFINITY)
  ).slice(0,bounded);
}
