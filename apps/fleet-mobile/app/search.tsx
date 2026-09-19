import { useRouter } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { clearAppSearchRecents,loadAppSearchRecents,loadCapabilitySearchEntries,rememberAppSearchQuery,searchAppIndex,type AppSearchEntry,type CapabilitySearchEntry } from '@kleenest/mobile-core';
import { currentFleetBusinessId,getFleetInventory,getFleetWorkspaceAccess } from '../services/control';
import { useFleetTheme } from '../services/theme';

type Row=Record<string,any>;
const MEMBER_ALLOWED=new Set(['/nearby','/notifications','/account','/workspaces','/support']);
function rowText(row:Row){return [row.name,row.unit_code,row.email,row.phone,row.status,row.title,row.message,row.description,row.route_name].filter(Boolean).join(' ').toLowerCase();}
export default function GlobalSearch(){
 const theme=useFleetTheme(),router=useRouter();
 const[query,setQuery]=useState(''),[inventory,setInventory]=useState<any>(null),[role,setRole]=useState('member'),[recents,setRecents]=useState<string[]>([]),[busy,setBusy]=useState(true);
 const[capabilities,setCapabilities]=useState<CapabilitySearchEntry[]>([]);
 useEffect(()=>{void loadCapabilitySearchEntries('fleet').then(setCapabilities)},[]);
 useEffect(()=>{void (async()=>{setRecents(await loadAppSearchRecents('fleet'));try{const id=await currentFleetBusinessId();const[a,b]=await Promise.all([getFleetWorkspaceAccess(id),getFleetInventory(id)]);setRole(String(a.workspace_role||'member'));setInventory(b)}finally{setBusy(false)}})()},[]);
 const operator=role==='operator';
 const indexed=useMemo(()=>searchAppIndex('fleet',query,34,capabilities).filter(entry=>operator||MEMBER_ALLOWED.has(entry.route)),[query,operator,capabilities]);
 const q=query.trim().toLowerCase();
 const match=(rows:any[])=>q.length<2?[]:(Array.isArray(rows)?rows:[]).filter((row:Row)=>rowText(row).includes(q)).slice(0,12);
 const vehicles=match(inventory?.vehicles),drivers=match(inventory?.drivers),routes=match(inventory?.routes),alerts=match(inventory?.alerts);
 async function remember(){if(query.trim()){await rememberAppSearchQuery('fleet',query);setRecents(await loadAppSearchRecents('fleet'))}}
 function go(route:string){void remember();router.push(route as any)}
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
  <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Text style={[s.eyebrow,{color:theme.accent}]}>SEARCH KLEENEST FLEET</Text><Text style={[s.title,{color:theme.ink}]}>Find worker utility, routes and infrastructure intelligence.</Text>
   <Text style={[s.body,{color:theme.muted}]}>{operator?'Search Route Relief, trusted-stop intelligence, routes, drivers, vehicles, alerts, access controls and operating policies.':'Search Route Relief, trusted stops, alerts, account and the Fleet features available to your role.'}</Text>
   <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={()=>void remember()} placeholder={operator?'Try “Route Relief”, “coverage”, a driver, route, or geofencing…':'Try “Route Relief”, “trusted stop”, or “alerts”…'} placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
  </View>
  {!query.trim()&&recents.length?<Section title="Recent searches"><View style={s.chips}>{recents.map(v=><Chip key={v} label={v} onPress={()=>setQuery(v)} theme={theme}/>)}</View><Pressable onPress={async()=>{await clearAppSearchRecents('fleet');setRecents([])}}><Text style={{color:theme.muted,fontWeight:'800'}}>Clear recent searches</Text></Pressable></Section>:null}
  {operator&&vehicles.length?<Section title="Vehicles">{vehicles.map((r:Row)=><Result key={'v:'+String(r.id)} title={String(r.name||r.unit_code||'Vehicle')} subtitle={[r.unit_code,r.vehicle_type,r.status].filter(Boolean).join(' · ')} tag="VEHICLE" onPress={()=>go('/assets')} theme={theme}/>)}</Section>:null}
  {operator&&drivers.length?<Section title="Drivers">{drivers.map((r:Row)=><Result key={'d:'+String(r.id)} title={String(r.name||r.display_name||'Driver')} subtitle={[r.email,r.phone,r.status].filter(Boolean).join(' · ')} tag="DRIVER" onPress={()=>go('/assets')} theme={theme}/>)}</Section>:null}
  {operator&&routes.length?<Section title="Routes">{routes.map((r:Row)=><Result key={'r:'+String(r.id)} title={String(r.name||r.route_name||'Route')} subtitle={[r.status,r.scheduled_for].filter(Boolean).join(' · ')} tag="ROUTE" onPress={()=>go('/planner')} theme={theme}/>)}</Section>:null}
  {operator&&alerts.length?<Section title="Alerts">{alerts.map((r:Row,index:number)=><Result key={'a:'+String(r.id||index)} title={String(r.title||r.alert_type||'Fleet alert')} subtitle={String(r.message||r.description||r.status||'')} tag="ALERT" onPress={()=>go('/notifications')} theme={theme}/>)}</Section>:null}
  <Section title={query.trim()?'Fleet results':'Explore Fleet'}>{indexed.map(entry=><IndexedResult key={entry.id} entry={entry} onPress={()=>go(entry.route)} theme={theme}/>)}</Section>
  {busy?<ActivityIndicator/>:null}
 </ScrollView>
}
function Section({title,children}:{title:string;children:any}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>}
function Chip({label,onPress,theme}:{label:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.chip,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={{color:theme.ink,fontWeight:'800'}}>{label}</Text></Pressable>}
function IndexedResult({entry,onPress,theme}:{entry:AppSearchEntry;onPress:()=>void;theme:any}){return <Result title={entry.title} subtitle={entry.subtitle} detail={entry.detail} tag={entry.category.toUpperCase()} onPress={onPress} theme={theme}/>}
function Result({title,subtitle,detail,tag,onPress,theme}:{title:string;subtitle:string;detail?:string;tag:string;onPress:()=>void;theme:any}){return <Pressable onPress={onPress} style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}]}><View style={{flex:1,gap:4}}><Text style={[s.resultTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.meta,{color:theme.muted}]}>{subtitle}</Text>{detail?<Text style={[s.detail,{color:theme.ink}]}>{detail}</Text>:null}</View><Text style={[s.tag,{color:theme.accent,backgroundColor:theme.accentSoft}]}>{tag}</Text></Pressable>}
const s=StyleSheet.create({page:{padding:16,gap:16,paddingBottom:90,minHeight:'100%'},hero:{borderWidth:1,borderRadius:22,padding:16,gap:9},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1},title:{fontSize:27,fontWeight:'900'},body:{fontSize:13,lineHeight:19,fontWeight:'600'},input:{borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:12,fontSize:16},section:{gap:8},sectionTitle:{fontSize:18,fontWeight:'900'},result:{borderWidth:1,borderRadius:16,padding:13,flexDirection:'row',alignItems:'flex-start',gap:10},resultTitle:{fontSize:15,fontWeight:'900'},meta:{fontSize:12,lineHeight:17},detail:{fontSize:12,lineHeight:18,fontWeight:'600'},tag:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:999},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:11,paddingVertical:8}});