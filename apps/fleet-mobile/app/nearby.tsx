import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useEffect,useMemo,useState } from 'react';
import { Image,Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { FleetMap } from '../components/FleetMap';
import { currentFleetBusinessId,getFleetWorkspaceAccess } from '../services/control';
import { listFleetRouteLocations,routeLocationId,type FleetRouteLocation } from '../services/locations';

const MILES_TO_METERS=1609.344;
const RADII=[5,10,25,50];

export default function FleetNearby(){
 const[workspace,setWorkspace]=useState<any>(null);
 const[center,setCenter]=useState<{latitude:number;longitude:number}|null>(null);
 const[rows,setRows]=useState<FleetRouteLocation[]>([]);
 const[selected,setSelected]=useState('');
 const[query,setQuery]=useState('');
 const[radiusMiles,setRadiusMiles]=useState(10);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('Finding nearby Kleenest locations…');

 async function loadAt(point:{latitude:number;longitude:number},notice=''){
  setBusy(true);
  try{
   const data=await listFleetRouteLocations({latitude:point.latitude,longitude:point.longitude,radiusMeters:Math.round(radiusMiles*MILES_TO_METERS),limit:120});
   setCenter(point);setRows(data);setSelected(current=>data.some(row=>routeLocationId(row)===current)?current:'');
   setMessage(notice||(!data.length?'No Kleenest locations matched this area and radius.':''));
  }catch(e:any){setMessage(e?.message||'Nearby discovery is unavailable.')}finally{setBusy(false)}
 }

 async function useMyLocation(){
  setBusy(true);
  try{
   let permission=await Location.getForegroundPermissionsAsync();
   if(permission.status!=='granted')permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=='granted')throw new Error('Location permission is required for nearby discovery. You can also search an address.');
   const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
   await loadAt({latitude:position.coords.latitude,longitude:position.coords.longitude});
  }catch(e:any){setMessage(e?.message||'Current location is unavailable.');setBusy(false)}
 }

 async function searchArea(){
  const value=query.trim();
  if(!value)return useMyLocation();
  setBusy(true);
  try{
   const matches=await Location.geocodeAsync(value);
   const first=matches[0];
   if(!first)throw new Error('That address or place could not be located.');
   await loadAt({latitude:first.latitude,longitude:first.longitude},'Showing Kleenest locations around “'+value+'”.');
  }catch(e:any){setMessage(e?.message||'Address search failed.');setBusy(false)}
 }

 useEffect(()=>{void(async()=>{try{const id=await currentFleetBusinessId();setWorkspace(await getFleetWorkspaceAccess(id))}catch{}await useMyLocation()})()},[]);
 useEffect(()=>{if(center)void loadAt(center)},[radiusMiles]);

 const chosen=useMemo(()=>rows.find(row=>routeLocationId(row)===selected)||null,[rows,selected]);
 const centerTuple:[number,number]=chosen?[Number(chosen.longitude),Number(chosen.latitude)]:center?[center.longitude,center.latitude]:[-98.5795,39.8283];

 async function navigate(item:FleetRouteLocation){
  const lat=Number(item.latitude),lng=Number(item.longitude);
  const label=encodeURIComponent(String(item.name||item.business_name||'Kleenest location'));
  const url=Platform.OS==='ios'?'maps://?daddr='+lat+','+lng+'&q='+label:'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng;
  await Linking.openURL(url);
 }
 async function openConsumer(){
  const native='kleenest://explore';
  const supported=await Linking.canOpenURL(native).catch(()=>false);
  await Linking.openURL(supported?native:'https://matthagersenior.github.io/Kleenest_Production/?app=1');
 }

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>center?loadAt(center):useMyLocation()}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>KLEENEST FOR ME · FLEET CONNECTED</Text><Text style={s.title}>Find the best stop around you—or anywhere you are headed.</Text><Text style={s.body}>{workspace?.business_name?'Connected to '+workspace.business_name+'. ':''}This uses the same Kleenest location network and business-selected consumer photos while keeping Fleet operational controls separate.</Text></View>
  <View style={s.searchCard}><Text style={s.label}>SEARCH ANY AREA</Text><View style={s.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>void searchArea()} placeholder="Home, work, school, address, city…" style={s.input}/><Pressable onPress={()=>void searchArea()} disabled={busy} style={s.action}><Text style={s.actionText}>Search</Text></Pressable></View><Pressable onPress={()=>void useMyLocation()} disabled={busy} style={s.secondary}><Text style={s.secondaryText}>⌖ Use my location</Text></Pressable><View style={s.chips}>{RADII.map(value=><Pressable key={value} onPress={()=>setRadiusMiles(value)} style={[s.chip,value===radiusMiles&&s.chipOn]}><Text style={[s.chipText,value===radiusMiles&&s.chipTextOn]}>{value} mi</Text></Pressable>)}</View></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {center?<FleetMap center={centerTuple} locations={rows} selectedId={selected} mode="nearby" onSelect={row=>setSelected(routeLocationId(row))}/>:null}
  {chosen?<View style={s.selectedCard}>{chosen.consumer_photo_url?<View><Image source={{uri:String(chosen.consumer_photo_url)}} style={s.heroPhoto}/><View style={s.photoBadge}><Text style={s.photoBadgeText}>LOCATION PHOTO</Text></View></View>:null}<Text style={s.cardTitle}>{String(chosen.name||chosen.business_name||'Kleenest location')}</Text><Text style={s.meta}>{[chosen.address,chosen.city,chosen.state].filter(Boolean).join(', ')||'Address unavailable'}</Text><View style={s.factRow}>{chosen.rating!=null?<Fact label="RATING" value={Number(chosen.rating).toFixed(1)+' ★'}/>:null}<Fact label="DISTANCE" value={distance(chosen.distance_meters)}/><Fact label="ACCESS" value={chosen.accessible?'YES':'—'}/></View><View style={s.actions}><Pressable onPress={()=>void navigate(chosen)} style={s.action}><Text style={s.actionText}>Start navigation</Text></Pressable><Pressable onPress={()=>void openConsumer()} style={s.secondary}><Text style={s.secondaryText}>Open full Kleenest</Text></Pressable></View></View>:null}
  <View style={s.sectionHead}><Text style={s.sectionTitle}>Nearby results</Text><Text style={s.meta}>{rows.length} locations · {radiusMiles} mile radius</Text></View>
  {rows.slice(0,30).map(row=><Pressable key={routeLocationId(row)} onPress={()=>setSelected(routeLocationId(row))} style={[s.result,selected===routeLocationId(row)&&s.resultOn]}>{row.consumer_photo_url?<Image source={{uri:String(row.consumer_photo_url)}} style={s.thumb}/>:<View style={s.thumbFallback}><Text style={s.thumbLetter}>{String(row.name||row.business_name||'K').slice(0,1).toUpperCase()}</Text></View>}<View style={{flex:1,gap:2}}><Text style={s.resultTitle}>{String(row.name||row.business_name||'Kleenest location')}</Text><Text style={s.meta} numberOfLines={2}>{[row.address,row.city,row.state].filter(Boolean).join(', ')||'Address unavailable'}</Text><Text style={s.signal}>{[row.rating!=null?Number(row.rating).toFixed(1)+' ★':null,row.bathroom_verification_status?String(row.bathroom_verification_status).replaceAll('_',' '):null,row.accessible?'Accessible':null].filter(Boolean).join(' · ')||'Kleenest network location'}</Text></View><Text style={s.distance}>{distance(row.distance_meters)}</Text></Pressable>)}
 </ScrollView>
}
function distance(value:number|null|undefined){const meters=Number(value);return Number.isFinite(meters)?(meters/MILES_TO_METERS).toFixed(meters<16093?1:0)+' mi':'—'}
function Fact({label,value}:{label:string;value:string}){return <View style={s.fact}><Text style={s.factValue}>{value}</Text><Text style={s.factLabel}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,paddingBottom:70,backgroundColor:'#f3f6f4'},hero:{backgroundColor:'#173f2d',padding:20,borderRadius:24,gap:8},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#c8e6d4'},title:{fontSize:27,lineHeight:32,fontWeight:'900',color:'#fff'},body:{fontSize:13,lineHeight:20,color:'#deebe4'},searchCard:{backgroundColor:'#fff',borderRadius:18,padding:14,gap:9,borderWidth:1,borderColor:'#d9e3dc'},label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#557060'},searchRow:{flexDirection:'row',gap:8},input:{flex:1,borderWidth:1,borderColor:'#cad8cf',borderRadius:12,padding:11,backgroundColor:'#fafcfb'},action:{backgroundColor:'#173f2d',borderRadius:12,paddingHorizontal:14,paddingVertical:11,alignItems:'center',justifyContent:'center'},actionText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#edf3ef',borderRadius:12,paddingHorizontal:13,paddingVertical:10,alignItems:'center'},secondaryText:{color:'#173f2d',fontWeight:'900'},chips:{flexDirection:'row',gap:7,flexWrap:'wrap'},chip:{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:'#edf3ef'},chipOn:{backgroundColor:'#173f2d'},chipText:{fontWeight:'800',color:'#315440'},chipTextOn:{color:'#fff'},message:{color:'#6d5546',fontWeight:'700'},selectedCard:{backgroundColor:'#fff',borderRadius:19,padding:14,gap:9,borderWidth:1,borderColor:'#d9e3dc'},heroPhoto:{width:'100%',height:190,borderRadius:15,backgroundColor:'#e5ece8'},photoBadge:{position:'absolute',left:9,top:9,backgroundColor:'rgba(23,63,45,.92)',paddingHorizontal:8,paddingVertical:5,borderRadius:999},photoBadgeText:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#fff'},cardTitle:{fontSize:21,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#64756b'},factRow:{flexDirection:'row',gap:7,flexWrap:'wrap'},fact:{flexGrow:1,minWidth:88,backgroundColor:'#edf3ef',borderRadius:12,padding:9},factValue:{fontSize:15,fontWeight:'900',color:'#173f2d'},factLabel:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#62736a'},actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},sectionHead:{marginTop:3,gap:2},sectionTitle:{fontSize:21,fontWeight:'900',color:'#102218'},result:{backgroundColor:'#fff',borderRadius:16,padding:11,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#dbe5de'},resultOn:{borderWidth:2,borderColor:'#173f2d'},thumb:{width:68,height:68,borderRadius:13,backgroundColor:'#e5ece8'},thumbFallback:{width:68,height:68,borderRadius:13,backgroundColor:'#dfe9e2',alignItems:'center',justifyContent:'center'},thumbLetter:{fontSize:24,fontWeight:'900',color:'#173f2d'},resultTitle:{fontSize:15,fontWeight:'900',color:'#102218'},signal:{fontSize:10,fontWeight:'800',color:'#315440'},distance:{fontSize:12,fontWeight:'900',color:'#173f2d'}});
