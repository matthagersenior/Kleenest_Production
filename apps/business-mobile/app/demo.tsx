import { Link } from 'expo-router';
import { useEffect,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { getBusinessRealWorldDemoSnapshot } from '../services/onboarding';

const growthSteps=[
 ['/locations','1 · Location truth','Confirm the operated location and the customer-facing restroom/amenity context.'],
 ['/growth','2 · Launch Growth','See the commuter promotion, verified-visit campaign, repeat-visit contest and event.'],
 ['/qr-studio','3 · Attribute real visits','Use the seeded QR asset and inspect scans/redemptions tied to the same location.'],
 ['/reviews','4 · Turn visits into trust','Inspect verified feedback and reply from the Business identity.'],
 ['/analytics','5 · Measure conversion','Connect visit activity, QR attribution and program performance.'],
 ['/intelligence','6 · Decide what to do next','Use Business Intelligence to turn signals into a follow-up action.']
] as const;
const enterpriseSteps=[
 ['/enterprise-locations','1 · Portfolio locations','Operate several locations with consistent location-level controls.'],
 ['/enterprise','2 · Cross-business command','See routes, alerts, partner members and the Enterprise portfolio in one place.'],
 ['/operations','3 · Resolve an issue','Follow seeded remediation and preventive work through operational evidence.'],
 ['/enterprise','4 · Run partner programs','Inspect the active partner network, campaign and partner outcomes.'],
 ['/enterprise-economy','5 · Allocate resources','Review seeded allocations, benchmark signals and allocation ROI.'],
 ['/analytics','6 · Measure portfolio results','Use Business analytics alongside the Enterprise control plane.']
] as const;

export default function BusinessDemo(){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading real-world demo…');
 async function load(){setBusy(true);try{const id=await currentBusinessId();setData(await getBusinessRealWorldDemoSnapshot(id));setMessage('')}catch(e:any){setData(null);setMessage(e?.message||'Select a managed demo workspace to run this guided flow.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const steps=data?.scenario==='enterprise'?enterpriseSteps:growthSteps;
 const evidence=data?.evidence&&typeof data.evidence==='object'?Object.entries(data.evidence):[];
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>REAL-WORLD BUSINESS DEMO</Text><Text style={s.title}>{data?.headline||'Growth and Enterprise stories backed by real Kleenest controls.'}</Text><Text style={s.body}>This guide does not simulate buttons. Every step opens the actual production surface used by a Business or Enterprise operator.</Text></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {!data?<View style={s.card}><Text style={s.cardTitle}>Choose a demo workspace</Text><Text style={s.meta}>Use Downtown Coffee & Market for Business Growth, or Matt Test Business for Enterprise.</Text><Link href="/workspaces" style={s.action}>Open Workspaces →</Link></View>:<>
   <View style={s.status}><View style={{flex:1}}><Text style={s.kickerDark}>{String(data.scenario||'demo').toUpperCase()} · {String(data.workspace||'Demo workspace')}</Text><Text style={s.statusTitle}>{data.passed?'Demo evidence ready':'Demo evidence needs attention'}</Text></View><Text style={s.badge}>{data.passed?'READY':'CHECK'}</Text></View>
   <View style={s.metrics}>{evidence.map(([key,value])=><View key={key} style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.meta}>{key.replaceAll('_',' ')}</Text></View>)}</View>
   <Text style={s.section}>Walk the customer story</Text>
   {steps.map(([href,title,detail])=><View key={title} style={s.card}><Text style={s.cardTitle}>{title}</Text><Text style={s.meta}>{detail}</Text><Link href={href as any} style={s.action}>Open real control →</Link></View>)}
   {data?.scenario==='growth'?<View style={s.story}><Text style={s.kickerDark}>DEMO NARRATIVE</Text><Text style={s.cardTitle}>“Can a neighborhood business turn restroom trust into measurable repeat traffic?”</Text><Text style={s.meta}>Start with the morning offer, show the QR scans and redemptions, then move through contest/event engagement into analytics and the next recommended action.</Text></View>:<View style={s.story}><Text style={s.kickerDark}>DEMO NARRATIVE</Text><Text style={s.cardTitle}>“Can a regional operator prove service quality and partner ROI across locations and mobile operations?”</Text><Text style={s.meta}>Show location command, an operational exception/remediation, partner outcomes, resource allocation and the resulting portfolio evidence.</Text></View>}
  </>}
 </ScrollView>
}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:'#f3f6f4',paddingBottom:70},hero:{backgroundColor:'#173f2d',borderRadius:24,padding:20,gap:7},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},kickerDark:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#587066'},title:{fontSize:27,lineHeight:31,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#deebe4'},message:{fontWeight:'800',color:'#596b61'},status:{backgroundColor:'#eaf4ed',borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:10},statusTitle:{fontSize:19,fontWeight:'900',color:'#102218'},badge:{fontSize:10,fontWeight:'900',backgroundColor:'#fff',paddingHorizontal:9,paddingVertical:6,borderRadius:999,color:'#173f2d'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'30%',flexGrow:1,backgroundColor:'#fff',padding:12,borderRadius:15,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:20,fontWeight:'900',color:'#173f2d'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},section:{fontSize:21,fontWeight:'900',color:'#102218'},card:{backgroundColor:'#fff',padding:15,borderRadius:18,gap:7,borderWidth:1,borderColor:'#dbe5de'},cardTitle:{fontSize:16,fontWeight:'900',color:'#102218'},action:{alignSelf:'flex-start',backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},story:{backgroundColor:'#fff8e8',padding:15,borderRadius:18,gap:7}});
