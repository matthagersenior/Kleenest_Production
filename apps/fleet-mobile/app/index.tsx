import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentFleetBusinessId,getFleetManagedLocationPortfolio,listFleetWorkspaceOptions } from '../services/control';
import { getFleetDashboard,FLEET_PARITY } from '../services/product';
import { getFleetOnboardingGate,getFleetOnboardingState } from '../services/onboarding';

type FleetRoute=readonly[string,string,string];
const routes:FleetRoute[]=[
 ['/demo','Guided Demo','Run the field-service story with seeded demo assets, real Kleenest network stops, dispatch, execution and exception recovery.'],
 ['/onboarding','Onboarding','Update the operating profile that targets this Fleet experience.'],
 ['/planner','Map Planner','Build routes visually from the canonical Kleenest location network and assign drivers/vehicles.'],
 ['/dispatch','Dispatch','Start, pause, resume and advance active route missions.'],
 ['/execution','Field Execution','Run stop arrival, service, completion and geofence mission controls.'],
 ['/signals','Live Network','Control monitored locations, geofences, push and live operational signals.'],
 ['/operations','Operations','Resolve exceptions and attach preventive work to active routes.'],
 ['/assets','Vehicles & Drivers','Create, edit, assign and retire Fleet assets.'],
 ['/maintenance','Maintenance','Schedule, edit, complete and retire maintenance work.'],
 ['/metrics','Metrics','Create, edit and assign Fleet performance metrics.'],
 ['/sync','Offline & Sync','Queue offline checkpoints, replay activity and send route notifications.'],
 ['/insights','Intelligence','Remediation risk, prevention effectiveness, trends, scorecards and network signals.'],
 ['/progression','Progression','Fleet score, leaderboards and network competition.'],
 ['/premium','Premium Members','Grant and revoke Fleet Premium access.'],
 ['/enterprise','Enterprise','Partner networks, campaigns, benchmarks and allocation performance.'],
 ['/capabilities','Capabilities','Fleet product access, observe/dispatch authority and signal policies.'],
 ['/workspaces','Workspaces','Choose the Fleet-enabled Business workspace explicitly.']
];

function count(v:any){if(Array.isArray(v))return v.length;if(v&&typeof v==='object'){for(const key of['items','rows','routes','alerts','signals','work_orders'])if(Array.isArray(v[key]))return v[key].length;return Object.keys(v).length}return Number(v||0)}
function buildPriorityRoutes(onboarding:any){
 const goals:string[]=Array.isArray(onboarding?.goals)?onboarding.goals.map(String):[];
 const pains:string[]=Array.isArray(onboarding?.answers?.pain_points)?onboarding.answers.pain_points.map(String):[];
 const team:string[]=Array.isArray(onboarding?.answers?.team_focus)?onboarding.answers.team_focus.map(String):[];
 const wanted:string[]=[];
 const add=(...items:string[])=>items.forEach(item=>{if(!wanted.includes(item))wanted.push(item)});
 if(goals.some(x=>['route_efficiency'].includes(x)))add('/planner','/dispatch','/execution','/signals');
 if(goals.some(x=>['workforce_wellbeing'].includes(x)))add('/premium','/signals','/insights');
 if(goals.some(x=>['service_verification'].includes(x)))add('/execution','/sync','/metrics');
 if(goals.some(x=>['reduce_downtime'].includes(x)))add('/operations','/maintenance','/insights');
 if(goals.some(x=>['multi_location_consistency'].includes(x)))add('/metrics','/insights');
 if(goals.some(x=>['partner_network','multi_market_roi'].includes(x)))add('/enterprise','/insights');
 if(pains.some(x=>['route_delays','workforce_stop_access'].includes(x)))add('/operations','/planner','/signals');
 if(team.includes('dispatch'))add('/dispatch','/planner','/execution');
 if(team.includes('operations'))add('/operations','/insights');
 if(team.includes('analytics')||team.includes('executive'))add('/metrics','/insights');
 return wanted;
}

