import * as Location from 'expo-location';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { FleetMap,FleetSelectedLocationCard } from '../components/FleetMap';
import { createRoute } from '../services/product';
import { currentFleetBusinessId,getFleetInventory,getFleetRouteGeofences,setRouteStops,updateRoute } from '../services/control';
import { deleteRoute } from '../services/parity';
import { listFleetRouteLocations,routeLocationId,type FleetRouteLocation } from '../services/locations';

type Row=Record<string,any>;
type DraftStop={
 key:string;
 location_id:string|null;
 source_kind:'canonical'|'adhoc';
 stop_name:string;
 stop_address:string;
 latitude:number|null;
 longitude:number|null;
 geofence_radius_m:number;
 notify_arrival:boolean;
 notify_departure:boolean;
 notify_dwell:boolean;
};
const FALLBACK={latitude:39.8283,longitude:-98.5795,fallback:true};
const choices=[['5 mi',8047],['10 mi',16093],['25 mi',40234],['50 mi',80467],['100 mi',160934],['National',4500000]] as const;
const geofenceChoices=[75,150,300,500] as const;
const canonicalKey=(id:string)=>`loc:${id}`;
const savedStopKey=(row:Row)=>row.location_id?canonicalKey(String(row.location_id)):`adhoc-stop:${String(row.id)}`;
const candidateKey=(item:FleetRouteLocation)=>item.source_kind==='adhoc'?routeLocationId(item):canonicalKey(routeLocationId(item));

function detailsFromSaved(row:Row):DraftStop{
 const key=savedStopKey(row);
 return{
  key,
  location_id:row.location_id?String(row.location_id):null,
  source_kind:String(row.stop_kind||row.metadata?.source_kind||'canonical')==='adhoc'?'adhoc':'canonical',
  stop_name:String(row.stop_name||row.location_name||row.name||'Route stop'),
  stop_address:String(row.stop_address||row.address||''),
  latitude:Number.isFinite(Number(row.latitude))?Number(row.latitude):null,
  longitude:Number.isFinite(Number(row.longitude))?Number(row.longitude):null,
  geofence_radius_m:Math.max(25,Math.min(Number(row.geofence_radius_m||150),5000)),
  notify_arrival:row.notify_arrival!==false,
  notify_departure:row.notify_departure!==false,
  notify_dwell:Boolean(row.notify_dwell),
 };
}

function detailsFromLocation(item:FleetRouteLocation):DraftStop{
 const key=candidateKey(item);
 return{
  key,
  location_id:item.source_kind==='adhoc'?null:routeLocationId(item),
  source_kind:item.source_kind==='adhoc'?'adhoc':'canonical',
  stop_name:String(item.name||item.address||'Route stop'),
  stop_address:[item.address,item.city,item.state].filter(Boolean).join(', '),
  latitude:Number(item.latitude),
  longitude:Number(item.longitude),
  geofence_radius_m:150,
  notify_arrival:true,
  notify_departure:true,
  notify_dwell:false,
 };
}

