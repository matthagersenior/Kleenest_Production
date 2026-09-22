import { useRouter } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { clearAppSearchRecents,loadAppSearchRecents,loadCapabilitySearchEntries,rememberAppSearchQuery,searchAppIndex,type AppSearchEntry,type CapabilitySearchEntry } from '@kleenest/mobile-core';
import { currentBusinessId,searchClaimableLocations,searchContributors } from '../services/capabilityWorkflows';
import { useBusinessTheme } from '../services/theme';

type Row=Record<string,any>;
export default function GlobalSearch(){
 const theme=useBusinessTheme(),router=useRouter();
 const[query,setQuery]=useState(''),[locations,setLocations]=useState<Row[]>([]),[people,setPeople]=useState<Row[]>([]),[recents,setRecents]=useState<string[]>([]),[busy,setBusy]=useState(false);
 const[capabilities,setCapabilities]=useState<CapabilitySearchEntry[]>([]);
 useEffect(()=>{void loadCapabilitySearchEntries('business').then(setCapabilities)},[]);
 useEffect(()=>{void loadAppSearchRecents('business').then(setRecents)},[]);
 const indexed=useMemo(()=>searchAppIndex('business',query,34,capabilities),[query,capabilities]);
 async function search(value=query){
  const q=value.trim();setQuery(q);if(q.length<2){setLocations([]);setPeople([]);return}
  setBusy(true);
  try{
   await rememberAppSearchQuery('business',q);setRecents(await loadAppSearchRecents('business'));
   const id=await currentBusinessId();
   const[a,b]=await Promise.allSettled([searchClaimableLocations(id,q),searchContributors(q)]);
   setLocations(a.status==='fulfilled'&&Array.isArray(a.value)?a.value.slice(0,12):[]);
   setPeople(b.status==='fulfilled'&&Array.isArray(b.value)?b.value.slice(0,10):[]);
  }finally{setBusy(false)}
 }
 useEffect(()=>{if(query.trim().length<2){setLocations([]);setPeople([]);return}const id=setTimeout(()=>void search(query),280);return()=>clearTimeout(id)},[query]);
 function go(route:string){if(query.trim())void rememberAppSearchQuery('business',query);router.push(route as any)}
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
  <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Text style={[s.eyebrow,{color:theme.accent}]}>SEARCH BUSINESS</Text><Text style={[s.title,{color:theme.ink}]}>Find anything in Business.</Text>
   <Text style={[s.body,{color:theme.muted}]}>Search locations, people, controls, QR tools, analytics, settings, or how a Business feature works.</Text>
   <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="Try “sponsored ads”, “campaigns”, a location, or team member…" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
  </View>
  {!query.trim()&&recents.length?<Section title="Recent searches"><View style={s.chips}>{recents.map(v=><Chip key={v} label={v} onPress={()=>{setQuery(v);void search(v)}} theme={theme}/>)}</View><Pressable onPress={async()=>{await clearAppSearchRecents('business');setRecents([])}}><Text style={{color:theme.muted,fontWeight:'800'}}>Clear recent searches</Text></Pressable></Section>:null}
  {locations.length?<Section title="Locations">{locations.map(row=>{const id=String(row.id||row.location_id||'');const name=String(row.name||row.location_name||'Location');return <Result key={'loc:'+id} title={name} subtitle={[row.address,row.city,row.state].filter(Boolean).join(', ')||'Kleenest location'} tag="LOCATION" onPress={()=>go('/locations?claimLocationId='+encodeURIComponent(id)+'&claimName='+encodeURIComponent(name))} theme={theme}/>})}</Section>:null}
  {people.length?<Section title="People">{people.map(row=>{const id=String(row.id||row.user_id||'');const name=String(row.display_name||row.username||row.full_name||'Contributor');return <Result key={'person:'+id} title={name} subtitle={String(row.username||row.email||'Kleenest account')} tag="PERSON" onPress={()=>go('/members')} theme={theme}/>})}</Section>:null}
  <Section title={query.trim()?'Business results':'Explore Business'}>{indexed.map(entry=><IndexedResult key={entry.id} entry={entry} onPress={()=>go(entry.route)} theme={theme}/>)}</Section>
  {busy?<ActivityIndicator/>:null}
 </ScrollView>
}
function Section({title,children}:{title:string;children:any}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>}
function Chip({label,onPress,theme}:{label:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.chip,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={{color:theme.ink,fontWeight:'800'}}>{label}</Text></Pressable>}
function IndexedResult({entry,onPress,theme}:{entry:AppSearchEntry;onPress:()=>void;theme:any}){return <Result title={entry.title} subtitle={entry.subtitle} detail={entry.detail} tag={entry.category.toUpperCase()} onPress={onPress} theme={theme}/>}
function Result({title,subtitle,detail,tag,onPress,theme}:{title:string;subtitle:string;detail?:string;tag:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}]}><View style={{flex:1,gap:4}}><Text style={[s.resultTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.meta,{color:theme.muted}]}>{subtitle}</Text>{detail?<Text style={[s.detail,{color:theme.ink}]}>{detail}</Text>:null}</View><Text style={[s.tag,{color:theme.accent,backgroundColor:theme.accentSoft}]}>{tag}</Text></Pressable>}
const s=StyleSheet.create({page:{padding:16,gap:16,paddingBottom:90,minHeight:'100%'},hero:{borderWidth:1,borderRadius:22,padding:16,gap:9},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1},title:{fontSize:27,fontWeight:'900'},body:{fontSize:13,lineHeight:19,fontWeight:'600'},input:{borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:12,fontSize:16},section:{gap:8},sectionTitle:{fontSize:18,fontWeight:'900'},result:{borderWidth:1,borderRadius:16,padding:13,flexDirection:'row',alignItems:'flex-start',gap:10},resultTitle:{fontSize:15,fontWeight:'900'},meta:{fontSize:12,lineHeight:17},detail:{fontSize:12,lineHeight:18,fontWeight:'600'},tag:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:999},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:11,paddingVertical:8}});