import { Platform } from 'react-native';
import KleenestNearby, { type NearbyWidgetPlace } from '../widgets/KleenestNearby';

export async function publishConsumerWidgetSnapshot(rows:unknown[]):Promise<void>{
  if(Platform.OS!=='ios')return;
  const seen=new Set<string>(),places:NearbyWidgetPlace[]=[];
  for(const value of rows){
    if(places.length>=3)break;
    const row=value as Record<string,unknown>|null;
    if(!row)continue;
    const id=String(row.location_id||row.place_id||row.id||'').trim();
    const name=String(row.name||row.business_name||'').trim();
    if(!/^[a-f0-9-]{36}$/i.test(id)||!name||seen.has(id))continue;
    seen.add(id);
    const meters=Number(row.distance_meters);
    places.push({id,name:name.slice(0,88),distance:Number.isFinite(meters)&&meters>=0?(meters/1609.344).toFixed(1)+' mi':''});
  }
  try{
    // The stale timeline entry prevents an old visit from masquerading as current
    // when the app has not been opened for an hour.
    KleenestNearby.updateTimeline([
      {date:new Date(),props:{status:'Fresh nearby results',places}},
      {date:new Date(Date.now()+60*60*1000),props:{status:'Open Kleenest to refresh',places:[]}},
    ]);
  }catch{
    // Ignore widget-extension unavailability: never block a restroom search.
  }
}
