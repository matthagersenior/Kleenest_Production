import { useEffect,useState } from 'react';
import { Linking,Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { getBusinessProductAccess } from '../services/productAccess';
import { BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';

type Workspace=Record<string,any>;
const operatorRoutes=[
  ['','Fleet home','Full Fleet command center'],
  ['planner','Route planner','Build and optimize routes from the Kleenest network'],
  ['dispatch','Dispatch','Assign, start, pause and recover route missions'],
  ['assets','Vehicles & drivers','Operate Fleet assets and assignments'],
  ['operations','Operations','Exceptions, remediation and preventive work'],
  ['signals','Live Network','Geofences, dwell/stall and live operational signals'],
  ['maintenance','Maintenance','Schedule and close Fleet maintenance work'],
  ['insights','Intelligence','Fleet performance, risk and network intelligence'],
  ['notifications','Alerts','Fleet notifications and push delivery'],
  ['workspaces','Workspace gates','Review Fleet-enabled Business/client workspace authority'],
] as const;

function portalUrl(route=''){const suffix=route?route.replace(/^\//,'')+'/':'';return `/Kleenest_Production/fleet/${suffix}`;}
async function openFleet(route=''){if(Platform.OS==='web'&&typeof window!=='undefined'){window.location.assign(portalUrl(route));return;}await Linking.openURL(`kleenest-fleet://${route||''}`);}

export default function BusinessFleetSuite(){
 const[businessId,setBusinessId]=useState(''),[access,setAccess]=useState<any>(null),[workspace,setWorkspace]=useState<Workspace|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading Fleet authority…');

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();setBusinessId(id);
   const[product,manifestResult]=await Promise.all([
    getBusinessProductAccess(id),
    getKleenestSupabaseClient().rpc('fleet_current_user_workspace_manifest'),
   ]);
   if(manifestResult.error)throw manifestResult.error;
   const workspaces=Array.isArray((manifestResult.data as any)?.workspaces)?(manifestResult.data as any).workspaces:[];
   setAccess(product);
   setWorkspace(workspaces.find((row:any)=>String(row.business_id)===id)||null);
   setMessage('');
  }catch(e:any){setMessage(e?.message||'Fleet workspace authority is unavailable.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 const enabled=Boolean(access?.fleet_enabled);
 const role=String(workspace?.workspace_role||'');
 const operator=role==='operator';
 const capabilities=workspace?.capabilities&&typeof workspace.capabilities==='object'?workspace.capabilities:{};
 const capRows=Object.entries(capabilities);

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <BusinessHero eyebrow="BUSINESS + FLEET" title="Fleet Suite" body="Fleet remains attached to this Business identity. Enterprise/Growth authority, Fleet entitlement, operator controls and client/member gates share the same Business workspace instead of becoming a disconnected account."/>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.metrics}>
   <Metric label="Fleet entitlement" value={enabled?'ENABLED':'OFF'}/>
   <Metric label="Workspace role" value={role?role.toUpperCase():'NONE'}/>
   <Metric label="Business tier" value={String(access?.plan||access?.business_tier||'—').toUpperCase()}/>
  </View>

  {!enabled?<BusinessCard><SectionHeader title="Fleet is not enabled for this Business" body="Enable Fleet on the canonical Business account before routing, dispatch and Fleet client workspaces are exposed."/></BusinessCard>:null}

  {enabled&&!workspace?<BusinessCard><SectionHeader title="Fleet entitlement exists, but this user has no Fleet workspace" body="Owner/admin/manager/dispatcher membership or a Fleet driver/member relationship is required. The Fleet workspace manifest never grants controls from a client label alone."/></BusinessCard>:null}

  {enabled&&workspace?<BusinessCard>
    <SectionHeader title={operator?'Operator workspace active':'Fleet client workspace active'} body={operator?'Owner/admin/manager/dispatcher authority exposes the full Fleet web control plane for this Business.':'This account keeps the Consumer-connected Fleet member experience while operator-only routing/dispatch controls remain gated.'}/>
    <View style={s.gates}>{capRows.map(([key,value])=><View key={key} style={[s.gate,Boolean(value)&&s.gateOn]}><Text style={[s.gateText,Boolean(value)&&s.gateTextOn]}>{Boolean(value)?'✓ ':'— '}{key.replaceAll('_',' ')}</Text></View>)}</View>
  </BusinessCard>:null}

  {enabled&&operator?<View style={s.section}>
    <SectionHeader title="Fleet operator control plane" body="These tools open the same Fleet-enabled Business workspace in the dedicated Fleet portal/app. Alerts and Account remain available to operators as well as client members."/>
    {operatorRoutes.map(([route,title,body])=><Pressable accessibilityRole="button" key={route||'home'} style={s.route} onPress={()=>void openFleet(route)}><View style={{flex:1}}><Text style={s.routeTitle}>{title}</Text><Text style={s.routeBody}>{body}</Text></View><Text style={s.arrow}>→</Text></Pressable>)}
  </View>:null}

  {enabled&&workspace?<View style={s.section}>
    <SectionHeader title="Fleet client/member experience" body="The client workspace keeps nearby restroom discovery, Consumer Premium, assigned-route execution, geofencing and personal notifications behind explicit capability gates."/>
    <View style={s.clientRow}>
      <Pressable accessibilityRole="button" style={s.clientAction} onPress={()=>void openFleet('member')}><Text style={s.clientActionText}>Open For Me →</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.clientAction} onPress={()=>void openFleet('nearby')}><Text style={s.clientActionText}>Open Nearby →</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.clientAction} onPress={()=>void openFleet('notifications')}><Text style={s.clientActionText}>Open Alerts →</Text></Pressable>
    </View>
  </View>:null}
 </ScrollView>;
}

function Metric({label,value}:{label:string;value:string}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>}
const s=StyleSheet.create({
 page:{padding:18,gap:14,backgroundColor:businessColors.paper,paddingBottom:70},
 message:{fontWeight:'800',color:'#6f4d36'},
 metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},
 metric:{flexGrow:1,flexBasis:150,backgroundColor:'#fff',borderWidth:1,borderColor:businessColors.border,borderRadius:16,padding:13,gap:3},
 metricValue:{fontSize:17,fontWeight:'900',color:businessColors.green},
 metricLabel:{fontSize:10,fontWeight:'800',color:businessColors.muted},
 section:{gap:8},
 gates:{flexDirection:'row',flexWrap:'wrap',gap:7},
 gate:{backgroundColor:'#eef1ef',paddingHorizontal:9,paddingVertical:7,borderRadius:999},
 gateOn:{backgroundColor:'#e4f1e8'},
 gateText:{fontSize:9,fontWeight:'800',color:'#7a857f'},
 gateTextOn:{color:businessColors.green},
 route:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderWidth:1,borderColor:businessColors.border,borderRadius:16,padding:14},
 routeTitle:{fontSize:16,fontWeight:'900',color:businessColors.ink},
 routeBody:{fontSize:12,lineHeight:18,color:businessColors.muted,marginTop:2},
 arrow:{fontSize:20,fontWeight:'900',color:businessColors.green},
 clientRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
 clientAction:{backgroundColor:businessColors.green,paddingHorizontal:12,paddingVertical:10,borderRadius:999},
 clientActionText:{color:'#fff',fontWeight:'900',fontSize:11},
});
