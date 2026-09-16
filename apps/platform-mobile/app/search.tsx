import { useRouter } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { clearAppSearchRecents,loadAppSearchRecents,rememberAppSearchQuery,searchAppIndex,type AppSearchEntry } from '@kleenest/mobile-core';
import { searchOwnerUsers } from '../services/ownerAdmin';
import { searchOwnerBusinesses } from '../services/ownerBusinesses';
import { getOwnerCreatorMissionAttributionSummary } from '../services/ownerEconomy';
import { usePlatformTheme } from '../services/theme';

type Row=Record<string,any>;
export default function GlobalSearch(){
 const theme=usePlatformTheme(),router=useRouter();
 const[query,setQuery]=useState(''),[people,setPeople]=useState<Row[]>([]),[businesses,setBusinesses]=useState<Row[]>([]),[missions,setMissions]=useState<Row[]>([]),[allMissions,setAllMissions]=useState<Row[]>([]),[recents,setRecents]=useState<string[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{void loadAppSearchRecents('owner').then(setRecents);void getOwnerCreatorMissionAttributionSummary(366).then(v=>setAllMissions(Array.isArray(v.missions)?v.missions:[])).catch(()=>{})},[]);
 const indexed=useMemo(()=>searchAppIndex('owner',query,38),[query]);
 async function search(value=query){
  const q=value.trim();setQuery(q);if(q.length<2){setPeople([]);setBusinesses([]);setMissions([]);return}
  setBusy(true);
  try{
   await rememberAppSearchQuery('owner',q);setRecents(await loadAppSearchRecents('owner'));
   const[a,b]=await Promise.allSettled([searchOwnerUsers(q),searchOwnerBusinesses(q)]);
   setPeople(a.status==='fulfilled'&&Array.isArray(a.value)?a.value.slice(0,10):[]);
   setBusinesses(b.status==='fulfilled'&&Array.isArray(b.value)?b.value.slice(0,10):[]);
   const nq=q.toLowerCase();
   setMissions(allMissions.filter((r:Row)=>[r.creator_name,r.creator_handle,r.title,r.mission_code,r.tracking_slug,r.status].filter(Boolean).join(' ').toLowerCase().includes(nq)).slice(0,12));
  }finally{setBusy(false)}
 }
 useEffect(()=>{if(query.trim().length<2){setPeople([]);setBusinesses([]);setMissions([]);return}const id=setTimeout(()=>void search(query),260);return()=>clearTimeout(id)},[query,allMissions]);
 function go(route:string){if(query.trim())void rememberAppSearchQuery('owner',query);router.push(route as any)}
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
  <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Text style={[s.eyebrow,{color:theme.accent}]}>SEARCH KLEENESTOS</Text><Text style={[s.title,{color:theme.ink}]}>Find anything in Owner.</Text>
   <Text style={[s.body,{color:theme.muted}]}>Search people, businesses, creator missions, platform controls, data surfaces, settings, or ask what a KleenestOS feature does.</Text>
   <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="Try “creator QR”, a user, business, capability, or report…" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
  </View>
  {!query.trim()&&recents.length?<Section title="Recent searches"><View style={s.chips}>{recents.map(v=><Chip key={v} label={v} onPress={()=>{setQuery(v);void search(v)}} theme={theme}/>)}</View><Pressable onPress={async()=>{await clearAppSearchRecents('owner');setRecents([])}}><Text style={{color:theme.muted,fontWeight:'800'}}>Clear recent searches</Text></Pressable></Section>:null}
  {people.length?<Section title="People">{people.map(r=>{const id=String(r.id||r.user_id||'');const name=String(r.display_name||r.username||r.email||'Account');return <Result key={'p:'+id} title={name} subtitle={String(r.email||r.username||r.role||'Kleenest account')} tag="PERSON" onPress={()=>go('/access')} theme={theme}/>})}</Section>:null}
  {businesses.length?<Section title="Businesses">{businesses.map(r=>{const id=String(r.id||r.business_id||'');const name=String(r.name||r.business_name||'Business');return <Result key={'b:'+id} title={name} subtitle={[r.business_tier,r.verification_status,Number(r.location_count||0)+' locations'].filter(Boolean).join(' · ')} tag="BUSINESS" onPress={()=>go('/businesses')} theme={theme}/>})}</Section>:null}
  {missions.length?<Section title="Creator missions">{missions.map(r=><Result key={'m:'+String(r.assignment_id||r.mission_code)} title={String(r.title||'Creator mission')} subtitle={[r.creator_name,r.creator_handle,r.status].filter(Boolean).join(' · ')} detail={r.tracking_slug?'Tracking: '+String(r.tracking_slug):undefined} tag="MISSION" onPress={()=>go('/progression')} theme={theme}/>)}</Section>:null}
  <Section title={query.trim()?'KleenestOS results':'Explore KleenestOS'}>{indexed.map(entry=><IndexedResult key={entry.id} entry={entry} onPress={()=>go(entry.route)} theme={theme}/>)}</Section>
  {busy?<ActivityIndicator/>:null}
 </ScrollView>
}
function Section({title,children}:{title:string;children:any}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>}
function Chip({label,onPress,theme}:{label:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.chip,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={{color:theme.ink,fontWeight:'800'}}>{label}</Text></Pressable>}
function IndexedResult({entry,onPress,theme}:{entry:AppSearchEntry;onPress:()=>void;theme:any}){return <Result title={entry.title} subtitle={entry.subtitle} detail={entry.detail} tag={entry.category.toUpperCase()} onPress={onPress} theme={theme}/>}
function Result({title,subtitle,detail,tag,onPress,theme}:{title:string;subtitle:string;detail?:string;tag:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}]}><View style={{flex:1,gap:4}}><Text style={[s.resultTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.meta,{color:theme.muted}]}>{subtitle}</Text>{detail?<Text style={[s.detail,{color:theme.ink}]}>{detail}</Text>:null}</View><Text style={[s.tag,{color:theme.accent,backgroundColor:theme.accentSoft}]}>{tag}</Text></Pressable>}
const s=StyleSheet.create({page:{padding:16,gap:16,paddingBottom:90,minHeight:'100%'},hero:{borderWidth:1,borderRadius:22,padding:16,gap:9},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1},title:{fontSize:27,fontWeight:'900'},body:{fontSize:13,lineHeight:19,fontWeight:'600'},input:{borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:12,fontSize:16},section:{gap:8},sectionTitle:{fontSize:18,fontWeight:'900'},result:{borderWidth:1,borderRadius:16,padding:13,flexDirection:'row',alignItems:'flex-start',gap:10},resultTitle:{fontSize:15,fontWeight:'900'},meta:{fontSize:12,lineHeight:17},detail:{fontSize:12,lineHeight:18,fontWeight:'600'},tag:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:999},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:11,paddingVertical:8}});