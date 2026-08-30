import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY='kleenest.native.nearby.public.v1';
const MAX_AGE_MS=24*60*60*1000;

type NearbyCache={savedAt:number;rows:any[]};

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

export async function writeNearbyCache(rows:any[]){
  if(!Array.isArray(rows)||!rows.length)return;
  const publicRows=rows.slice(0,100).map(row=>({...row}));
  await AsyncStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),rows:publicRows} satisfies NearbyCache));
}

export function cachedAgeLabel(savedAt:number){
  const minutes=Math.max(1,Math.round((Date.now()-savedAt)/60000));
  if(minutes<60)return`${minutes} min ago`;
  const hours=Math.round(minutes/60);
  return`${hours} hr${hours===1?'':'s'} ago`;
}
