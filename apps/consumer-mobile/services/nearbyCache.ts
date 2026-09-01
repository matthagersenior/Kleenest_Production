import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY='kleenest.native.nearby.public.v1';
const CONTINUITY_KEY='kleenest.native.nearby.continuity.v1';
const MAX_AGE_MS=24*60*60*1000;

type NearbyCache={savedAt:number;rows:any[];selectedId?:string;origin?:[number,number];radiusMeters?:number};
type NearbyContinuity={selectedId:string;radiusMeters:number;savedAt:number};

export async function readNearbyCache():Promise<NearbyCache|null>{
  try{
    const raw=await AsyncStorage.getItem(CACHE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as NearbyCache;
    if(!Array.isArray(parsed?.rows)||!Number.isFinite(parsed?.savedAt))return null;
    if(Date.now()-parsed.savedAt>MAX_AGE_MS){await AsyncStorage.removeItem(CACHE_KEY);return null;}
    return parsed;
  }catch{return null}
}

export async function writeNearbyCache(rows:any[],options:{selectedId?:string;origin?:[number,number];radiusMeters?:number}={}){
  if(!Array.isArray(rows)||!rows.length)return;
  const publicRows=rows.slice(0,100).map(row=>({...row}));
  const payload:NearbyCache={savedAt:Date.now(),rows:publicRows,selectedId:options.selectedId||undefined,origin:options.origin,radiusMeters:options.radiusMeters};
  await AsyncStorage.setItem(CACHE_KEY,JSON.stringify(payload));
}

export async function readNearbyContinuity():Promise<NearbyContinuity|null>{
  try{
    const raw=await AsyncStorage.getItem(CONTINUITY_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as NearbyContinuity;
    if(typeof parsed?.selectedId!=='string'||!Number.isFinite(parsed?.radiusMeters)||!Number.isFinite(parsed?.savedAt))return null;
    if(Date.now()-parsed.savedAt>MAX_AGE_MS){await AsyncStorage.removeItem(CONTINUITY_KEY);return null;}
    return parsed;
  }catch{return null}
}

export async function writeNearbyContinuity(selectedId:string,radiusMeters:number){
  if(!selectedId||!Number.isFinite(radiusMeters))return;
  await AsyncStorage.setItem(CONTINUITY_KEY,JSON.stringify({selectedId,radiusMeters,savedAt:Date.now()} satisfies NearbyContinuity));
}

export function cachedAgeLabel(savedAt:number){
  const minutes=Math.max(1,Math.round((Date.now()-savedAt)/60000));
  if(minutes<60)return`${minutes} min ago`;
  const hours=Math.round(minutes/60);
  return`${hours} hr${hours===1?'':'s'} ago`;
}
