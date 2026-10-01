import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY='kleenest.native.nearby.public.v1';
const CONTINUITY_KEY='kleenest.native.nearby.continuity.v1';
const EXPLORE_RETURN_KEY='kleenest.native.explore.return.v1';
const MAX_AGE_MS=24*60*60*1000;
const EXPLORE_RETURN_MAX_AGE_MS=30*60*1000;

type NearbyCache={savedAt:number;rows:any[];selectedId?:string;origin?:[number,number];radiusMeters?:number};
type NearbyContinuity={selectedId:string;radiusMeters:number;savedAt:number};
export type ExploreReturnState={savedAt:number;mode:'nearby'|'route';search:string;rows:any[];origin?:[number,number]|null;mapCenter?:[number,number]|null;mapZoom?:number;selectedId?:string;searchAreaOrigin?:[number,number]|null;searchAreaLabel?:string;destinationCardOpen?:boolean;radiusMeters?:number;maxRadiusMeters?:number;effectiveRadiusMeters?:number;attemptedRadiiMeters?:number[];corridorMeters?:number;selectedAmenityNames?:string[];matchRule?:'all'|'any';autoExpand?:boolean;route?:any};

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
  const publicRows=rows.slice(0,500).map(row=>({...row}));
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


export async function writeExploreReturnState(state:Omit<ExploreReturnState,'savedAt'>){
  try{
    const payload:ExploreReturnState={
      ...state,
      savedAt:Date.now(),
      rows:Array.isArray(state.rows)?state.rows.slice(0,500).map(row=>({...row})):[],
    };
    await AsyncStorage.setItem(EXPLORE_RETURN_KEY,JSON.stringify(payload));
  }catch{}
}

export async function takeExploreReturnState():Promise<ExploreReturnState|null>{
  try{
    const raw=await AsyncStorage.getItem(EXPLORE_RETURN_KEY);
    if(!raw)return null;
    await AsyncStorage.removeItem(EXPLORE_RETURN_KEY);
    const parsed=JSON.parse(raw) as ExploreReturnState;
    if(!Number.isFinite(parsed?.savedAt)||!Array.isArray(parsed?.rows))return null;
    if(Date.now()-parsed.savedAt>EXPLORE_RETURN_MAX_AGE_MS)return null;
    if(parsed.mode!=='nearby'&&parsed.mode!=='route')return null;
    return parsed;
  }catch{
    return null;
  }
}
