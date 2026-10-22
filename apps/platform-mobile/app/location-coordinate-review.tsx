import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from '../services/ownerAdmin';
import { usePlatformTheme } from '../services/theme';

type CoordinateCase = {
 id:number;location_id:string;name:string;address:string|null;city:string|null;state:string|null;
 source_key:string;external_id:string;issue_kind:string;
 recorded_latitude:number|null;recorded_longitude:number|null;
 proposed_latitude:number|null;proposed_longitude:number|null;distance_m:number|null;
 evidence:Record<string,unknown>;
};
const formatPoint=(lat:number|null,lng:number|null)=>lat==null||lng==null?'No coordinates':lat.toFixed(6)+', '+lng.toFixed(6);
async function showOnMap(lat:number|null,lng:number|null) {
 if(lat==null||lng==null)return;
 await Linking.openURL('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng));
}
export default function CoordinateReview() {
 const theme=usePlatformTheme(),router=useRouter();
 const [cases,setCases]=useState<CoordinateCase[]>([]);
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const load=async()=>{
  setBusy(true);setError('');
  try{
   await requirePlatformOwner();
   const {data,error:rpcError}=await getKleenestSupabaseClient().rpc('owner_location_coordinate_review',{p_limit:100});
   if(rpcError)throw rpcError;
   setCases(Array.isArray(data)?data as CoordinateCase:[]);
  }catch(e:unknown){setError(e instanceof Error?e.message:'Unable to load coordinate reviews');}
  finally{setBusy(false);}
 };
 useEffect(()=>{void load();},[]);
 const resolve=async(item:CoordinateCase,action:'corrected'|'kept'|'different_place')=>{
  if(saving)return;
  setSaving(true);setError('');setMessage('');
  try{
   const {data,error:rpcError}=await getKleenestSupabaseClient().rpc('owner_resolve_location_coordinate_case',{
    p_case_id:item.id,p_action:action,p_note:(notes[item.id]||'').trim(),
   });
   if(rpcError)throw rpcError;
   if(!data)throw new Error('The server did not confirm this review');
   setCases(old=>old.filter(x=>x.id!==item.id));
   setMessage('Case '+item.id+' saved. '+(action==='corrected'?'Source coordinates approved.':'Existing map pin preserved.'));
  }catch(e:unknown){setError(e instanceof Error?e.message:'Unable to save review');}
  finally{setSaving(false);}
 };
 return <ScrollView style={{backgroundColor:theme.canvas}}
  refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load()}/>}
  contentContainerStyle={styles.page}>
  <View style={[styles.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Pressable accessibilityRole="button" onPress={()=>router.back()}>
    <Text style={{color:theme.accent,fontWeight:'800'}}>‹ Duplicate reviews</Text>
   </Pressable>
   <Text style={[styles.title,{color:theme.ink}]}>Wrong map pins</Text>
   <Text style={{color:theme.muted}}>Compare coordinates, verify place identity and decide what Kleenest should show. Disagreements are ordered by distance. No unknown location is moved without review.</Text>
   <Text style={{color:theme.ink,fontWeight:'800'}}>{busy?'Loading…':cases.length+' open cases loaded (up to 100)'}</Text>
  </View>
  {busy?<ActivityIndicator color={theme.accent}/>:null}
  {error?<Text style={{color:theme.danger,fontWeight:'700'}}>{error}</Text>:null}
  {message?<Text style={{color:theme.success,fontWeight:'700'}}>{message}</Text>:null}
  {!busy&&cases.length===0?<Text style={{color:theme.muted}}>No pending cases.</Text>:null}
  {cases.map(item=>{
   const same=String(item.evidence?.same_source_identity)==='true';
   const canApply=same&&item.issue_kind==='source_coordinate_disagreement'&&item.distance_m!=null&&item.distance_m<=250&&item.proposed_latitude!=null&&item.proposed_longitude!=null;
   const note=(notes[item.id]||'').trim(),enabled=note.length>=8&&!saving;
   return <View key={item.id} style={[styles.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <Text style={[styles.label,{color:theme.accent}]}>CASE #{item.id} · {item.issue_kind==='address_status_disagreement'?'STORE / ADDRESS MISMATCH':'COORDINATE MISMATCH'}</Text>
    <Text style={[styles.place,{color:theme.ink}]}>{item.name}</Text>
    <Text style={{color:theme.muted}}>{[item.address,item.city,item.state].filter(Boolean).join(', ')}</Text>
    <Text style={{color:theme.ink,fontWeight:'700'}}>{item.distance_m==null?'Location status requires verification':Math.round(item.distance_m).toLocaleString()+' meters apart'} · {item.source_key}</Text>
    <View style={styles.compare}>
     <View style={{flex:1,gap:5}}>
      <Text style={[styles.label,{color:theme.muted}]}>CURRENT PIN</Text>
      <Text style={{color:theme.ink}}>{formatPoint(item.recorded_latitude,item.recorded_longitude)}</Text>
      <Pressable accessibilityRole="link" onPress={()=>void showOnMap(item.recorded_latitude,item.recorded_longitude)}><Text style={{color:theme.accent,fontWeight:'800'}}>View current ↗</Text></Pressable>
     </View>
     <View style={{flex:1,gap:5}}>
      <Text style={[styles.label,{color:theme.muted}]}>SOURCE PROPOSAL</Text>
      <Text style={{color:theme.ink}}>{formatPoint(item.proposed_latitude,item.proposed_longitude)}</Text>
      {item.proposed_latitude!=null&&item.proposed_longitude!=null?<Pressable accessibilityRole="link" onPress={()=>void showOnMap(item.proposed_latitude,item.proposed_longitude)}><Text style={{color:theme.accent,fontWeight:'800'}}>View proposed ↗</Text></Pressable>:null}
     </View>
    </View>
    <Text style={{color:theme.muted,fontSize:12}}>{item.issue_kind==='address_status_disagreement'
     ?'Official store directory lists '+String(item.evidence?.official_address||'different address')+'. Verify whether this is a former or separate location before any map changes.'
     :same?'Source identity matches the canonical place record.':'Source identity does not match. Investigate before relocating the pin.'}</Text>
    <TextInput accessible accessibilityLabel={'Review reason for case '+item.id}
     placeholder="Evidence and reason (required)" placeholderTextColor={theme.muted}
     multiline style={[styles.input,{borderColor:theme.line,backgroundColor:theme.surfaceRaised,color:theme.ink}]}
     value={notes[item.id]||''} onChangeText={value=>setNotes(old=>({...old,[item.id]:value}))}/>
    <View style={styles.actions}>
     {canApply?<Pressable accessibilityRole="button" disabled={!enabled} style={[styles.action,{backgroundColor:theme.accent,opacity:enabled?1:0.4}]} onPress={()=>void resolve(item,'corrected')}><Text style={{fontWeight:'800',color:theme.accentText}}>Apply source pin</Text></Pressable>:null}
     <Pressable accessibilityRole="button" disabled={!enabled} style={[styles.action,{borderWidth:1,borderColor:theme.line,opacity:enabled?1:0.4}]} onPress={()=>void resolve(item,'kept')}><Text style={{color:theme.ink,fontWeight:'800'}}>Keep current</Text></Pressable>
     <Pressable accessibilityRole="button" disabled={!enabled} style={[styles.action,{borderWidth:1,borderColor:theme.line,opacity:enabled?1:0.4}]} onPress={()=>void resolve(item,'different_place')}><Text style={{color:theme.ink,fontWeight:'800'}}>Different place</Text></Pressable>
    </View>
   </View>;
  })}
 </ScrollView>;
}
const styles=StyleSheet.create({
 page:{padding:16,paddingBottom:80,gap:14},
 card:{padding:15,borderRadius:16,borderWidth:1,gap:10},
 title:{fontSize:25,fontWeight:'900'},
 place:{fontSize:19,fontWeight:'900'},
 label:{fontSize:11,fontWeight:'900',letterSpacing:.6},
 compare:{flexDirection:'row',gap:12},
 input:{borderWidth:1,borderRadius:10,minHeight:64,padding:12,textAlignVertical:'top'},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
 action:{paddingHorizontal:11,paddingVertical:10,borderRadius:10},
});
