import { NativeModules, Platform } from 'react-native';

// Only render fresh canonical, restroom-signalled discovery results.
// A widget refresh is not a guest visit or an additional discovery event.
type WidgetPlace={id:string;name:string;distance:string};
const bridge=NativeModules.KleenestWidgetBridge as
  | { publishSnapshot:(payload:string)=>Promise<boolean> } | undefined;

export async function publishConsumerWidgetSnapshot(rows:unknown[]):Promise<void>{
  if(Platform.OS!=='android'||!bridge?.publishSnapshot)return;
  const unique=new Set<string>();
  const places:WidgetPlace[]=[];
  for(const value of rows){
    const row=value as Record<string,unknown>|null;
    if(!row||places.length>=3)break;
    const id=String(row.location_id||row.place_id||row.id||'').trim();
    const name=String(row.name||row.business_name||'').trim();
    if(!/^[a-f0-9-]{36}$/i.test(id)||!name||unique.has(id))continue;
    unique.add(id);
    const meters=Number(row.distance_meters);
    places.push({id,name:name.slice(0,88),
      distance:Number.isFinite(meters)&&meters>=0?(meters/1609.344).toFixed(1)+' mi':''});
  }
  try{
    await bridge.publishSnapshot(JSON.stringify({at:Date.now(),places}));
  }catch{
    // The app keeps working on emulators, web previews and builds missing native widgets.
  }
}
