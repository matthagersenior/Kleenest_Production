import { useCallback,useEffect,useState } from 'react';
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { usePlatformTheme } from '../services/theme';
type Task={id:string;capability:string;status:string;priority:number;attempt_count:number;created_at:string;updated_at:string;data_class:string;result:Record<string,unknown>|null;error_code:string|null};
type Attempt={task_id:string;provider_model_id:string;outcome:string;estimated_cost_usd:number|null;finished_at:string;error_code:string|null};
type Provider={provider:string;model:string;enabled:boolean};
type Feedback={id:string;task_id:string;owner_id:string;action:'agree'|'reject'|'comment'|'follow_up';note:string;followup_task_id:string|null;created_at:string};
type Snapshot={budget:{limit_usd:number;committed_usd:number;remaining_usd:number;paid_enabled:boolean};tasks:Task[];attempts:Attempt[];providers:Provider[];feedback?:Feedback[]};
const names:Record<string,string>={accessibility_regression:'Installation & accessibility',auth_regression:'Sign-in reliability',route_regression:'Route planning',api_contract_regression:'Location QR links',finding_review:'Duplicate location review',restroom_evidence_gap:'Hidden restroom evidence gaps',entity_relationship_intelligence:'Hidden business relationships',ingestion_signal_intelligence:'Predictive ingestion signals',behavioral_signal_intelligence:'Discovery behavior evidence'};
const readable=(s:string)=>names[s]??s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export default function AIJobs(){
 const theme=usePlatformTheme();
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[refreshing,setRefreshing]=useState(false);
 const [probe,setProbe]=useState(''),[running,setRunning]=useState<string|null>(null);
 const [replyingTo,setReplyingTo]=useState<string|null>(null),[replyAction,setReplyAction]=useState<Feedback['action']>('comment'),[replyText,setReplyText]=useState(''),[savingReply,setSavingReply]=useState(false),[replyStatus,setReplyStatus]=useState('');
 const beginReply=(id:string,action:Feedback['action'])=>{setReplyingTo(id);setReplyAction(action);setReplyText('');setReplyStatus('')};
 const saveFeedback=async()=>{
  if(!replyingTo||savingReply)return;
  if((replyAction==='comment'||replyAction==='follow_up')&&!replyText.trim()){setReplyStatus('Enter a comment or follow-up question first.');return}
  setSavingReply(true);setReplyStatus('');
  try{
   const {data:record,error:failure}=await getKleenestSupabaseClient().rpc('owner_ai_feedback_submit',{p_task_id:replyingTo,p_action:replyAction,p_note:replyText.trim()});
   if(failure)throw failure;
   if(!record||record.created!==true)throw Error('Owner response could not be confirmed');
   await load();
   setReplyingTo(null);setReplyText('');
   setReplyStatus(replyAction==='follow_up'?'Follow-up saved as a new AI job. Public evidence can be processed by a verified model; restricted evidence stays in review.':'Your response is saved in the owner decision history. Nothing was executed.');
  }catch(e){setReplyStatus('Could not save response: '+String((e as Error)?.message??e))}
  finally{setSavingReply(false)}
 };
 const load=useCallback(async()=>{const {data:result,error:failure}=await getKleenestSupabaseClient().rpc('owner_ai_jobs_snapshot',{p_limit:60});if(failure)throw failure;if(!result||!Array.isArray(result.tasks)||!result.budget)throw Error('AI jobs snapshot unavailable');setData(result as Snapshot);setError('')},[]);
 useEffect(()=>{void load().catch(e=>setError(String(e?.message??e))).finally(()=>setBusy(false))},[load]);
 const refresh=async()=>{setRefreshing(true);try{await load()}catch(e){setError(String((e as Error)?.message??e))}finally{setRefreshing(false)}};
 const checkProviders=async()=>{setProbe('Checking provider connections…');try{const {data:result,error:failure}=await getKleenestSupabaseClient().functions.invoke('kleenest-ai-owner-control',{method:'GET'});if(failure)throw failure;setProbe((result.providers??[]).map((p:{provider:string;status:string;model_count:number})=>p.provider+': '+p.status+' ('+p.model_count+' models)').join(' · ')||'No provider results')}catch(e){setProbe('Provider check failed: '+String((e as Error).message??e))}};
 const runTask=async(id:string)=>{setRunning(id);try{const {data:result,error:failure}=await getKleenestSupabaseClient().functions.invoke('kleenest-ai-owner-control',{body:{task_id:id}});if(failure)throw failure;setProbe('Worker: '+String(result?.status??'unknown'));await load()}catch(e){setProbe('Worker error: '+String((e as Error).message??e))}finally{setRunning(null)}};
 const card={backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1,borderRadius:16,padding:16,gap:8} as const;
 const ink={color:theme.ink},muted={color:theme.muted};
 const counts=data?.tasks.reduce((a,t)=>({...a,[t.status]:(a[t.status]??0)+1}),{} as Record<string,number>)??{};
 return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:70,backgroundColor:theme.canvas}}>
  <Text style={{...ink,fontSize:26,fontWeight:'900'}}>KleenestOS AI Jobs</Text>
  <Text style={muted}>Live job queue, AI-generated hypotheses, supporting database evidence, model availability, and monthly spending. Model conclusions may be wrong and require validation before action.</Text>
  {busy?<ActivityIndicator/>:null}
  {error?<View style={card}><Text style={{color:theme.danger,fontWeight:'800'}}>Live data unavailable</Text><Text style={ink}>{error}</Text></View>:null}
  <Pressable accessibilityRole="button" onPress={()=>void refresh()} style={{...card,alignItems:'center'}}><Text style={{color:theme.accent,fontWeight:'900'}}>Refresh live results</Text></Pressable>
  <Pressable accessibilityRole="button" onPress={()=>void checkProviders()} style={{...card,alignItems:'center'}}><Text style={{color:theme.accent,fontWeight:'900'}}>Check live AI provider connections</Text></Pressable>
  {probe?<Text selectable style={muted}>{probe}</Text>:null}
  {replyStatus?<Text accessibilityRole="alert" selectable style={{color:replyStatus.startsWith('Could not')?theme.danger:theme.ink}}>{replyStatus}</Text>:null}
  {data?<><View style={card}><Text style={{...ink,fontWeight:'900',fontSize:19}}>AI budget</Text><Text style={ink}>Used / reserved: ${Number(data.budget.committed_usd??0).toFixed(4)} of ${Number(data.budget.limit_usd??0).toFixed(2)} this month</Text><Text style={muted}>Remaining: ${Number(data.budget.remaining_usd??0).toFixed(4)} · Paid calls {data.budget.paid_enabled?'permitted by policy':'disabled'}</Text></View>
  <View style={card}><Text style={{...ink,fontWeight:'900',fontSize:19}}>Queue</Text><Text style={ink}>{data.tasks.length} recent jobs · {counts.queued??0} queued · {counts.running??0} running · {counts.completed??0} completed · {counts.review??0} need review</Text><Text style={muted}>Each job keeps its original evidence and audit history. No automatic canonical merges, authentication changes, or deployments.</Text></View>
  <View style={card}><Text style={{...ink,fontWeight:'900',fontSize:19}}>Providers</Text>{data.providers.map((p,i)=><Text key={p.provider+String(i)} style={ink}>{readable(p.provider)} · {p.enabled?p.model:'Not enabled / awaiting verification'}</Text>)}</View>
  <Text style={{...ink,fontSize:20,fontWeight:'900'}}>Recent jobs and results</Text>
  {data.tasks.map(t=><View key={t.id} style={card}><Text style={{...ink,fontSize:17,fontWeight:'900'}}>{readable(t.capability)}</Text><Text style={{color:t.status==='completed'?theme.accent:theme.muted,fontWeight:'800'}}>{readable(t.status)} · priority {t.priority} · attempts {t.attempt_count}</Text><Text style={muted}>{new Date(t.created_at).toLocaleString()} · {t.data_class} evidence</Text>{t.status==='queued'&&t.data_class==='public'?<Pressable accessibilityRole="button" disabled={running!==null} onPress={()=>void runTask(t.id)} style={{padding:10,borderRadius:10,backgroundColor:theme.surfaceRaised}}><Text style={{color:theme.accent,fontWeight:'900'}}>{running===t.id?'Running…':'Run verified AI model'}</Text></Pressable>:null}{t.result?<><Text style={{...ink,fontWeight:'800'}}>{t.result.origin==='deterministic_triage'?'Rules-based triage · no AI call':t.result.origin==='deterministic_database_analysis'?'Verified database analysis · no AI call' :'AI hypothesis · verify before action'}</Text><Text selectable style={ink}>{typeof t.result.summary==='string'?t.result.summary:JSON.stringify(t.result)}</Text>{typeof t.result.confidence==='number'?<Text style={muted}>Model confidence: {Math.round(t.result.confidence*100)}% (self-assessed, not calibrated)</Text>:null}{typeof t.result.recommendation==='string'?<Text selectable style={ink}>Hypothesis / proposed test: {t.result.recommendation}</Text>:null}{t.result.independent_review && typeof t.result.independent_review==='object'?<View style={{padding:12,borderRadius:10,backgroundColor:theme.surfaceRaised,gap:6}}><Text style={{...ink,fontWeight:'900'}}>Independent model challenge</Text><Text style={muted}>{String((t.result.independent_review as Record<string,unknown>).primary_provider??'Primary')} vs {String((t.result.independent_review as Record<string,unknown>).peer_provider??'Peer')} · comparison not yet adjudicated</Text><Text selectable style={ink}>{String((t.result.independent_review as Record<string,unknown>).peer_summary??'No peer summary')}</Text><Text selectable style={ink}>Alternative assessment: {String((t.result.independent_review as Record<string,unknown>).peer_recommendation??'Not available')}</Text><Text style={muted}>Confidence difference: {Math.round(Number((t.result.independent_review as Record<string,unknown>).confidence_difference??0)*100)} percentage points · Model agreement is not independently verified.</Text></View>:null}{t.result.origin!=='deterministic_database_analysis'&&t.result.origin!=='deterministic_triage'?<Text style={muted}>AI interpretation is not verified evidence. Check the source data before changing ingestion, canonical locations, or user experiences.</Text>:null}</>:<Text style={muted}>{t.error_code?'Error: '+t.error_code:'Awaiting verified model execution or review'}</Text>}
  {t.result && (t.status==='completed'||t.status==='review')?<View style={{gap:8,marginTop:8,borderTopWidth:1,borderTopColor:theme.line,paddingTop:12}}>
   <Text style={{...ink,fontSize:15,fontWeight:'900'}}>Respond to this AI recommendation</Text>
   <Text style={muted}>Your decisions are recorded; agreeing does not execute changes.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
    {([['agree','Agree'],['reject','Reject'],['comment','Comment'],['follow_up','Ask AI follow-up']] as const).map(([action,label])=>
     <Pressable key={action} accessibilityRole="button" accessibilityLabel={label+' on '+readable(t.capability)}
      onPress={()=>beginReply(t.id,action)}
      style={{paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:replyingTo===t.id&&replyAction===action?theme.accent:theme.line,borderRadius:10,backgroundColor:theme.surfaceRaised}}>
      <Text style={{color:theme.ink,fontWeight:'800'}}>{label}</Text>
     </Pressable>)}
   </View>
   {replyingTo===t.id?<View style={{gap:8}}>
    <Text style={ink}>{replyAction==='follow_up'?'Ask the AI to investigate a specific question':replyAction==='comment'?'Add your instruction or observation':replyAction==='agree'?'Explain your agreement (optional)':'Explain why you disagree (optional)'}</Text>
    <TextInput accessible accessibilityLabel="Owner response" multiline value={replyText} onChangeText={setReplyText}
      placeholder="Write your response…" placeholderTextColor={theme.muted} maxLength={1500}
      style={{backgroundColor:theme.surfaceRaised,color:theme.ink,borderColor:theme.line,borderWidth:1,borderRadius:12,padding:12,minHeight:88,textAlignVertical:'top'}}/>
    {replyAction==='follow_up'?<Text style={muted}>Submitting a follow-up permits this question and the original public-class recommendation to be sent to a configured third-party AI model. Do not include private or sensitive information. Restricted jobs remain in review.</Text>:null}
    <View style={{flexDirection:'row',gap:8}}>
     <Pressable accessibilityRole="button" disabled={savingReply} onPress={()=>void saveFeedback()} style={{padding:12,backgroundColor:theme.accent,borderRadius:10}}>
      <Text style={{color:theme.accentText,fontWeight:'900'}}>{savingReply?'Saving…':replyAction==='follow_up'?'Submit follow-up':'Save response'}</Text>
     </Pressable>
     <Pressable accessibilityRole="button" disabled={savingReply} onPress={()=>setReplyingTo(null)} style={{padding:12,backgroundColor:theme.surfaceRaised,borderRadius:10}}><Text style={ink}>Cancel</Text></Pressable>
    </View>
   </View>:null}
   {(data.feedback??[]).filter(f=>f.task_id===t.id).slice(0,5).map(f=>
    <View key={f.id} style={{padding:10,backgroundColor:theme.surfaceRaised,borderRadius:10,gap:3}}>
     <Text style={{...ink,fontWeight:'800'}}>{f.action==='follow_up'?'Asked AI':readable(f.action)} · {new Date(f.created_at).toLocaleString()}</Text>
     {f.note?<Text selectable style={ink}>{f.note}</Text>:null}
     {f.followup_task_id?<Text style={muted}>Follow-up job {f.followup_task_id.slice(0,8)} · track in this queue</Text>:null}
    </View>)}
  </View>:null}
 </View>)}
  <Text style={{...ink,fontSize:20,fontWeight:'900'}}>Execution audit</Text>{data.attempts.length?data.attempts.map((a,i)=><View key={a.task_id+String(i)} style={card}><Text style={ink}>{a.provider_model_id} · {a.outcome}</Text><Text style={muted}>{a.finished_at?new Date(a.finished_at).toLocaleString():''} · estimated ${Number(a.estimated_cost_usd??0).toFixed(6)}</Text>{a.error_code?<Text style={muted}>{a.error_code}</Text>:null}</View>):<Text style={muted}>No provider execution attempts recorded yet.</Text>}</>:null}
 </ScrollView>;
}
