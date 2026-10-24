import { NativeModules, Platform } from 'react-native';

// Widgets do not track people or create discovery/guest telemetry. They display
// only recent foreground searches, each tied to a clear selected origin.
type WidgetPlace={id:string;name:string;distance:string};
type WidgetBridge={
  publishSnapshot:(payload:string)=>Promise<boolean>;
  publishCustomSnapshot:(payload:string,widgetId:number)=>Promise<boolean>;
  configureWidget:(widgetId:number,mode:'current')=>Promise<boolean>;
};
const bridge=NativeModules.KleenestWidgetBridge as WidgetBridge|undefined;

function payloadFor(rows:unknown[],label?:string):string{
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
  return JSON.stringify({at:Date.now(),places,...(label?{label:label.trim().slice(0,80)}:{})});
}

function nativeWidget():WidgetBridge{
  if(Platform.OS!=='android'||!bridge?.publishSnapshot||
      !bridge?.configureWidget||!bridge?.publishCustomSnapshot){
    throw new Error('The location picker needs a Kleenest APK with native widget support.');
  }
  return bridge;
}

export async function publishConsumerWidgetSnapshot(rows:unknown[]):Promise<void>{
  if(Platform.OS!=='android'||!bridge?.publishSnapshot)return;
  try{
    await bridge.publishSnapshot(payloadFor(rows));
  }catch{
    // Never block Explore if the launcher or native module is unavailable.
  }
}

export async function chooseConsumerWidgetCurrentArea(widgetId:number,rows:unknown[]):Promise<void>{
  const widget=nativeWidget();
  // Do not change the selection if publishing the fresh location failed.
  await widget.publishSnapshot(payloadFor(rows));
  await widget.configureWidget(widgetId,'current');
}

export async function chooseConsumerWidgetNamedArea(
  widgetId:number,label:string,rows:unknown[]
):Promise<void>{
  if(!label.trim())throw new Error('Choose a city, address, or ZIP code.');
  await nativeWidget().publishCustomSnapshot(payloadFor(rows,label),widgetId);
}
