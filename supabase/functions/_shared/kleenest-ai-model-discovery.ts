// KleenestOSAI: server-only, provider-independent, read-only model discovery.
export type Provider = "groq" | "gemini" | "openrouter" | "openai";
export type Discovery = { provider: Provider; status: "connected"|"missing_key"|"unauthorized"|"rate_limited"|"unavailable"; models: string[] };
const sources: Record<Provider,{key:string;url:string;header:string;prefix:string}> = {
 groq:{key:"GROQ_API_KEY",url:"https://api.groq.com/openai/v1/models",header:"Authorization",prefix:"Bearer "},
 gemini:{key:"GEMINI_API_KEY",url:"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",header:"x-goog-api-key",prefix:""},
 openrouter:{key:"OPENROUTER_API_KEY",url:"https://openrouter.ai/api/v1/models",header:"Authorization",prefix:"Bearer "},
 openai:{key:"OPENAI_API_KEY",url:"https://api.openai.com/v1/models",header:"Authorization",prefix:"Bearer "}
};
export async function discoverModels(provider:Provider,getSecret:(name:string)=>string|undefined,request:typeof fetch=fetch):Promise<Discovery>{
 const c=sources[provider],key=getSecret(c.key);
 if(!key)return {provider,status:"missing_key",models:[]};
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try{
 const r=await request(c.url,{headers:{[c.header]:c.prefix+key},signal:controller.signal});
 if(!r.ok)return {provider,status:r.status===401||r.status===403?"unauthorized":r.status===429?"rate_limited":"unavailable",models:[]};
 const json=await r.json(),entries=Array.isArray(json.data)?json.data:Array.isArray(json.models)?json.models:[];
 return {provider,status:"connected",models:entries.map((m:{id?:string;name?:string})=>m.id??m.name?.replace(/^models\//,"")).filter((id:unknown):id is string=>typeof id==="string")};
 }catch{return {provider,status:"unavailable",models:[]}}finally{clearTimeout(timeout)}
}
export async function discoverAll(getSecret:(name:string)=>string|undefined,request:typeof fetch=fetch):Promise<Discovery[]>{
 return Promise.all((Object.keys(sources) as Provider[]).map(p=>discoverModels(p,getSecret,request)));
}