export default function Planner(){
 const[businessId,setBusinessId]=useState('');
 const[inventory,setInventory]=useState<any>(null);
 const[routeId,setRouteId]=useState('');
 const[draft,setDraft]=useState<string[]>([]);
 const[draftDetails,setDraftDetails]=useState<Record<string,DraftStop>>({});
 const[origin,setOrigin]=useState(FALLBACK);
 const[radius,setRadius]=useState(80467);
 const[query,setQuery]=useState('');
 const[locations,setLocations]=useState<FleetRouteLocation[]>([]);
 const[selected,setSelected]=useState('');
 const[routeName,setRouteName]=useState('');
 const[routeEditName,setRouteEditName]=useState('');
 const[vehicleId,setVehicleId]=useState('');
 const[driverId,setDriverId]=useState('');
 const[busy,setBusy]=useState(false);
 const[searching,setSearching]=useState(false);
 const[mapInteracting,setMapInteracting]=useState(false);
 const[message,setMessage]=useState('Loading route planner…');

 function hydrateDraft(inv:any,nextId:string){
  const rows=((inv?.stops||[]) as Row[])
   .filter(row=>String(row.route_id)===nextId)
   .sort((a,b)=>Number(a.stop_order||0)-Number(b.stop_order||0));
  const details:Record<string,DraftStop>={};
  const keys=rows.map(row=>{const detail=detailsFromSaved(row);details[detail.key]=detail;return detail.key;});
  setDraft(keys);
  setDraftDetails(details);
 }

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentFleetBusinessId();
   setBusinessId(id);
   const inv=await getFleetInventory(id);
   setInventory(inv);
   const routes=inv.routes as Row[];
   const nextId=routeId&&routes.some(r=>String(r.id)===routeId)?routeId:String(routes[0]?.id||'');
   setRouteId(nextId);
   const route=routes.find(r=>String(r.id)===nextId);
   setRouteEditName(String(route?.name||''));
   hydrateDraft(inv,nextId);
   setMessage(inv.alertsWarning||'');
  }catch(e:any){
   setMessage(e?.message||'Route planner unavailable.');
  }finally{
   setBusy(false);
  }
 }

 async function canonicalLocations(){
  return listFleetRouteLocations({
   latitude:origin.latitude,
   longitude:origin.longitude,
   radiusMeters:radius,
   search:query,
   limit:180
  });
 }

 async function loadLocations(){
  try{
   const rows=await canonicalLocations();
   setLocations(rows);
   setSelected(current=>rows.some(row=>routeLocationId(row)===current)?current:'');
  }catch(e:any){
   setMessage(e?.message||'Route locations unavailable.');
  }
 }

 async function geocodeAdHoc(search:string):Promise<FleetRouteLocation|null>{
  const text=search.trim();
  if(text.length<3)return null;
  try{
   let permission=await Location.getForegroundPermissionsAsync();
   if(permission.status!=='granted')permission=await Location.requestForegroundPermissionsAsync();
   const matches=await Location.geocodeAsync(text);
   const first=matches[0];
   if(!first)return null;
   let display=text;
   try{
    const reverse=await Location.reverseGeocodeAsync({latitude:first.latitude,longitude:first.longitude});
    const hit=reverse[0];
    if(hit){
     const parts=[hit.name,hit.street,hit.city,hit.region,hit.postalCode].filter(Boolean);
     if(parts.length)display=parts.join(', ');
    }
   }catch{}
   return{
    location_id:`adhoc:${first.latitude.toFixed(6)}:${first.longitude.toFixed(6)}`,
    place_id:null,
    source_kind:'adhoc',
    ad_hoc:true,
    name:text,
    address:display,
    city:null,
    state:null,
    latitude:first.latitude,
    longitude:first.longitude,
    distance_meters:null,
    place_type:'ad_hoc',
   };
  }catch{
   return null;
  }
 }

 async function searchStops(){
  setSearching(true);
  try{
   const [canonical,adHoc]=await Promise.all([canonicalLocations(),geocodeAdHoc(query)]);
   const rows=adHoc?[adHoc,...canonical]:canonical;
   setLocations(rows);
   if(adHoc)setSelected(routeLocationId(adHoc));
   else setSelected(current=>rows.some(row=>routeLocationId(row)===current)?current:'');
   setMessage(adHoc
    ?'Canonical Kleenest matches are shown with a geocoded ad-hoc option. Ad-hoc stops remain operational even before they become canonical.'
    :canonical.length?'':'No canonical or geocoded match found.');
  }catch(e:any){
   setMessage(e?.message||'Route stop search failed.');
  }finally{
   setSearching(false);
  }
 }

 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  Location.requestForegroundPermissionsAsync().then(async permission=>{
   if(permission.status!=='granted')return;
   const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
   setOrigin({latitude:position.coords.latitude,longitude:position.coords.longitude,fallback:false});
  }).catch(()=>{});
 },[]);
 useEffect(()=>{void loadLocations()},[origin.latitude,origin.longitude,radius]);

 const routes=useMemo(()=>(inventory?.routes||[]) as Row[],[inventory]);
 const vehicles=useMemo(()=>(inventory?.vehicles||[]) as Row[],[inventory]);
 const drivers=useMemo(()=>(inventory?.drivers||[]) as Row[],[inventory]);
 const selectedRoute=routes.find(r=>String(r.id)===routeId);
 const selectedLocation=locations.find(row=>routeLocationId(row)===selected)||null;
 const locked=selectedRoute?['dispatched','active','in_progress','completed'].includes(String(selectedRoute.status)):false;
 const canonicalStopIds=draft.map(key=>draftDetails[key]?.location_id).filter(Boolean) as string[];

 function toggleLocation(item:FleetRouteLocation){
  if(!routeId)return setMessage('Create or select a route before adding stops.');
  if(locked)return setMessage('Dispatched route stop order is locked.');
  const detail=detailsFromLocation(item);
  setDraft(current=>{
   if(current.includes(detail.key)){
    setDraftDetails(previous=>{const next={...previous};delete next[detail.key];return next;});
    return current.filter(value=>value!==detail.key);
   }
   setDraftDetails(previous=>({...previous,[detail.key]:detail}));
   return[...current,detail.key];
  });
 }

 function removeStop(key:string){
  if(locked)return;
  setDraft(current=>current.filter(value=>value!==key));
  setDraftDetails(previous=>{const next={...previous};delete next[key];return next;});
 }

 function updateStop(key:string,patch:Partial<DraftStop>){
  if(locked)return;
  setDraftDetails(previous=>previous[key]?({...previous,[key]:{...previous[key],...patch}}):previous);
 }

 function moveStop(index:number,delta:number){
  if(locked)return;
  setDraft(current=>{
   const nextIndex=index+delta;
   if(nextIndex<0||nextIndex>=current.length)return current;
   const next=[...current];
   [next[index],next[nextIndex]]=[next[nextIndex],next[index]];
   return next;
  });
 }

 async function run(fn:()=>Promise<unknown>,success:string){
  setBusy(true);
  try{await fn();setMessage(success);await load();}
  catch(e:any){setMessage(e?.message||'Route action failed.');}
  finally{setBusy(false);}
 }

 async function create(){
  if(!routeName.trim())return setMessage('Give the route a useful name.');
  setBusy(true);
  try{
   const created:any=await createRoute(businessId,{name:routeName.trim(),vehicleId:vehicleId||null,driverId:driverId||null});
   setRouteName('');setVehicleId('');setDriverId('');
   if(created?.id)setRouteId(String(created.id));
   setDraft([]);setDraftDetails({});
   setMessage('Route created. Add canonical or ad-hoc stops, then configure each stop geofence.');
   await load();
  }catch(e:any){
   setMessage(e?.message||'Route could not be created.');
  }finally{setBusy(false);}
 }

 async function save(){
  if(!routeId||!draft.length)return setMessage('Select a route and add at least one stop.');
  const stops=draft.map(key=>draftDetails[key]).filter(Boolean).map(stop=>({
   location_id:stop.location_id,
   source_kind:stop.source_kind,
   stop_name:stop.stop_name,
   stop_address:stop.stop_address,
   latitude:stop.latitude,
   longitude:stop.longitude,
   geofence_radius_m:stop.geofence_radius_m,
   notify_arrival:stop.notify_arrival,
   notify_departure:stop.notify_departure,
   notify_dwell:stop.notify_dwell,
   metadata:{source:'fleet_map_planner',source_kind:stop.source_kind}
  }));
  await run(async()=>{
   await setRouteStops(businessId,routeId,stops);
   await getFleetRouteGeofences(businessId,routeId);
  },'Route stops, geofences and notification controls saved.');
 }

 async function assign(kind:'vehicle'|'driver',id:string){
  if(!selectedRoute||locked)return;
  await run(()=>updateRoute(businessId,{...selectedRoute,[kind==='vehicle'?'vehicle_id':'driver_id']:id||null}),`${kind==='vehicle'?'Vehicle':'Driver'} assigned.`);
 }

 async function editRoute(){
  if(!selectedRoute)return;
  if(!routeEditName.trim())return setMessage('Route name cannot be empty.');
  await run(()=>updateRoute(businessId,{...selectedRoute,name:routeEditName.trim()}),'Route details updated.');
 }

 async function removeRoute(){
  if(!selectedRoute)return;
  if(locked)return setMessage('Active/dispatched routes must be completed or returned to a removable state before deletion.');
  setBusy(true);
  try{
   await deleteRoute(businessId,String(selectedRoute.id));
   setRouteId('');setDraft([]);setDraftDetails({});setRouteEditName('');
   setMessage('Route deleted.');
   await load();
  }catch(e:any){setMessage(e?.message||'Route could not be deleted.');}
  finally{setBusy(false);}
 }

 function chooseRoute(route:Row){
  const id=String(route.id);
  setRouteId(id);
  setRouteEditName(String(route.name||''));
  hydrateDraft(inventory,id);
 }

 const selectedKey=selectedLocation?candidateKey(selectedLocation):'';
 const selectedStopIndex=selectedKey?draft.indexOf(selectedKey):-1;

 return <ScrollView
  scrollEnabled={!mapInteracting}
  refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>}
  contentInsetAdjustmentBehavior="automatic"
  contentContainerStyle={s.page}
 >
  <View style={s.hero}>
   <Text style={s.kicker}>MAP ROUTING + DISPATCH</Text>
   <Text style={s.title}>Build missions from canonical or ad-hoc stops.</Text>
   <Text style={s.body}>Search the Kleenest network or geocode any address/place. Every saved stop can drive routing, dispatch, geofencing, notifications, metrics and intelligence even before it becomes canonical.</Text>
  </View>

  {origin.fallback?<Text style={s.warning}>Location permission is off. The planner starts from the U.S. center; nearby-first planning resumes when foreground location is allowed.</Text>:null}
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.card}>
   <Text style={s.cardTitle}>Find route stops</Text>
   <Text style={s.meta}>Canonical Kleenest locations stay preferred, but any geocodable place can be added as an operational ad-hoc stop.</Text>
   <View style={s.row}>
    <TextInput
     placeholderTextColor="#78877f"
     style={[s.input,{flexGrow:1,flexBasis:210}]}
     value={query}
     onChangeText={setQuery}
     onSubmitEditing={()=>void searchStops()}
     placeholder="Place, address, city or brand"
    />
    <Action label={searching?'Searching…':'Search'} disabled={searching} onPress={searchStops}/>
   </View>
   <View style={s.row}>
    {choices.map(([label,meters])=><Pressable key={meters} onPress={()=>setRadius(meters)} style={[s.chip,radius===meters&&s.chipOn]}><Text style={[s.chipText,radius===meters&&s.chipTextOn]}>{label}</Text></Pressable>)}
   </View>
  </View>

  <FleetMap
   center={selectedLocation?[Number(selectedLocation.longitude),Number(selectedLocation.latitude)]:[origin.longitude,origin.latitude]}
   locations={locations}
   selectedId={selected}
   routeStopIds={canonicalStopIds}
   onSelect={item=>setSelected(routeLocationId(item))}
   onInteractionChange={setMapInteracting}
  />

  {selectedLocation?.source_kind==='adhoc'
   ?<View style={[s.card,s.adhocCard]}>
     <Text style={s.adhocBadge}>AD-HOC STOP</Text>
     <Text style={s.cardTitle}>{String(selectedLocation.name||'Geocoded place')}</Text>
     <Text style={s.meta}>{String(selectedLocation.address||'Geocoded coordinates')}</Text>
     <Text style={s.coordinate}>{Number(selectedLocation.latitude).toFixed(5)}, {Number(selectedLocation.longitude).toFixed(5)}</Text>
     <Action
      label={selectedStopIndex>=0?'Remove ad-hoc stop':'Use this place as an ad-hoc stop'}
      disabled={locked}
      onPress={()=>toggleLocation(selectedLocation)}
     />
    </View>
   :selectedLocation
    ?<FleetSelectedLocationCard item={selectedLocation} stopIndex={selectedStopIndex} onToggleStop={()=>toggleLocation(selectedLocation)} onClose={()=>setSelected('')}/>
    :null}

  <View style={s.card}>
   <Text style={s.cardTitle}>Create route</Text>
   <TextInput placeholderTextColor="#78877f" style={s.input} value={routeName} onChangeText={setRouteName} placeholder="Route name"/>
   <Text style={s.label}>Vehicle</Text><Choices rows={vehicles} selected={vehicleId} onSelect={setVehicleId}/>
   <Text style={s.label}>Driver</Text><Choices rows={drivers} selected={driverId} onSelect={setDriverId}/>
   <Action label="Create planned route" disabled={busy||!routeName.trim()} onPress={create}/>
  </View>

  <Text style={s.section}>Routes</Text>
  {routes.map(route=><Pressable key={String(route.id)} onPress={()=>chooseRoute(route)} style={[s.route,String(route.id)===routeId&&s.routeOn]}>
   <View style={{flex:1}}>
    <Text style={s.cardTitle}>{String(route.name||'Fleet route')}</Text>
    <Text style={s.meta}>{String(route.status||'planned')} · {Number(route.stops_count||0)} saved stops</Text>
   </View>
  </Pressable>)}

  {selectedRoute?<View style={s.card}>
   <Text style={s.cardTitle}>Edit route</Text>
   <TextInput placeholderTextColor="#78877f" style={s.input} value={routeEditName} onChangeText={setRouteEditName} placeholder="Route name"/>
   <View style={s.row}>
    <Action label="Edit route" disabled={busy||!routeEditName.trim()} onPress={editRoute}/>
    <Action danger label="Delete route" disabled={busy||locked} onPress={removeRoute}/>
   </View>
   <Text style={s.meta}>{locked?'Stop order and deletion are locked after dispatch.':'Add/remove stops, tune geofences and notifications, reorder the draft, then save.'}</Text>
   <Text style={s.label}>Assign vehicle</Text><Choices rows={vehicles} selected={String(selectedRoute.vehicle_id||'')} onSelect={id=>void assign('vehicle',id)}/>
   <Text style={s.label}>Assign driver</Text><Choices rows={drivers} selected={String(selectedRoute.driver_id||'')} onSelect={id=>void assign('driver',id)}/>

   <Text style={s.label}>Draft stop order</Text>
   <View style={s.stopList}>
    {draft.length?draft.map((key,index)=>{
     const detail=draftDetails[key];
     if(!detail)return null;
     return <View key={key} style={s.stop}>
      <View style={s.stopHeader}>
       <View style={s.stopNumWrap}><Text style={s.stopNum}>{index+1}</Text></View>
       <View style={{flex:1,minWidth:0}}>
        <Text style={s.stopType}>{detail.source_kind==='adhoc'?'AD-HOC STOP':'CANONICAL LOCATION'}</Text>
        <Text style={s.stopTitle}>{detail.stop_name}</Text>
        <Text style={s.meta}>{detail.stop_address||[detail.latitude,detail.longitude].filter(value=>value!==null).join(', ')}</Text>
       </View>
      </View>

      <Text style={s.label}>Geofence radius</Text>
      <View style={s.row}>
       {geofenceChoices.map(meters=><Pressable key={meters} disabled={locked} onPress={()=>updateStop(key,{geofence_radius_m:meters})} style={[s.chip,detail.geofence_radius_m===meters&&s.chipOn]}>
        <Text style={[s.chipText,detail.geofence_radius_m===meters&&s.chipTextOn]}>{meters} m</Text>
       </Pressable>)}
      </View>

      <View style={s.notificationGrid}>
       <ToggleChip label="Notify arrival" active={detail.notify_arrival} disabled={locked} onPress={()=>updateStop(key,{notify_arrival:!detail.notify_arrival})}/>
       <ToggleChip label="Notify departure" active={detail.notify_departure} disabled={locked} onPress={()=>updateStop(key,{notify_departure:!detail.notify_departure})}/>
       <ToggleChip label="Notify dwell" active={detail.notify_dwell} disabled={locked} onPress={()=>updateStop(key,{notify_dwell:!detail.notify_dwell})}/>
      </View>

      {!locked?<View style={s.stopActions}>
       <Action quiet label="↑" disabled={index===0} onPress={()=>moveStop(index,-1)}/>
       <Action quiet label="↓" disabled={index===draft.length-1} onPress={()=>moveStop(index,1)}/>
       <Action quiet label="Remove" onPress={()=>removeStop(key)}/>
      </View>:null}
     </View>;
    }):<Text style={s.meta}>Search a canonical location or any address/place, then add it to this route.</Text>}
   </View>
   <Action label="Save stop order + geofences" disabled={busy||locked||!draft.length} onPress={save}/>
  </View>:null}
 </ScrollView>;
}

