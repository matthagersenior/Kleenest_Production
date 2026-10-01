import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Cache-Control':'no-store',
};

type Mode='nearby'|'route';
type Intent={
  mode:Mode;
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
};

const trim=(value:unknown,max=180)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const norm=(value:unknown)=>trim(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const unique=(values:string[])=>Array.from(new Set(values.map(value=>trim(value,80)).filter(Boolean)));
const routePhrase=/\b(on my way|along (?:my |the )?route|en route|headed to|going to|on the way|before i get to|minimal detour|off route)\b/i;
const buckets=new Map<string,{started:number;count:number}>();

function allowed(req:Request){
  const now=Date.now();
  const key=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'guest').split(',')[0].trim().slice(0,80);
  const current=buckets.get(key);
  if(!current||now-current.started>60000){buckets.set(key,{started:now,count:1});return true;}
  if(current.count>=20)return false;
  current.count+=1;
  return true;
}

function catalogMatch(catalog:string[],patterns:RegExp[]){
  return catalog.find(label=>patterns.some(pattern=>pattern.test(norm(label))))||'';
}

function collectTerms(query:string,catalog:string[]){
  const found:string[]=[];
  const add=(wanted:boolean,patterns:RegExp[])=>{if(!wanted)return;const match=catalogMatch(catalog,patterns);if(match)found.push(match);};
  add(/changing table|baby chang|diaper chang/i.test(query),[/changing table/,/baby chang/,/diaper chang/]);
  add(/wheelchair|accessible|accessibility|\bada\b/i.test(query),[/wheelchair/,/accessible/,/accessibility/,/\bada\b/]);
  add(/family restroom|family bathroom|gender[- ]?neutral|all[- ]?gender/i.test(query),[/family/,/gender neutral/,/all gender/]);
  add(/seat covers?/i.test(query),[/seat cover/]);
  add(/hands[- ]?free|touchless|contactless/i.test(query),[/hands free/,/touchless/,/contactless/]);
  return unique(found);
}

function routeDestination(query:string){
  const match=query.match(/\b(?:on my way to|headed to|going to|en route to|on the way to|before i get to)\s+(.+)$/i);
  if(!match)return'';
  return trim(match[1].replace(/\s+(?:with|that has|and needs?)\s+.+$/i,''),180).replace(/[?.!,;]+$/,'').trim();
}

function fallback(query:string,currentMode:Mode,catalog:string[]):Intent{
  const destinationText=routeDestination(query);
  const mode:Mode=destinationText||routePhrase.test(query)?'route':currentMode;
  const amenityTerms=collectTerms(query,catalog);
  const radius=query.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i);
  const detour=query.match(/\b(?:within|max(?:imum)?|no more than|under)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\s*(?:off (?:my |the )?route|detour)\b/i);
  const stars=query.match(/\b([1-5](?:\.\d)?)\s*\+?\s*stars?\b/i);
  const freshnessDays=/\b(today|right now|just verified)\b/i.test(query)?1:/\b(fresh|recent|recently|up to date|current)\b/i.test(query)?7:null;
  const base={
    mode,
    originText:'',
    destinationText,
    placeQuery:'',
    amenityTerms,
    restroomRequired:/\b(restroom|bathroom|toilet)\b/i.test(query),
    freshnessDays,
    minimumStars:stars?Math.max(1,Math.min(5,Number(stars[1]))):null,
    verifiedOnly:/\b(verified|confirmed|trusted|reliable)\b/i.test(query),
    kleenestOnly:/\bkleenest\s+only\b/i.test(query),
    maxDetourMiles:mode==='route'&&detour?Math.max(.25,Math.min(25,Number(detour[1]))):null,
    maxRadiusMiles:mode==='nearby'&&radius?Math.max(1,Math.min(250,Number(radius[1]))):null,
  };
  const parts:string[]=[];
  if(mode==='route')parts.push('Along route');
  parts.push(...amenityTerms.slice(0,3));
  if(freshnessDays!=null)parts.push(freshnessDays<=1?'Fresh today':'Recent evidence');
  if(base.verifiedOnly)parts.push('Confirmed evidence');
  if(base.maxDetourMiles!=null)parts.push('≤ '+String(base.maxDetourMiles)+' mi detour');
  else if(base.maxRadiusMiles!=null)parts.push('Within '+String(base.maxRadiusMiles)+' mi');
  return{...base,summary:parts.join(' · ')||(base.restroomRequired?'Restroom':'Search')};
}

function parseJson(value:string){
  try{return JSON.parse(value);}catch{}
  const match=value.match(/\{[\s\S]*\}/);
  if(match)try{return JSON.parse(match[0]);}catch{}
  return null;
}

function boundedNumber(value:unknown,min:number,max:number){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(min,Math.min(max,number)):null;
}

