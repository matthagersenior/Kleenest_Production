import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { clearAppSearchRecents,listNearbyRestrooms,loadAppSearchRecents,rememberAppSearchQuery,searchAppIndex,searchMobilePeople,type AppSearchEntry } from '@kleenest/mobile-core';
import { useConsumerTheme } from '../services/theme';

type Row=Record<string,any>;
export default function GlobalSearch(){
 const theme=useConsumerTheme(),router=useRouter();
 const[query,setQuery]=useState(''),[places,setPlaces]=useState<Row[]>([]),[people,setPeople]=useState<Row[]>([]),[recents,setRecents]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{void loadAppSearchRecents('consumer').then(setRecents)},[]);
 const indexed=useMemo(()=>searchAppIndex('consumer',query,32),[query]);
 async function search(value=query){
  const q=value.trim();setQuery(q);if(q.length<2){setPlaces([]);setPeople([]);return}
  setBusy(true);setMessage('');
  try{
   await rememberAppSearchQuery('consumer',q);setRecents(await loadAppSearchRecents('consumer'));
   const permission=await Location.getForegroundPermissionsAsync().catch(()=>({status:'undetermined'} as any));
   const position=permission.status==='granted'?((await Location.getLastKnownPositionAsync().catch(()=>null))||(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}).catch(()=>null))):null;
   const[placeResult,peopleResult]=await Promise.allSettled([
    position?listNearbyRestrooms(position.coords.latitude,position.coords.longitude,40000,q,[]):Promise.resolve([]),
    searchMobilePeople(q)
   ]);
   setPlaces(placeResult.status==='fulfilled'&&Array.isArray(placeResult.value)?placeResult.value.slice(0,14):[]);
   setPeople(peopleResult.status==='fulfilled'&&Array.isArray(peopleResult.value)?peopleResult.value.slice(0,10):[]);
   if(!position)setMessage('Nearby place matches need location permission. Everything else in Kleenest is still searchable.');
  }finally{setBusy(false)}
 }
 useEffect(()=>{if(query.trim().length<2){setPlaces([]);setPeople([]);return}const id=setTimeout(()=>void search(query),280);return()=>clearTimeout(id)},[query]);
 function go(route:string){if(query.trim())void rememberAppSearchQuery('consumer',query);router.push(route as any)}
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
  <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Text style={[s.eyebrow,{color:theme.accent}]}>SEARCH KLEENEST</Text><Text style={[s.title,{color:theme.ink}]}>Find anything in Kleenest.</Text>
   <Text style={[s.body,{color:theme.muted}]}>Search places, people, features, settings, actions, missions, rewards or ask what something in the app means.</Text>
   <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="Try “freshness”, “add photos later”, or a place…" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
  </View>
  {message?<Text style={[s.message,{color:theme.muted}]}>{message}</Text>:null}
  {!query.trim()&&recents.length?<Section title="Recent searches"><View style={s.chips}>{recents.map(v=><Chip key={v} label={v} onPress={()=>{setQuery(v);void search(v)}} theme={theme}/>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" onPress={async()=>{await clearAppSearchRecents('consumer');setRecents([])}}><Text style={{color:theme.muted,fontWeight:'800'}}>Clear recent searches</Text></Pressable></Section>:null}
  {places.length?<Section title="Places">{places.map(row=>{const id=String(row.location_id||row.id||'');return <Result key={'place:'+id} title={String(row.name||row.location_name||'Restroom')} subtitle={[row.address,row.city,row.state].filter(Boolean).join(', ')||'Kleenest location'} tag="PLACE" onPress={()=>go('/location/'+id)} theme={theme}/>})}</Section>:null}
  {people.length?<Section title="People">{people.map(row=>{const id=String(row.id||row.user_id||'');return <Result key={'person:'+id} title={String(row.display_name||row.username||'Contributor')} subtitle={row.username?'@'+String(row.username).replace(/^@/,''):'Kleenest contributor'} tag="PERSON" onPress={()=>go('/contributor/'+id)} theme={theme}/>})}</Section>:null}
  <Section title={query.trim()?'Kleenest results':'Explore Kleenest'}>{indexed.map(entry=><IndexedResult key={entry.id} entry={entry} onPress={()=>go(entry.route)} theme={theme}/>)}</Section>
  {busy?<ActivityIndicator color={theme.accent}/>:null}
 </ScrollView>
}
function Section({title,children}:{title:string;children:any}){const theme=useConsumerTheme();return <View style={s.section}><Text style={[s.sectionTitle,{color:theme.ink}]}>{title}</Text>{children}</View>}
function Chip({label,onPress,theme}:{label:string;onPress:()=>void;theme:any}){return <Pressable accessibilityRole="button" accessibilityLabel={`Search for ${label}`} onPress={onPress} style={[s.chip,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={{color:theme.ink,fontWeight:'800'}}>{label}</Text></Pressable>}
function IndexedResult({entry,onPress,theme}:{entry:AppSearchEntry;onPress:()=>void;theme:any}){return <Result title={entry.title} subtitle={entry.subtitle} detail={entry.detail} tag={entry.category.toUpperCase()} onPress={onPress} theme={theme}/>}
function Result({title,subtitle,detail,tag,onPress,theme}:{title:string;subtitle:string;detail?:string;tag:string;onPress:()=>void;theme:any}){return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}]}><View style={{flex:1,gap:4}}><Text style={[s.resultTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.meta,{color:theme.muted}]}>{subtitle}</Text>{detail?<Text style={[s.detail,{color:theme.ink}]}>{detail}</Text>:null}</View><Text style={[s.tag,{color:theme.accent,backgroundColor:theme.accentSoft}]}>{tag}</Text></Pressable>}
const s=StyleSheet.create({page:{padding:16,gap:16,paddingBottom:90,minHeight:'100%'},hero:{borderWidth:1,borderRadius:22,padding:16,gap:9},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1},title:{fontSize:28,fontWeight:'900'},body:{fontSize:13,lineHeight:19,fontWeight:'600'},input:{borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:12,fontSize:16},message:{fontWeight:'700'},section:{gap:8},sectionTitle:{fontSize:18,fontWeight:'900'},result:{borderWidth:1,borderRadius:16,padding:13,flexDirection:'row',alignItems:'flex-start',gap:10},resultTitle:{fontSize:15,fontWeight:'900'},meta:{fontSize:12,lineHeight:17},detail:{fontSize:12,lineHeight:18,fontWeight:'600'},tag:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:999},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:11,paddingVertical:8}});