function Choices({rows,selected,onSelect}:{rows:Row[];selected:string;onSelect:(id:string)=>void}){
 return <View style={s.row}>{rows.slice(0,15).map(row=>{const id=String(row.id||'');return <Pressable key={id} onPress={()=>onSelect(selected===id?'':id)} style={[s.chip,selected===id&&s.chipOn]}><Text style={[s.chipText,selected===id&&s.chipTextOn]}>{String(row.name||row.unit_code||'Option')}</Text></Pressable>})}</View>;
}
function ToggleChip({label,active,onPress,disabled}:{label:string;active:boolean;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="switch" accessibilityState={{checked:active,disabled}} disabled={disabled} onPress={onPress} style={[s.toggle,active&&s.toggleOn,disabled&&{opacity:.5}]}>
  <Text style={[s.toggleText,active&&s.toggleTextOn]}>{active?'✓ ':''}{label}</Text>
 </Pressable>;
}
function Action({label,onPress,disabled,danger=false,quiet=false}:{label:string;onPress:()=>void|Promise<void>;disabled?:boolean;danger?:boolean;quiet?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action,quiet&&s.actionQuiet,danger&&s.actionDanger,disabled&&{opacity:.45}]}><Text style={[s.actionText,quiet&&s.actionQuietText]}>{label}</Text></Pressable>;
}