export default function FleetHome(){
 const[data,setData]=useState<any>(null),[workspace,setWorkspace]=useState<any>(null),[onboarding,setOnboarding]=useState<any>({}),[onboardingGate,setOnboardingGate]=useState<any>(null),[portfolio,setPortfolio]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading Fleet command center…');
 async function load(){setBusy(true);try{const id=await currentFleetBusinessId();const spaces=await listFleetWorkspaceOptions();setWorkspace(spaces.find((r:any)=>String(r.business_id)===id)||spaces[0]||null);const[dashboard,state,gate,managedPortfolio]=await Promise.all([getFleetDashboard(id),getFleetOnboardingState(id).catch(()=>({})),getFleetOnboardingGate(id).catch(()=>null),getFleetManagedLocationPortfolio(id).catch(()=>null)]);setData(dashboard);setOnboarding(state);setOnboardingGate(gate);setPortfolio(managedPortfolio);setMessage('')}catch(e:any){setMessage(e?.message||'Fleet workspace unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const priorityPaths=useMemo(()=>buildPriorityRoutes(onboarding),[onboarding]);
 const priority=priorityPaths.map(path=>routes.find(([href])=>href===path)).filter(Boolean).slice(0,6) as FleetRoute[];
 const prioritySet=new Set(priority.map(([href])=>href));
 const remaining=routes.filter(([href])=>!prioritySet.has(href));
 const headline=String(onboarding?.experience?.headline||onboarding?.preview?.experience?.headline||'Plan, dispatch, execute, monitor, recover offline work and measure results from one operational control plane.');
 const portfolioSummary=portfolio?.summary||{},portfolioLocations=Number(portfolioSummary.portfolio_location_count||0),networkLocations=Number(portfolioSummary.network_location_count||0);
 const hasDraft=Boolean(onboarding?.business_type||priorityPaths.length||Object.keys(onboarding?.answers||{}).length),onboardingComplete=Boolean(onboardingGate?.completed),onboardingStatus=onboardingComplete?'ONBOARDING COMPLETE':hasDraft?'ONBOARDING IN PROGRESS':'ONBOARDING NOT STARTED';
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.eyebrow}>KLEENEST FLEET</Text><Text style={s.title}>{workspace?.business_name||workspace?.name||'Fleet mission control'}</Text><Text style={s.copy}>{headline}</Text></View>
  {message?<Text style={s.message}>{message}</Text>:null}
  <View style={[s.onboardingPanel,onboardingComplete?s.onboardingDone:hasDraft?s.onboardingProgress:s.onboardingMissing]}><View style={s.onboardingDot}><Text style={s.onboardingDotText}>{onboardingComplete?'✓':hasDraft?'…':'!'}</Text></View><View style={{flex:1,gap:2}}><Text style={s.eyebrowDark}>{onboardingStatus}</Text><Text style={s.onboardingTitle}>{onboardingComplete?'Fleet is using your targeted operating profile.':hasDraft?'Your Fleet onboarding answers are saved.':'Fleet onboarding has not been completed yet.'}</Text><Text style={s.meta}>{hasDraft?'Goals, pain points and team ownership are already shaping the priority surfaces below.':'Complete onboarding so Fleet can prioritize the right dispatch, workforce, service-verification and reporting workflows.'}</Text></View><Link href="/onboarding" style={s.onboardingLink}>{onboardingComplete?'Review':'Continue'} →</Link></View>
  <View style={s.portfolioPanel}><View style={{flex:1,gap:2}}><Text style={s.eyebrowDark}>LOCATION AUTHORITY</Text><Text style={s.portfolioTitle}>{portfolioLocations} Portfolio locations</Text><Text style={s.meta}>{networkLocations>0?String(networkLocations)+' locations come through active Enterprise network authority; they remain labeled as network portfolio locations.':'Fleet is operating against the direct Business location portfolio.'}</Text></View><Link href="/signals" style={s.portfolioLink}>Live Network →</Link></View>
  <View style={s.metrics}><Metric label="Portfolio locations" value={portfolioLocations}/><Metric label="Current dispatch" value={count(data?.dispatch)}/><Metric label="Open alerts" value={count(data?.alerts)}/><Metric label="Exceptions" value={count(data?.exceptions)}/><Metric label="Preventive work" value={count(data?.opportunities)}/><Metric label="Parity surfaces" value={FLEET_PARITY.length}/></View>
  {priority.length?<View style={s.priorityWrap}><Text style={s.eyebrowDark}>YOUR PRIORITIES</Text><Text style={s.sectionTitle}>Targeted from onboarding</Text><Text style={s.meta}>Fleet is putting the workflows tied to your goals, pain points and team ownership first.</Text>{priority.map(([href,title,body])=><Link key={href} href={href as any} asChild><Pressable accessibilityRole="button" style={[s.card,s.priorityCard]}><View style={{flex:1,gap:4}}><Text style={s.priorityLabel}>PRIORITY</Text><Text style={s.cardTitle}>{title}</Text><Text style={s.meta}>{body}</Text></View><Text style={s.arrow}>›</Text></Pressable></Link>)}</View>:null}
  <View style={s.section}><Text style={s.sectionTitle}>All Fleet tools</Text><Text style={s.meta}>Every card opens an operating surface with actual controls, not a read-only status page.</Text></View>
  {remaining.map(([href,title,body])=><Link key={href} href={href as any} asChild><Pressable accessibilityRole="button" style={s.card}><View style={{flex:1,gap:4}}><Text style={s.cardTitle}>{title}</Text><Text style={s.meta}>{body}</Text></View><Text style={s.arrow}>›</Text></Pressable></Link>)}
  <View style={s.links}><Link href="/notifications" style={s.link}>Notifications</Link><Link href="/account" style={s.link}>Account</Link><Link href="/support" style={s.link}>Support</Link><Link href="/terms" style={s.link}>Terms</Link><Link href="/privacy" style={s.link}>Privacy</Link></View>
 </ScrollView>
}
function Metric({label,value}:{label:string;value:number}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,paddingBottom:70,backgroundColor:'#f3f6f4'},hero:{backgroundColor:'#173f2d',padding:20,borderRadius:24,gap:8},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:'#c7e8d5'},eyebrowDark:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#557060'},title:{fontSize:30,fontWeight:'900',color:'#fff'},copy:{fontSize:14,lineHeight:21,color:'#deebe4'},message:{fontWeight:'800',color:'#7b493a'},onboardingPanel:{borderRadius:18,padding:13,borderWidth:1,flexDirection:'row',alignItems:'center',gap:10},onboardingDone:{backgroundColor:'#e7f3eb',borderColor:'#c2dccb'},onboardingProgress:{backgroundColor:'#fff6df',borderColor:'#ead8a9'},onboardingMissing:{backgroundColor:'#fff',borderColor:'#d9e2dc'},onboardingDot:{width:36,height:36,borderRadius:12,backgroundColor:'#173f2d',alignItems:'center',justifyContent:'center'},onboardingDotText:{color:'#fff',fontSize:17,fontWeight:'900'},onboardingTitle:{fontSize:14,fontWeight:'900',color:'#173528'},onboardingLink:{fontSize:11,fontWeight:'900',color:'#173f2d'},portfolioPanel:{backgroundColor:'#edf3ef',borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#d2dfd6'},portfolioTitle:{fontSize:19,fontWeight:'900',color:'#173f2d'},portfolioLink:{fontSize:11,fontWeight:'900',color:'#173f2d'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:9},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',padding:14,borderRadius:17,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:22,fontWeight:'900',color:'#173d2b'},meta:{fontSize:12,lineHeight:18,color:'#64756b'},section:{gap:4,marginTop:4},sectionTitle:{fontSize:21,fontWeight:'900',color:'#102218'},priorityWrap:{backgroundColor:'#eaf4ed',borderRadius:20,padding:13,gap:9,borderWidth:1,borderColor:'#cfe1d5'},priorityCard:{borderWidth:2,borderColor:'#b9d3c1'},priorityLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#557060'},card:{backgroundColor:'#fff',padding:15,borderRadius:17,borderWidth:1,borderColor:'#dbe5de',flexDirection:'row',alignItems:'center',gap:12},cardTitle:{fontSize:17,fontWeight:'900',color:'#102218'},arrow:{fontSize:28,color:'#173d2b'},links:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:5},link:{backgroundColor:'#edf3ef',color:'#173d2b',fontWeight:'900',paddingHorizontal:12,paddingVertical:10,borderRadius:999}});
