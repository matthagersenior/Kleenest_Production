import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type DiscoveryMode='nearby'|'route';
export type DiscoveryIntent={
  mode:DiscoveryMode;
  originText:string;
  destinationText:string;
  placeQuery:string;
  amenityTerms:string[];
  restroomRequired:boolean;
  freshnessDays:number|null;
  minimumStars:number|null;
  verifiedOnly:boolean;
  kleenestOnly:boolean;
  maxDetourMiles:number|null;
  maxRadiusMiles:number|null;
  summary:string;
  source:'interpreted'|'fallback';
};

const trim=(value:unknown,max=180)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const normalized=(value:unknown)=>trim(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const unique=(values:string[])=>Array.from(new Set(values.map(value=>trim(value,80)).filter(Boolean)));
const routePhrase=/\b(on my way|along (?:my |the )?route|en route|headed to|going to|on the way|before i get to|minimal detour|off route)\b/i;
const needPhrase=/\b(i need|need a|find me|looking for|show me|somewhere|restroom|bathroom|toilet|changing table|baby changing|wheelchair|accessible|family restroom|seat covers?|hands[- ]?free|clean(?:est)?|fresh|recent(?:ly)?|verified|confirmed|trusted|reliable|quick stop)\b/i;

function addressLike(query:string){
  return /\d/.test(query)||query.includes(',')||/\b\d{5}(?:-\d{4})?\b/.test(query)||/\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|highway|hwy\.?|court|ct\.?|circle|cir\.?|parkway|pkwy\.?)\b/i.test(query);
}

export function shouldInterpretDiscoveryQuery(value:string){
  const query=trim(value,360);
  if(!query)return false;
  if(addressLike(query)&&!routePhrase.test(query)&&!needPhrase.test(query))return false;
  const words=query.split(/\s+/).filter(Boolean);
  if(words.length<=4&&!routePhrase.test(query)&&!needPhrase.test(query))return false;
  return routePhrase.test(query)||(needPhrase.test(query)&&words.length>=4);
}

function catalogMatch(catalog:string[],patterns:RegExp[]){
  return catalog.find(label=>patterns.some(pattern=>pattern.test(normalized(label))))||'';
}

function collectAmenityTerms(query:string,catalog:string[]){
  const found:string[]=[];
  const add=(wanted:boolean,patterns:RegExp[])=>{if(!wanted)return;const match=catalogMatch(catalog,patterns);if(match)found.push(match)};
  add(/\b(changing table|baby chang(?:e|ing)|diaper chang(?:e|ing))\b/i.test(query),[/changing table/,/baby chang/,/diaper chang/]);
  add(/\b(wheelchair|accessible|accessibility|ada)\b/i.test(query),[/wheelchair/,/accessible/,/accessibility/,/\bada\b/]);
  add(/\bfamily (?:restroom|bathroom)|gender[- ]?neutral|all[- ]?gender\b/i.test(query),[/family/,/gender neutral/,/all gender/]);
  add(/\bseat covers?\b/i.test(query),[/seat cover/]);
  add(/\b(hands[- ]?free|touchless|contactless)\b/i.test(query),[/hands free/,/touchless/,/contactless/]);
  return unique(found);
}

function routeDestination(query:string){
  const match=query.match(/\b(?:on my way to|headed to|going to|en route to|on the way to|before i get to)\s+(.+)$/i);
  if(!match)return'';
  return trim(match[1].replace(/\s+(?:with|that has|and needs?)\s+.+$/i,''),180).replace(/[?.!,;]+$/,'').trim();
}

function inferredPlaceQuery(query:string,destinationText:string){
  let value=query;
  const routeIndex=value.search(/\b(?:on my way to|headed to|going to|en route to|on the way to|before i get to)\b/i);
  if(routeIndex>=0)value=value.slice(0,routeIndex);
  value=value
    .replace(/\b(i need|need|find me|find|looking for|show me|somewhere|please|a|an|the)\b/ig,' ')
    .replace(/\b(cleanest|clean|fresh|recently|recent|verified|confirmed|trusted|reliable|quick|nearby)\b/ig,' ')
    .replace(/\b(restroom|bathroom|toilet|restrooms|bathrooms|toilets)\b/ig,' ')
    .replace(/\b(changing table|baby changing|wheelchair accessible|accessible|family restroom|seat covers?|hands[- ]?free|touchless|contactless)\b/ig,' ')
    .replace(/\b(with|that has|having|within|miles?|mi|of me|near me)\b/ig,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/\s+/g,' ').trim();
  if(destinationText&&normalized(value)===normalized(destinationText))return'';
  if(!value||value.split(' ').length>5)return'';
  return trim(value,120);
}

