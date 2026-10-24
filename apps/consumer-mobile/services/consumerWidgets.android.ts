import { NativeModules, Platform } from 'react-native';

// Only render fresh canonical, restroom-signalled discovery results.
// A widget refresh is not a guest visit or an additional discovery event.
type WidgetPlace={id:string;name:string;distance:string;latitude?:number;longitude?:number};
const bridge=NativeModules.KleenestWidgetBridge as
  | { publishSnapshot:(payload:string)=>Promise<boolean> } | undefined;

export async function publishConsumerWidgetSnapshot(rows:unknown[]):Promise<void>{
  if(Platform.OS!=='android'||!bridge?.publishSnapshot)return;
  const unique=new Set<string>();
  const places:WidgetPlace[]=[];
  // Nearby is geographic: pick the closest eligible discovery, not whichever
  // evidence-ranked card happens to appear first in Explore.
  const candidates=[...rows].sort((a,b)=>{
    const meter=(value:unknown)=>{
      const raw=(value as Record<string,unknown>|null)?.distance_meters;
      if(raw==null||raw==='')return Number.POSITIVE_INFINITY;
      const num=Number(raw);
      return Number.isFinite(num)&&num>=0?num:Number.POSITIVE_INFINITY;
    };
    return meter(a)-meter(b);
  });
  for(const value of candidates){
    const row=value as Record<string,unknown>|null;
    if(!row||places.length>=3)break;
    const id=String(row.location_id||row.place_id||row.id||'').trim();
    const name=String(row.name||row.business_name||'').trim();
    if(!/^[a-f0-9-]{36}$/i.test(id)||!name||unique.has(id))continue;
    unique.add(id);
    const rawDistance=row.distance_meters;
    const meters=rawDistance==null||rawDistance===''?NaN:Number(rawDistance);
    const rawLat=row.latitude,rawLon=row.longitude;
    const latitude=rawLat!=null&&rawLat!==''?Number(rawLat):NaN;
    const longitude=rawLon!=null&&rawLon!==''?Number(rawLon):NaN;
    const validCoordinates=Number.isFinite(latitude)&&Number.isFinite(longitude)
      &&Math.abs(latitude)<=90&&Math.abs(longitude)<=180
      &&!(latitude===0&&longitude===0);
    places.push({id,name:name.slice(0,88),
      distance:Number.isFinite(meters)&&meters>=0?(meters/1609.344).toFixed(1)+' mi':'',
      ...(validCoordinates?{latitude:latitude,longitude:longitude}:{})});
  }
  try{
    await bridge.publishSnapshot(JSON.stringify({at:Date.now(),places}));
  }catch{
    // The app keeps working on emulators, web previews and builds missing native widgets.
  }
}
