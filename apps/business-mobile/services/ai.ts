import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
export type BusinessAiTask='business_growth'|'notification_copy'|'business_insight';
export type BusinessAiResponse={task:BusinessAiTask;answer:string;provider:string;model:string|null;review_required:boolean;trace_id:string;provider_status:number|null;provider_error_code:string|null;provider_error_type:string|null};
export async function runBusinessAi(task:BusinessAiTask,context:Record<string,unknown>,instruction:string){const client=getKleenestSupabaseClient();const{data:{session},error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;if(!session?.access_token)throw new Error('Authentication required for Kleenest AI.');const{data,error}=await client.functions.invoke('ai-assist',{body:{task,context,instruction},headers:{Authorization:`Bearer ${session.access_token}`}});if(error)throw new Error(error.message||'Kleenest AI request failed.');if(!data||typeof data.answer!=='string')throw new Error('Kleenest AI returned no grounded answer.');return data as BusinessAiResponse;}


const organicBusinessCache=new Map<string,BusinessAiResponse>();
export async function organicBusinessInsight(signals:string[],context:Record<string,unknown>={}){
 const cleanSignals=signals.map(value=>String(value||'').trim()).filter(Boolean).slice(0,6);
 const fallback=cleanSignals.length?`Current business signals: ${cleanSignals.slice(0,3).join(' · ')}.`:'No strong operational exception is visible in the current Kleenest metrics.';
 const key=JSON.stringify([cleanSignals,context]);
 const cached=organicBusinessCache.get(key);if(cached)return cached.answer;
 try{
  const result=await runBusinessAi('business_insight',{signals:cleanSignals,...context},'Summarize the most actionable current business signal in one or two sentences. Use only the supplied metrics and do not invent causality.');
  organicBusinessCache.set(key,result);return result.answer;
 }catch{
  const result:BusinessAiResponse={task:'business_insight',answer:fallback,provider:'grounded_fallback',model:null,review_required:false,trace_id:'business-grounded-fallback',provider_status:null,provider_error_code:null,provider_error_type:null};
  organicBusinessCache.set(key,result);return fallback;
 }
}
