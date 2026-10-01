import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import {
  deterministicDiscoveryIntent,
  resolveIntentAmenityNames,
  sanitizeDiscoveryIntent,
  shouldInterpretDiscoveryQuery,
  type DiscoveryIntent,
  type DiscoveryMode,
} from './discoveryIntentCore.js';

export {
  deterministicDiscoveryIntent,
  resolveIntentAmenityNames,
  sanitizeDiscoveryIntent,
  shouldInterpretDiscoveryQuery,
  type DiscoveryIntent,
  type DiscoveryMode,
};

const trim=(value:unknown,max=180)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const unique=(values:string[])=>Array.from(new Set(values.map(value=>trim(value,80)).filter(Boolean)));

export async function interpretDiscoveryIntent(query:string,currentMode:DiscoveryMode,amenityCatalog:string[]):Promise<DiscoveryIntent|null>{
  if(!shouldInterpretDiscoveryQuery(query))return null;
  const fallback=deterministicDiscoveryIntent(query,currentMode,amenityCatalog);
  try{
    const client=getKleenestSupabaseClient();
    const request=client.functions.invoke('consumer-search-intent',{body:{query:trim(query,360),mode:currentMode,amenity_catalog:unique(amenityCatalog).slice(0,60)}});
    const timeout=new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('intent_timeout')),1400));
    const result:any=await Promise.race([request,timeout]);
    if(result?.error||!result?.data?.intent)return fallback;
    return sanitizeDiscoveryIntent(result.data.intent,fallback,amenityCatalog);
  }catch{
    return fallback;
  }
}