const s=StyleSheet.create({
 page:{padding:16,gap:12,backgroundColor:'#f3f6f4',paddingBottom:70},
 hero:{backgroundColor:'#173f2d',borderRadius:24,padding:19,gap:7},
 kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},
 title:{fontSize:26,fontWeight:'900',color:'#fff'},
 body:{fontSize:14,lineHeight:21,color:'#deebe4'},
 warning:{backgroundColor:'#fff0d5',color:'#6c511c',padding:12,borderRadius:14,fontWeight:'700'},
 message:{fontWeight:'700',color:'#596b61'},
 card:{backgroundColor:'#fff',borderRadius:18,padding:14,gap:9,borderWidth:1,borderColor:'#dbe5de'},
 adhocCard:{borderColor:'#d5b45e',backgroundColor:'#fffaf0'},
 adhocBadge:{alignSelf:'flex-start',fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#6d531c',backgroundColor:'#f5df9d',paddingHorizontal:8,paddingVertical:5,borderRadius:999},
 coordinate:{fontSize:11,fontWeight:'800',color:'#4d6558'},
 cardTitle:{fontSize:17,fontWeight:'900',color:'#102218'},
 row:{flexDirection:'row',flexWrap:'wrap',gap:7,alignItems:'center'},
 input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:11,backgroundColor:'#fafcfb',color:'#132b21'},
 chip:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:10,paddingVertical:8},
 chipOn:{backgroundColor:'#173f2d'},
 chipText:{fontSize:11,fontWeight:'800',color:'#365645'},
 chipTextOn:{color:'#fff'},
 action:{backgroundColor:'#173f2d',borderRadius:12,paddingHorizontal:11,paddingVertical:9,alignItems:'center'},
 actionQuiet:{backgroundColor:'#edf3ef'},
 actionQuietText:{color:'#173f2d'},
 actionDanger:{backgroundColor:'#7b2f2f'},
 actionText:{color:'#fff',fontWeight:'900'},
 label:{fontSize:11,fontWeight:'900',color:'#4f6559'},
 section:{fontSize:21,fontWeight:'900',color:'#102218'},
 route:{backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de'},
 routeOn:{borderWidth:2,borderColor:'#173f2d'},
 meta:{fontSize:12,lineHeight:18,color:'#65756b'},
 stopList:{gap:10},
 stop:{gap:9,backgroundColor:'#f4f7f5',borderRadius:16,padding:12,borderWidth:1,borderColor:'#e0e8e3'},
 stopHeader:{flexDirection:'row',gap:9,alignItems:'flex-start'},
 stopNumWrap:{width:30,height:30,borderRadius:15,backgroundColor:'#e2ece6',alignItems:'center',justifyContent:'center'},
 stopNum:{fontWeight:'900',color:'#173f2d'},
 stopType:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#61766a'},
 stopTitle:{fontSize:15,fontWeight:'900',color:'#102218'},
 stopActions:{flexDirection:'row',flexWrap:'wrap',gap:5},
 notificationGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
 toggle:{borderWidth:1,borderColor:'#cbd9d0',backgroundColor:'#fff',borderRadius:999,paddingHorizontal:9,paddingVertical:7},
 toggleOn:{backgroundColor:'#dcebe1',borderColor:'#8eb79d'},
 toggleText:{fontSize:10,fontWeight:'800',color:'#5c7064'},
 toggleTextOn:{color:'#173f2d'},
});
