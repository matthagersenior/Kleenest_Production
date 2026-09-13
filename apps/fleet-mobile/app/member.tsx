import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentFleetBusinessId,getFleetMemberContext } from '../services/control';
import { recordRouteStopTiming } from '../services/product';
import { enableFleetLiveNetwork,registerFleetPush,requestFleetBackgroundPermission,requestFleetForegroundPermission } from '../services/geofence';

type Row=Record<string,any>;

export default function FleetMemberWorkspace(){
 const[businessId,setBusinessId]=useState('');
 const[context,setContext]=useState<any>(null);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('Loading your Fleet workspace…');

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentFleetBusinessId();setBusinessId(id);
   const next=await getFleetMemberContext(id);setContext(next);setMessage('');
  }catch(e:any){setMessage(e?.message||'Your Fleet workspace is unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 const workspace=context?.workspace||{};
 const dispatch=context?.dispatch||{};
 const policy=context?.exception_policy||{};
 const routes=Array.isArray(dispatch?.routes)?dispatch.routes:[];
 const route=useMemo(()=>routes.find((r:Row)=>String(r.status)==='active')||routes.find((r:Row)=>String(r.status)==='paused')||routes[0]||null,[routes]);
 const stops=Array.isArray(route?.stops)?route.stops:[];
 const nextStop=stops.find((s:Row)=>!['completed','skipped','cancelled'].includes(String(s.status||'planned')))||null;
 const role=String(workspace.workspace_role||'member');
 const canDrive=workspace?.capabilities?.route_execution===true;
 const premium=workspace?.premium_entitled===true;

 async function run(label:string,fn:()=>Promise<unknown>){
  setBusy(true);try{await fn();setMessage(label);await load()}catch(e:any){setMessage(e?.message||'Fleet action failed.')}finally{setBusy(false)}
 }
 async function mark(stop:Row,event:'arrived'|'service_started'|'completed'|'departed'|'skipped'){
  if(!route)return;
  await run('Route stop updated.',()=>recordRouteStopTiming(businessId,String(route.id||route.route_id),String(stop.id||stop.route_stop_id),event));
 }
 async function enableLive(){
  if(!route)return setMessage('No assigned route is available for geofencing.');
  setBusy(true);
  try{
   await requestFleetForegroundPermission();
   await requestFleetBackgroundPermission();
   await registerFleetPush();
   const enabled=await enableFleetLiveNetwork(businessId,String(route.id||route.route_id));
   setMessage('Route geofencing enabled for '+enabled.registered+' stop'+(enabled.registered===1?'':'s')+'.');
  }catch(e:any){setMessage(e?.message||'Route geofencing could not be enabled.')}finally{setBusy(false)}
 }
 async function navigate(stop:Row){
  const lat=Number(stop.latitude),lng=Number(stop.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return setMessage('This stop does not have navigation coordinates yet.');
  const url=Platform.OS==='ios'?'maps://?daddr='+lat+','+lng:'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng;
  await Linking.openURL(url);
 }
 async function openConsumer(){
  const native='kleenest://explore';
  const supported=await Linking.canOpenURL(native).catch(()=>false);
  await Linking.openURL(supported?native:'https://matthagersenior.github.io/Kleenest_Production/?app=1');
 }

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>MY KLEENEST · FLEET</Text><Text style={s.title}>{workspace.business_name||'Fleet member workspace'}</Text><Text style={s.body}>{role==='operator'?'Your operator account keeps the full Fleet control plane, plus this personal Kleenest experience.':role==='driver'?'Your assigned routes, geofences and stop events live beside your personal Kleenest discovery experience.':'Your organization-connected Kleenest experience keeps consumer discovery and benefits separate from operator controls.'}</Text><View style={s.badges}><Badge label={role.toUpperCase()}/><Badge label={premium?'PREMIUM ACTIVE':'FLEET MEMBER'}/>{canDrive?<Badge label="ROUTE EXECUTION"/>:null}</View></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.consumerCard}><Text style={s.eyebrow}>YOUR CONSUMER EXPERIENCE</Text><Text style={s.cardTitle}>Kleenest stays useful even when you are off route.</Text><Text style={s.meta}>Search any area, see consumer-facing location photos, cleanliness and access signals, start navigation, receive notifications and use your Fleet-provided Premium entitlement when active.</Text><View style={s.actionRow}><Link href="/nearby" asChild><Pressable style={s.action}><Text style={s.actionText}>Find nearby bathrooms</Text></Pressable></Link><Pressable onPress={()=>void openConsumer()} style={s.secondary}><Text style={s.secondaryText}>Open full Kleenest</Text></Pressable></View></View>

  {canDrive?<><View style={s.sectionHead}><Text style={s.eyebrow}>MY ROUTE</Text><Text style={s.sectionTitle}>{route?String(route.name||'Assigned route'):'No active assignment'}</Text><Text style={s.meta}>{route?String(route.status||'planned').replaceAll('_',' ')+' · '+stops.length+' stops':'When dispatch assigns you a route, it appears here automatically.'}</Text></View>
   {route?<View style={s.routeCard}><View style={s.metrics}><Metric label="STOP" value={nextStop?String(nextStop.stop_order||'—'):'✓'}/><Metric label="STATUS" value={nextStop?String(nextStop.status||'planned').toUpperCase():'DONE'}/><Metric label="VEHICLE" value={String(dispatch?.vehicle?.unit_code||dispatch?.vehicle?.name||'—')}/></View>{nextStop?<><Text style={s.nextTitle}>{String(nextStop.stop_name||'Next route stop')}</Text><Text style={s.meta}>{String(nextStop.stop_address||'Address unavailable')}</Text>{dwellLabel(nextStop,policy)?<View style={dwellLabel(nextStop,policy)?.startsWith('STALL')?s.stall:s.dwell}><Text style={s.alertText}>{dwellLabel(nextStop,policy)}</Text></View>:null}<View style={s.actionRow}><Pressable onPress={()=>void navigate(nextStop)} style={s.action}><Text style={s.actionText}>Start navigation</Text></Pressable><Pressable onPress={()=>void enableLive()} disabled={busy} style={s.secondary}><Text style={s.secondaryText}>Enable geofencing</Text></Pressable></View></>:<Text style={s.done}>All route stops are terminal. Dispatch will update the route as completion is reconciled.</Text>}</View>:null}
   {stops.map((stop:Row)=><StopCard key={String(stop.id||stop.route_stop_id)} stop={stop} policy={policy} busy={busy} onMark={event=>mark(stop,event)} onNavigate={()=>navigate(stop)}/>)}
  </>:<View style={s.infoCard}><Text style={s.eyebrow}>FLEET GATE</Text><Text style={s.cardTitle}>Operator controls are intentionally hidden.</Text><Text style={s.meta}>Planning, dispatch, assets, enterprise operations and organization analytics stay available only to Fleet operators. If you are assigned as a driver, route execution and geofencing unlock automatically without exposing manager controls.</Text></View>}

  <View style={s.links}><Link href="/nearby" style={s.link}>Nearby</Link><Link href="/notifications" style={s.link}>Notifications</Link><Link href="/workspaces" style={s.link}>Workspaces</Link><Link href="/account" style={s.link}>Account</Link></View>
 </ScrollView>
}

function StopCard({stop,policy,busy,onMark,onNavigate}:{stop:Row;policy:Row;busy:boolean;onMark:(event:'arrived'|'service_started'|'completed'|'departed'|'skipped')=>void|Promise<void>;onNavigate:()=>void|Promise<void>}){
 const status=String(stop.status||'planned');
 const dwell=dwellLabel(stop,policy);
 return <View style={s.stop}><View style={s.stopTop}><View style={s.stopNumber}><Text style={s.stopNumberText}>{String(stop.stop_order||'—')}</Text></View><View style={{flex:1,gap:2}}><Text style={s.stopTitle}>{String(stop.stop_name||'Route stop')}</Text><Text style={s.meta}>{String(stop.stop_address||'Address unavailable')}</Text></View><Badge label={status.toUpperCase()}/></View>{dwell?<View style={dwell.startsWith('STALL')?s.stall:s.dwell}><Text style={s.alertText}>{dwell}</Text></View>:null}<View style={s.actionRow}><Pressable onPress={onNavigate} style={s.smallSecondary}><Text style={s.secondaryText}>Navigate</Text></Pressable>{status==='planned'?<Pressable disabled={busy} onPress={()=>onMark('arrived')} style={s.smallAction}><Text style={s.actionText}>Arrived</Text></Pressable>:null}{status==='arrived'?<Pressable disabled={busy} onPress={()=>onMark('service_started')} style={s.smallAction}><Text style={s.actionText}>Start service</Text></Pressable>:null}{['arrived','servicing'].includes(status)?<Pressable disabled={busy} onPress={()=>onMark('completed')} style={s.smallAction}><Text style={s.actionText}>Complete</Text></Pressable>:null}{!['completed','skipped','cancelled'].includes(status)?<Pressable disabled={busy} onPress={()=>onMark('skipped')} style={s.smallSecondary}><Text style={s.secondaryText}>Skip</Text></Pressable>:null}</View></View>
}
function dwellLabel(stop:Row,policy:Row){
 const status=String(stop.status||'');
 if(!['arrived','servicing'].includes(status))return '';
 const start=Date.parse(String(stop.actual_service_started_at||stop.actual_arrived_at||''));
 if(!Number.isFinite(start))return '';
 const elapsed=Math.max(0,Math.floor((Date.now()-start)/60000));
 const planned=Math.max(1,Number(stop.planned_dwell_minutes||policy.geofence_dwell_minutes||15));
 const overrun=Math.max(1,Number(policy.dwell_overrun_minutes||10));
 return elapsed>planned+overrun?'STALL RISK · '+elapsed+' min on stop':'DWELL · '+elapsed+' / '+planned+' min planned';
}
function Badge({label}:{label:string}){return <View style={s.badge}><Text style={s.badgeText}>{label}</Text></View>}
function Metric({label,value}:{label:string;value:string}){return <View style={s.metric}><Text numberOfLines={1} style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,paddingBottom:70,backgroundColor:'#f3f6f4'},hero:{backgroundColor:'#173f2d',padding:20,borderRadius:24,gap:8},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#c8e6d4'},title:{fontSize:29,fontWeight:'900',color:'#fff'},body:{fontSize:13,lineHeight:20,color:'#deebe4'},badges:{flexDirection:'row',gap:6,flexWrap:'wrap'},badge:{backgroundColor:'#e8f1eb',borderRadius:999,paddingHorizontal:8,paddingVertical:5},badgeText:{fontSize:8,fontWeight:'900',letterSpacing:.6,color:'#274f3a'},message:{color:'#6d5546',fontWeight:'700'},consumerCard:{backgroundColor:'#fff',borderRadius:20,padding:15,gap:8,borderWidth:1,borderColor:'#d9e3dc'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#557060'},cardTitle:{fontSize:20,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#64756b'},actionRow:{flexDirection:'row',gap:7,flexWrap:'wrap'},action:{backgroundColor:'#173f2d',borderRadius:12,paddingHorizontal:13,paddingVertical:10,alignItems:'center'},smallAction:{backgroundColor:'#173f2d',borderRadius:10,paddingHorizontal:11,paddingVertical:8,alignItems:'center'},actionText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#edf3ef',borderRadius:12,paddingHorizontal:13,paddingVertical:10,alignItems:'center'},smallSecondary:{backgroundColor:'#edf3ef',borderRadius:10,paddingHorizontal:11,paddingVertical:8,alignItems:'center'},secondaryText:{color:'#173f2d',fontWeight:'900'},sectionHead:{gap:3,marginTop:3},sectionTitle:{fontSize:23,fontWeight:'900',color:'#102218'},routeCard:{backgroundColor:'#eaf4ed',borderRadius:20,padding:15,gap:9,borderWidth:1,borderColor:'#c9ddcf'},metrics:{flexDirection:'row',gap:7},metric:{flex:1,minWidth:0,backgroundColor:'#fff',borderRadius:12,padding:9},metricValue:{fontSize:14,fontWeight:'900',color:'#173f2d'},metricLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:'#617168'},nextTitle:{fontSize:19,fontWeight:'900',color:'#102218'},done:{fontSize:13,lineHeight:19,fontWeight:'800',color:'#315440'},infoCard:{backgroundColor:'#fff',borderRadius:19,padding:15,gap:6,borderWidth:1,borderColor:'#d9e3dc'},stop:{backgroundColor:'#fff',borderRadius:17,padding:13,gap:8,borderWidth:1,borderColor:'#dbe5de'},stopTop:{flexDirection:'row',alignItems:'center',gap:9},stopNumber:{width:34,height:34,borderRadius:11,backgroundColor:'#173f2d',alignItems:'center',justifyContent:'center'},stopNumberText:{color:'#fff',fontWeight:'900'},stopTitle:{fontSize:15,fontWeight:'900',color:'#102218'},dwell:{backgroundColor:'#fff5d9',paddingHorizontal:10,paddingVertical:7,borderRadius:10},stall:{backgroundColor:'#fde6e1',paddingHorizontal:10,paddingVertical:7,borderRadius:10},alertText:{fontSize:10,fontWeight:'900',color:'#6c432f'},links:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:3},link:{backgroundColor:'#edf3ef',color:'#173d2b',fontWeight:'900',paddingHorizontal:12,paddingVertical:10,borderRadius:999}});
