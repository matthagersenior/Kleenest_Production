import { useEffect,useState } from 'react';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { usePlatformTheme } from '../services/theme';
import { getOwnerDuplicateCase,previewOwnerConsolidation,executeOwnerConsolidation,
  readOwnerConsolidationStatus,undoOwnerConsolidation,
  type ConsolidationPreview,type ConsolidationStatus,
} from '../services/locationConsolidation';
import type { DuplicateCase,DuplicateLocation } from '../services/locationDedup';

const label=(v:unknown)=>v===null||v===undefined||v===''?'Unknown':String(v);
const childCount=(p:ConsolidationPreview|null,name:string,side:'source_rows'|'survivor_rows')=>
 (p?.impact??[]).filter(x=>x.table===name).reduce((total,x)=>total+Number(x[side]||0),0);
const concise=(l?:DuplicateLocation)=>[l?.address,l?.city,l?.state].filter(Boolean).join(', ')||'Address unavailable';

export default function LocationConsolidate(){
 const theme=usePlatformTheme(),router=useRouter();
 const params=useLocalSearchParams<{caseId?:string}>();
 const caseId=Number(params.caseId);
 const [item,setItem]=useState<DuplicateCase|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [preview,setPreview]=useState<ConsolidationPreview|null>(null);
 const [history,setHistory]=useState<ConsolidationStatus|null>(null);
 const [confirm,setConfirm]=useState('');
 const [restoreConfirm,setRestoreConfirm]=useState('');
 const [loading,setLoading]=useState(true),[checking,setChecking]=useState(false),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const archived=Boolean(history?.ledger_id&&!history?.undone_at);
 async function refresh(){
  if(!Number.isInteger(caseId)||caseId<1){setError('Invalid review case ID');setLoading(false);return;}
  setLoading(true);setError('');
  try{
   const [details,latest]=await Promise.all([getOwnerDuplicateCase(caseId),readOwnerConsolidationStatus(caseId)]);
   setItem(details);setHistory(latest);setPreview(null);setSelected(null);setConfirm('');setRestoreConfirm('');
  }catch(e:unknown){setError(e instanceof Error?e.message:'Could not load consolidation case');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[caseId]);
 async function check(id:string){
  setSelected(id);setPreview(null);setConfirm('');setError('');setMessage('');setChecking(true);
  try{setPreview(await previewOwnerConsolidation(caseId,id));}
  catch(e:unknown){setError(e instanceof Error?e.message:'Impact preview failed');}
  finally{setChecking(false);}
 }
 async function consolidate(){
  if(!preview||!selected||saving||!preview.allowed||confirm!=='CONSOLIDATE')return;
  setSaving(true);setError('');
  try{
   const result=await executeOwnerConsolidation(caseId,selected,preview.fingerprint,confirm);
   setMessage(`Consolidated to ${result.survivor_id}. Original ID retained; geo sync queued.`);
   await refresh();
  }catch(e:unknown){
   setPreview(null);setConfirm('');
   setError(e instanceof Error?e.message:'Consolidation failed; refresh impact preview');
  }finally{setSaving(false);}
 }
 async function restore(){
  if(!history?.ledger_id||restoreConfirm!=='RESTORE'||saving)return;
  setSaving(true);setError('');
  try{
   await undoOwnerConsolidation(history.ledger_id,restoreConfirm);
   await refresh();setMessage('Original location reactivated and geo restore queued.');
  }catch(e:unknown){setError(e instanceof Error?e.message:'Could not restore location');}
  finally{setSaving(false);}
 }
 const colors=(active:boolean)=>({
  backgroundColor:active?theme.accent:theme.surfaceRaised,
  borderColor:active?theme.accent:theme.line,
 });
 const Place=({place,letter}:{place?:DuplicateLocation;letter:string})=>
  <View style={[styles.place,{borderColor:theme.line,backgroundColor:theme.surfaceRaised}]}>
   <Text style={[styles.eyebrow,{color:theme.muted}]}>RECORD {letter}</Text>
   <Text style={[styles.h3,{color:theme.ink}]}>{place?.name||'Location unavailable'}</Text>
   <Text style={[styles.text,{color:theme.muted}]}>{concise(place)}</Text>
   <Text style={[styles.text,{color:theme.muted}]}>{place?.source_dataset||'Unknown dataset'} · {place?.source_external_id||'No external ID'}</Text>
   <Text style={[styles.text,{color:theme.muted}]}>ID: {place?.id||'Unknown'}</Text>
   <Text style={[styles.text,{color:place?.is_active===false?theme.danger:theme.success}]}>{place?.is_active===false?'Inactive alias':'Active location'}</Text>
   {!archived&&place&&item?.status==='confirmed'?<Pressable accessibilityRole="button"
     disabled={checking||saving} onPress={()=>void check(place.id)}
     style={[styles.action,colors(selected===place.id)]}>
      <Text style={{color:selected===place.id?theme.accentText:theme.ink,fontWeight:'800'}}>Keep record {letter} as canonical</Text>
    </Pressable>:null}
  </View>;
 return <ScrollView style={{backgroundColor:theme.canvas}} contentContainerStyle={styles.page}>
  <View style={[styles.hero,{backgroundColor:theme.accent}]}>
   <Text style={[styles.eyebrow,{color:theme.accentText}]}>KLEENESTOS · OWNER ONLY</Text>
   <Text style={[styles.heading,{color:theme.accentText}]}>Verified consolidation</Text>
   <Text style={[styles.text,{color:theme.accentText}]}>Inspect every linked dependency before choosing a survivor. This operation never silently moves claims, QR identities or reviews.</Text>
  </View>
  <Pressable accessibilityRole="button" onPress={()=>router.back()}>
   <Text style={[styles.link,{color:theme.accent}]}>← Back to duplicate review</Text>
  </Pressable>
  {loading?<ActivityIndicator color={theme.accent} size="large"/>:null}
  {error?<Text style={[styles.alert,{color:theme.danger}]}>{error}</Text>:null}
  {message?<Text style={[styles.alert,{color:theme.success}]}>{message}</Text>:null}
  {!loading&&item?<View style={[styles.panel,{borderColor:theme.line,backgroundColor:theme.surface}]}>
   <Text style={[styles.h3,{color:theme.ink}]}>Case #{item.id} · {item.status.replaceAll('_',' ')}</Text>
   <Text style={[styles.text,{color:theme.muted}]}>Match confidence {Math.round(Number(item.confidence)*100)}% (rule score, not proof of identity)</Text>
   <Place place={item.first} letter="A"/>
   <Place place={item.second} letter="B"/>
   {archived?<View style={[styles.section,{borderColor:theme.line}]}>
    <Text style={[styles.h3,{color:theme.ink}]}>Already consolidated</Text>
    <Text style={[styles.text,{color:theme.muted}]}>Ledger #{history?.ledger_id} · Mirror sync: {history?.geo_status||'unknown'}. The original record and source ID have been retained.</Text>
    <Text style={[styles.text,{color:theme.muted}]}>To reverse this operation, type RESTORE. The old location will become active again and the geo mirror will be updated through the retirement outbox.</Text>
    <TextInput accessibilityLabel="Type RESTORE to undo" value={restoreConfirm} onChangeText={setRestoreConfirm}
     placeholder="Type RESTORE" placeholderTextColor={theme.muted} autoCapitalize="characters"
     style={[styles.input,{borderColor:theme.line,color:theme.ink,backgroundColor:theme.surfaceRaised}]}/>
    <Pressable accessibilityRole="button" disabled={restoreConfirm!=='RESTORE'||saving}
     onPress={()=>void restore()} style={[styles.action,colors(restoreConfirm==='RESTORE')]}>
     <Text style={{color:restoreConfirm==='RESTORE'?theme.accentText:theme.ink,fontWeight:'900'}}>{saving?'Restoring…':'Restore original location'}</Text>
    </Pressable>
   </View>:null}
   {!archived&&item.status!=='confirmed'?<Text style={[styles.alert,{color:theme.danger}]}>First classify the two records as the same business in Duplicate Review. Other classifications cannot be consolidated.</Text>:null}
   {checking?<ActivityIndicator color={theme.accent}/>:null}
   {preview&&selected?<View style={[styles.section,{borderColor:theme.line}]}>
    <Text style={[styles.h3,{color:theme.ink}]}>Consolidation impact preview</Text>
    <Text style={[styles.text,{color:theme.ink}]}>Survivor: {label(preview.survivor.name)} · Retiring: {label(preview.retiring.name)}</Text>
    <Text style={[styles.text,{color:theme.muted}]}>{preview.preservation}</Text>
    <Text style={[styles.h3,{color:theme.ink}]}>Linked data</Text>
    {[
      ['Reviews','public.reviews'],
      ['Check-ins','public.check_ins'],
      ['QR codes','public.qr_codes'],
      ['Business claims','public.location_claims'],
      ['Photos','public.location_photos'],
      ['External source records','public.external_location_records'],
      ['Evidence records','public.external_location_evidence'],
    ].map(([title,table])=><View key={table} style={styles.countRow}>
     <Text style={[styles.text,{color:theme.ink}]}>{title}</Text>
     <Text style={[styles.text,{color:theme.muted}]}>
      Retiring: {childCount(preview,table,'source_rows')} · Keeping: {childCount(preview,table,'survivor_rows')}
     </Text>
    </View>)}
    <Text style={[styles.h3,{color:theme.ink}]}>Affected record identities</Text>
    <Text style={[styles.text,{color:theme.muted}]}>Sample IDs for each category, up to 25 per category. “Retiring” and “surviving” show which location currently owns the association; none are discarded automatically.</Text>
    {Object.entries(preview.linked_samples||{}).map(([kind,records])=>records.length>0?<View key={kind} style={{gap:5}}>
      <Text style={[styles.text,{color:theme.ink,fontWeight:'800'}]}>{kind.replaceAll('_',' ')} · {records.length} shown</Text>
      {records.map((linked,i)=><Text key={String(linked.id??i)} style={[styles.text,{color:theme.muted}]}>
        {String(linked.on||'record')}: {String(linked.id||'unknown')}
        {linked.code?' · QR '+String(linked.code):''}
        {linked.external_id?' · '+String(linked.external_id):''}
      </Text>)}
    </View>:null)}
    <Text style={[styles.text,{color:theme.muted}]}>Total dependent source links (including other inventory tables): {preview.source_linked_total}. If any dependents need reconciliation, consolidation is blocked.</Text>
    {(preview.impact||[]).filter(x=>Number(x.source_rows)>0).map((x,i)=>
     <Text key={x.table+x.column+i} style={[styles.text,{color:theme.danger}]}>
      {x.table} · {x.column}: {x.source_rows} source link(s) — {x.handling}
     </Text>)}
    {preview.blockers.length?<View style={styles.section}>
      <Text style={[styles.h3,{color:theme.danger}]}>Blocked — reconciliation required</Text>
      {preview.blockers.map((b,i)=><Text key={i} style={[styles.text,{color:theme.danger}]}>• {b}</Text>)}
    </View>:<View style={[styles.section,{borderColor:theme.line}]}>
      <Text style={[styles.h3,{color:theme.success}]}>Eligible for safe alias consolidation</Text>
      <Text style={[styles.text,{color:theme.ink}]}>The old ID, its full record, source identity and audit snapshot are preserved. The surviving record remains unchanged. No linked user/business data will be rewritten or lost.</Text>
      <Text style={[styles.text,{color:theme.muted}]}>A map-mirror retirement event will be queued; the operation can be reversed.</Text>
      <TextInput accessibilityLabel="Type CONSOLIDATE to approve" value={confirm}
        onChangeText={setConfirm} placeholder="Type CONSOLIDATE" autoCapitalize="characters"
        placeholderTextColor={theme.muted}
        style={[styles.input,{borderColor:theme.line,color:theme.ink,backgroundColor:theme.surfaceRaised}]}/>
      <Pressable accessibilityRole="button" disabled={confirm!=='CONSOLIDATE'||saving||checking}
        onPress={()=>void consolidate()}
        style={[styles.action,colors(confirm==='CONSOLIDATE')]}>
        <Text style={{color:confirm==='CONSOLIDATE'?theme.accentText:theme.ink,fontWeight:'900'}}>{saving?'Consolidating…':'Consolidate and preserve history'}</Text>
      </Pressable>
    </View>}
   </View>:null}
  </View>:null}
 </ScrollView>;
}
const styles=StyleSheet.create({
 page:{padding:16,paddingBottom:90,gap:14},hero:{padding:18,borderRadius:18,gap:8},
 heading:{fontSize:26,fontWeight:'900'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1},
 text:{fontSize:12,lineHeight:19},h3:{fontSize:16,fontWeight:'900'},link:{fontSize:13,fontWeight:'800'},
 panel:{borderWidth:1,padding:14,borderRadius:15,gap:14},
 place:{borderWidth:1,borderRadius:10,padding:11,gap:6},section:{gap:10,paddingTop:10,borderTopWidth:1},
 action:{borderWidth:1,borderRadius:10,padding:12,alignSelf:'flex-start'},
 input:{borderWidth:1,borderRadius:10,padding:12,fontSize:14,minWidth:180},
 alert:{fontSize:13,fontWeight:'800',lineHeight:20},
 countRow:{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap',gap:8},
});