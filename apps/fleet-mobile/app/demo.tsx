import { Link } from 'expo-router';
import { useEffect,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentFleetBusinessId } from '../services/control';
import { getFleetRealWorldDemoSnapshot } from '../services/onboarding';

const steps=[
 ['/assets','1 · Assign the operation','Meet the two seeded service vans and drivers. These are demo-only assets, not customer records.'],
 ['/planner','2 · Build around the Kleenest network','Inspect routes using real canonical Kleenest location IDs as stops.'],
 ['/dispatch','3 · Dispatch the morning route','See the active Downtown field-service mission and current assignment.'],
 ['/execution','4 · Verify stop execution','Walk arrival, service, completion and departure controls at actual route stops.'],
 ['/signals','5 · Watch live context','Use monitored locations, geofences and network signals around the route.'],
 ['/operations','6 · Recover the exception','Work the seeded restroom-access detour warning and operational response.'],
 ['/insights','7 · Prove the result','Inspect route exceptions, prevention signals and asset/route intelligence.']
] as const;

export default function FleetDemo(){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading Fleet demo…');
 async function load(){setBusy(true);try{const id=await currentFleetBusinessId();setData(await getFleetRealWorldDemoSnapshot(id));setMessage('')}catch(e:any){setData(null);setMessage(e?.message||'Select Kleenest Demo Fleet to run this guided flow.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const evidence=data?.evidence&&typeof data.evidence==='object'?Object.entries(data.evidence):[];
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>REAL-WORLD FLEET DEMO</Text><Text style={s.title}>{data?.headline||'Field-service dispatch from route plan through exception recovery.'}</Text><Text style={s.body}>The demo uses the real Fleet tables and controls: vehicles, drivers, canonical location stops, dispatch state, execution events, monitored locations and alerts.</Text></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {!data?<View style={s.card}><Text style={s.cardTitle}>Choose Kleenest Demo Fleet</Text><Text style={s.meta}>Demo workspaces are isolated from real organizations and are never auto-preferred.</Text><Link href="/workspaces" style={s.action}>Open Workspaces →</Link></View>:<>
   <View style={s.status}><View style={{flex:1}}><Text style={s.kickerDark}>{String(data.workspace||'Kleenest Demo Fleet')}</Text><Text style={s.statusTitle}>{data.passed?'Fleet evidence ready':'Fleet evidence needs attention'}</Text></View><Text style={s.badge}>{data.passed?'READY':'CHECK'}</Text></View>
   <View style={s.metrics}>{evidence.map(([key,value])=><View key={key} style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.meta}>{key.replaceAll('_',' ')}</Text></View>)}</View>
   <View style={s.story}><Text style={s.kickerDark}>DEMO NARRATIVE</Text><Text style={s.cardTitle}>“A field-service driver is mid-route when restroom access forces a detour. Can dispatch recover without losing visibility or service proof?”</Text><Text style={s.meta}>Start with the assigned van and route, show real network stops, move through execution, then resolve the live exception and inspect the resulting intelligence.</Text></View>
   <Text style={s.section}>Walk the operating flow</Text>
   {steps.map(([href,title,detail])=><View key={title} style={s.card}><Text style={s.cardTitle}>{title}</Text><Text style={s.meta}>{detail}</Text><Link href={href as any} style={s.action}>Open real control →</Link></View>)}
  </>}
 </ScrollView>
}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:'#f3f6f4',paddingBottom:70},hero:{backgroundColor:'#173f2d',borderRadius:24,padding:20,gap:7},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},kickerDark:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#587066'},title:{fontSize:27,lineHeight:31,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#deebe4'},message:{fontWeight:'800',color:'#596b61'},status:{backgroundColor:'#eaf4ed',borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:10},statusTitle:{fontSize:19,fontWeight:'900',color:'#102218'},badge:{fontSize:10,fontWeight:'900',backgroundColor:'#fff',paddingHorizontal:9,paddingVertical:6,borderRadius:999,color:'#173f2d'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'30%',flexGrow:1,backgroundColor:'#fff',padding:12,borderRadius:15,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:20,fontWeight:'900',color:'#173f2d'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},section:{fontSize:21,fontWeight:'900',color:'#102218'},card:{backgroundColor:'#fff',padding:15,borderRadius:18,gap:7,borderWidth:1,borderColor:'#dbe5de'},cardTitle:{fontSize:16,fontWeight:'900',color:'#102218'},action:{alignSelf:'flex-start',backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},story:{backgroundColor:'#fff8e8',padding:15,borderRadius:18,gap:7}});