function sanitize(value:any,base:Intent,catalog:string[]):Intent{
  const row=value&&typeof value==='object'?value:{};
  const requested=Array.isArray(row.amenityTerms)?row.amenityTerms.map((item:any)=>trim(item,80)):[];
  const amenityTerms=unique(requested.flatMap((term:string)=>{
    const candidate=norm(term);
    const match=catalog.find(label=>norm(label)===candidate||norm(label).includes(candidate)||candidate.includes(norm(label)));
    return match?[match]:[];
  }));
  const mode:Mode=row.mode==='route'||row.mode==='nearby'?row.mode:base.mode;
  const next={
    mode,
    originText:trim(row.originText??base.originText,180),
    destinationText:mode==='route'?trim(row.destinationText??base.destinationText,180):'',
    placeQuery:trim(row.placeQuery??base.placeQuery,120),
    amenityTerms:amenityTerms.length?amenityTerms:base.amenityTerms,
    restroomRequired:typeof row.restroomRequired==='boolean'?row.restroomRequired:base.restroomRequired,
    freshnessDays:boundedNumber(row.freshnessDays,1,90)??base.freshnessDays,
    minimumStars:boundedNumber(row.minimumStars,1,5)??base.minimumStars,
    verifiedOnly:typeof row.verifiedOnly==='boolean'?row.verifiedOnly:base.verifiedOnly,
    kleenestOnly:typeof row.kleenestOnly==='boolean'?row.kleenestOnly:base.kleenestOnly,
    maxDetourMiles:boundedNumber(row.maxDetourMiles,.25,25)??base.maxDetourMiles,
    maxRadiusMiles:boundedNumber(row.maxRadiusMiles,1,250)??base.maxRadiusMiles,
    summary:trim(row.summary,180)||base.summary,
  };
  return next;
}

function systemPrompt(catalog:string[]){
  return 'Interpret a Kleenest restroom/place discovery request into JSON only. '
    +'You interpret intent only: never search for places, choose a location, assert amenities, trust, verification, availability, travel time, or mutate anything. '
    +'Use amenityTerms only from this catalog: '+JSON.stringify(catalog)+'. '
    +'Return exactly these fields: mode (nearby or route), originText, destinationText, placeQuery, amenityTerms, restroomRequired, freshnessDays, minimumStars, verifiedOnly, kleenestOnly, maxDetourMiles, maxRadiusMiles, summary. '
    +'Preserve explicit destination and business names. Unknown strings are empty, unknown numbers are null. summary is a short ordinary product-language chip such as "Along route · Changing table · Recent evidence".';
}

function extractGeminiText(payload:any){
  if(trim(payload?.output_text))return trim(payload.output_text,6000);
  const output:string[]=[];
  const walk=(value:any)=>{
    if(!value)return;
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(typeof value!=='object')return;
    if((value.type==='text'||value.type==='output_text')&&typeof value.text==='string')output.push(value.text);
    for(const [key,child] of Object.entries(value))if(!['thought','thoughts','reasoning'].includes(key))walk(child);
  };
  walk(payload?.steps);
  return output.join('\n').trim();
}

async function gemini(query:string,mode:Mode,catalog:string[]){
  const key=Deno.env.get('GEMINI_API_KEY');
  if(!key)throw new Error('missing_gemini');
  const model=Deno.env.get('GEMINI_MODEL')||'gemini-3.7-flash';
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
    method:'POST',
    headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({model,system_instruction:systemPrompt(catalog),input:'Current mode: '+mode+'\nRequest: '+query,store:false,generation_config:{thinking_level:'low'}}),
  });
  if(!response.ok)throw new Error('gemini_failed');
  const payload=await response.json();
  const parsed=parseJson(extractGeminiText(payload));
  if(!parsed)throw new Error('gemini_parse');
  return parsed;
}

async function openRouter(query:string,mode:Mode,catalog:string[]){
  const key=Deno.env.get('OPENROUTER_API_KEY');
  if(!key)throw new Error('missing_openrouter');
  const model=Deno.env.get('OPENROUTER_MODEL')||'openrouter/free';
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-OpenRouter-Title':'Kleenest'},
    body:JSON.stringify({model,messages:[{role:'system',content:systemPrompt(catalog)},{role:'user',content:'Current mode: '+mode+'\nRequest: '+query}],max_tokens:350}),
  });
  if(!response.ok)throw new Error('openrouter_failed');
  const payload=await response.json();
  const parsed=parseJson(trim(payload?.choices?.[0]?.message?.content,6000));
  if(!parsed)throw new Error('openrouter_parse');
  return parsed;
}

async function openAi(query:string,mode:Mode,catalog:string[]){
  const key=Deno.env.get('OPENAI_API_KEY');
  if(!key)throw new Error('missing_openai');
  const model=Deno.env.get('OPENAI_MODEL')||'gpt-5.6-luna';
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:systemPrompt(catalog)}]},{role:'user',content:[{type:'input_text',text:'Current mode: '+mode+'\nRequest: '+query}]}],max_output_tokens:350}),
  });
  if(!response.ok)throw new Error('openai_failed');
  const payload=await response.json();
  const text=(Array.isArray(payload?.output)?payload.output:[]).flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((item:any)=>item?.text).filter(Boolean).join('\n');
  const parsed=parseJson(text);
  if(!parsed)throw new Error('openai_parse');
  return parsed;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
  if(!allowed(req))return new Response(JSON.stringify({error:'Too many requests'}),{status:429,headers:{...headers,'Retry-After':'60'}});
  try{
    const body=await req.json();
    const query=trim(body?.query,360);
    const mode:Mode=body?.mode==='route'?'route':'nearby';
    const catalog=unique((Array.isArray(body?.amenity_catalog)?body.amenity_catalog:[]).map((item:any)=>trim(item,80)).slice(0,60));
    if(!query)return new Response(JSON.stringify({error:'Query required'}),{status:400,headers});
    const base=fallback(query,mode,catalog);
    for(const run of[gemini,openRouter,openAi]){
      try{
        const interpreted=await run(query,mode,catalog);
        return new Response(JSON.stringify({intent:sanitize(interpreted,base,catalog),source:'interpreted'}),{headers});
      }catch{}
    }
    return new Response(JSON.stringify({intent:base,source:'fallback'}),{headers});
  }catch{
    return new Response(JSON.stringify({error:'Invalid request'}),{status:400,headers});
  }
});