function summaryFor(intent:Omit<DiscoveryIntent,'summary'|'source'>){
  const parts:string[]=[];
  if(intent.mode==='route')parts.push('Along route');
  else if(intent.originText)parts.push('Near '+intent.originText);
  if(intent.placeQuery)parts.push(intent.placeQuery);
  parts.push(...intent.amenityTerms.slice(0,3));
  if(intent.freshnessDays!=null)parts.push(intent.freshnessDays<=1?'Fresh today':'Recent evidence');
  if(intent.verifiedOnly)parts.push('Confirmed evidence');
  if(intent.minimumStars!=null)parts.push(String(intent.minimumStars)+'+ stars');
  if(intent.maxDetourMiles!=null)parts.push('≤ '+String(intent.maxDetourMiles)+' mi detour');
  else if(intent.maxRadiusMiles!=null)parts.push('Within '+String(intent.maxRadiusMiles)+' mi');
  if(!parts.length&&intent.restroomRequired)parts.push('Restroom');
  return parts.join(' · ');
}

export function deterministicDiscoveryIntent(queryValue:string,currentMode:DiscoveryMode='nearby',amenityCatalog:string[]=[]):DiscoveryIntent{
  const query=trim(queryValue,360);
  const catalog=unique(amenityCatalog.slice(0,60));
  const destinationText=routeDestination(query);
  const mode:DiscoveryMode=destinationText||routePhrase.test(query)?'route':currentMode;
  const terms=collectAmenityTerms(query,catalog);
  const radiusMatch=query.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i);
  const detourMatch=query.match(/\b(?:within|max(?:imum)?|no more than|under)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\s*(?:off (?:my |the )?route|detour)\b/i);
  const starsMatch=query.match(/\b([1-5](?:\.\d)?)\s*\+?\s*stars?\b/i);
  const freshnessDays=/\b(today|right now|just verified)\b/i.test(query)?1:/\b(fresh|recent|recently|up to date|current)\b/i.test(query)?7:null;
  const restroomRequired=/\b(restroom|bathroom|toilet)\b/i.test(query);
  const verifiedOnly=/\b(verified|confirmed|trusted|reliable)\b/i.test(query);
  const kleenestOnly=/\bkleenest\s+only\b/i.test(query);
  const maxRadiusMiles=radiusMatch?Math.max(1,Math.min(250,Number(radiusMatch[1]))):null;
  const maxDetourMiles=detourMatch?Math.max(.25,Math.min(25,Number(detourMatch[1]))):null;
  const minimumStars=starsMatch?Math.max(1,Math.min(5,Number(starsMatch[1]))):null;
  const placeQuery=inferredPlaceQuery(query,destinationText);
  const base={mode,originText:'',destinationText,placeQuery,amenityTerms:terms,restroomRequired,freshnessDays,minimumStars,verifiedOnly,kleenestOnly,maxDetourMiles:mode==='route'?maxDetourMiles:null,maxRadiusMiles:mode==='nearby'?maxRadiusMiles:null};
  return{...base,summary:summaryFor(base),source:'fallback'};
}

function boundedNumber(value:unknown,min:number,max:number){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(min,Math.min(max,number)):null;
}

export function sanitizeDiscoveryIntent(value:unknown,fallback:DiscoveryIntent,amenityCatalog:string[]):DiscoveryIntent{
  const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const catalog=unique(amenityCatalog.slice(0,60));
  const requested=Array.isArray(row.amenityTerms)?row.amenityTerms.map(item=>trim(item,80)):[];
  const matched=unique(requested.flatMap(term=>{
    const candidate=normalized(term);
    const exact=catalog.find(label=>normalized(label)===candidate);
    if(exact)return[exact];
    const fuzzy=catalog.find(label=>normalized(label).includes(candidate)||candidate.includes(normalized(label)));
    return fuzzy?[fuzzy]:[];
  }));
  const mode:DiscoveryMode=row.mode==='route'||row.mode==='nearby'?row.mode:fallback.mode;
  const base={
    mode,
    originText:trim(row.originText??fallback.originText,180),
    destinationText:mode==='route'?trim(row.destinationText??fallback.destinationText,180):'',
    placeQuery:trim(row.placeQuery??fallback.placeQuery,120),
    amenityTerms:matched.length?matched:fallback.amenityTerms,
    restroomRequired:typeof row.restroomRequired==='boolean'?row.restroomRequired:fallback.restroomRequired,
    freshnessDays:boundedNumber(row.freshnessDays,1,90)??fallback.freshnessDays,
    minimumStars:boundedNumber(row.minimumStars,1,5)??fallback.minimumStars,
    verifiedOnly:typeof row.verifiedOnly==='boolean'?row.verifiedOnly:fallback.verifiedOnly,
    kleenestOnly:typeof row.kleenestOnly==='boolean'?row.kleenestOnly:fallback.kleenestOnly,
    maxDetourMiles:boundedNumber(row.maxDetourMiles,.25,25)??fallback.maxDetourMiles,
    maxRadiusMiles:boundedNumber(row.maxRadiusMiles,1,250)??fallback.maxRadiusMiles,
  };
  return{...base,summary:summaryFor(base),source:'interpreted'};
}

export function resolveIntentAmenityNames(intent:DiscoveryIntent|null,amenityCatalog:string[]){
  if(!intent)return[];
  const catalog=unique(amenityCatalog);
  return unique(intent.amenityTerms.flatMap(term=>{
    const candidate=normalized(term);
    const exact=catalog.find(label=>normalized(label)===candidate);
    return exact?[exact]:[];
  }));
}

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
