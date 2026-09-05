import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const file=(path)=>new URL(path,root);
const read=(path)=>fs.readFileSync(file(path),'utf8');
const write=(path,source)=>fs.writeFileSync(file(path),source);
function replaceContract(source,from,to,label){
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`Consumer progression canonicalization drifted: ${label}`);
  return source.replace(from,to);
}
function replaceAll(source,from,to){return source.split(from).join(to)}

const changed=[];

{
  const path='apps/consumer-mobile/app/profile.tsx';
  let source=read(path),before=source;
  source=replaceAll(source,"router.push('/play')","router.push('/progress')");
  source=replaceAll(source,'route="/play"','route="/progress"');
  if(!source.includes("router.push('/progress')")||!source.includes('route="/progress"'))throw new Error('Profile did not produce canonical /progress entry points.');
  if(source!==before){write(path,source);changed.push(path)}
}

{
  const path='apps/consumer-mobile/app/location/[id].tsx';
  let source=read(path),before=source;
  source=replaceAll(source,"router.push('/play')","router.push('/progress')");
  source=replaceAll(source,'from Play','from Progress');
  source=replaceAll(source,'Open Play','Open Progress');
  if(source.includes("router.push('/play')"))throw new Error('Location details still routes progression to legacy /play.');
  if(source!==before){write(path,source);changed.push(path)}
}

{
  const path='apps/consumer-mobile/app/saved.tsx';
  let source=read(path),before=source;
  source=replaceAll(source,"router.push('/play')","router.push('/progress')");
  source=replaceAll(source,'from Play','from Progress');
  source=replaceAll(source,'clear it from Play','clear it from Progress');
  if(source.includes("router.push('/play')"))throw new Error('Saved trust missions still route to legacy /play.');
  if(source!==before){write(path,source);changed.push(path)}
}

{
  const path='apps/consumer-mobile/services/notificationRouting.ts';
  let source=read(path),before=source;
  source=replaceContract(source,'if(explicit)return explicit;',"if(explicit)return explicit==='/play'?'/progress':explicit;",'notification explicit destination normalization');
  source=replaceContract(source,"if(isProgress(data,type))return stringValue(data.game_challenge_id)||type.includes('game')||type.includes('challenge')?'/games':'/play';","if(isProgress(data,type))return stringValue(data.game_challenge_id)||type.includes('game')||type.includes('challenge')?'/games':'/progress';",'notification progression destination');
  if(source.includes("?'/games':'/play'"))throw new Error('Progress notifications still route to legacy /play.');
  if(source!==before){write(path,source);changed.push(path)}
}

{
  const path='apps/consumer-mobile/app/progress.tsx';
  let source=read(path),before=source;
  source=replaceContract(
    source,
    "import { getProgressionOverviewV2, listActiveObjectivesV2, listNearbyProgressionOpportunities, listProgressionRankingsV2 } from '../services/discoveryProgression';\nimport { palette } from '../components/ConsumerUI';",
    "import { getProgressionOverviewV2, listActiveObjectivesV2, listNearbyProgressionOpportunities, listProgressionRankingsV2 } from '../services/discoveryProgression';\nimport { clearTrustMission, readTrustMission, type TrustMission } from '../services/trustMissions';\nimport { palette } from '../components/ConsumerUI';",
    'Progress trust mission import',
  );
  source=replaceContract(
    source,
    " const[overview,setOverview]=useState<any>({}),[dashboard,setDashboard]=useState<any>({}),[objectives,setObjectives]=useState<any[]>([]),[rankings,setRankings]=useState<any[]>([]),[opportunities,setOpportunities]=useState<any[]>([]),[rankScope,setRankScope]=useState('global'),[loading,setLoading]=useState(false),[message,setMessage]=useState('');",
    " const[overview,setOverview]=useState<any>({}),[dashboard,setDashboard]=useState<any>({}),[objectives,setObjectives]=useState<any[]>([]),[rankings,setRankings]=useState<any[]>([]),[opportunities,setOpportunities]=useState<any[]>([]),[activeMission,setActiveMission]=useState<TrustMission|null>(null),[rankScope,setRankScope]=useState('global'),[loading,setLoading]=useState(false),[message,setMessage]=useState('');",
    'Progress trust mission state',
  );
  source=replaceContract(
    source,
    " async function load(scope=rankScope){setLoading(true);setMessage('');try{const[o,d,obj,r]=await Promise.all([getProgressionOverviewV2(),getMobileProgressionDashboard().catch(()=>({})),listActiveObjectivesV2(),listProgressionRankingsV2(scope)]);setOverview(o);setDashboard(d);setObjectives(obj);setRankings(r);const permission=await Location.getForegroundPermissionsAsync();",
    " async function load(scope=rankScope){setLoading(true);setMessage('');try{const[o,d,obj,r,tm]=await Promise.all([getProgressionOverviewV2(),getMobileProgressionDashboard().catch(()=>({})),listActiveObjectivesV2(),listProgressionRankingsV2(scope),readTrustMission().catch(()=>null)]);setOverview(o);setDashboard(d);setObjectives(obj);setRankings(r);setActiveMission(tm);const permission=await Location.getForegroundPermissionsAsync();",
    'Progress trust mission loading',
  );
  source=replaceContract(
    source,
    " async function changeScope(scope:string){setRankScope(scope);await load(scope)}",
    " async function changeScope(scope:string){setRankScope(scope);await load(scope)}\n async function clearActiveMission(){try{await clearTrustMission();setActiveMission(null);setMessage('Trust mission cleared.')}catch(error:any){setMessage(error?.message||'Trust mission could not be cleared.')}}",
    'Progress trust mission clear action',
  );
  source=replaceContract(
    source,
    "  {message?<Text style={s.message}>{message}</Text>:null}\n\n  <Header kicker=\"SPECIALTY LEVELS\"",
    "  {message?<Text style={s.message}>{message}</Text>:null}\n  {activeMission?.status==='active'?<View style={s.card}><Text style={s.kicker}>ACTIVE TRUST MISSION</Text><Text style={s.cardTitle}>{activeMission.locationName}</Text><Text style={s.body}>{activeMission.title||'Complete the verified evidence goal at this restroom.'}</Text><View style={s.actions}><Pressable style={s.primary} onPress={()=>router.push({pathname:'/location/[id]',params:{id:activeMission.locationId,mission:'1'}})}><Text style={s.primaryText}>Resume mission</Text></Pressable><Pressable style={s.secondary} onPress={clearActiveMission}><Text style={s.secondaryText}>Clear mission</Text></Pressable></View></View>:null}\n\n  <Header kicker=\"SPECIALTY LEVELS\"",
    'Progress active trust mission card',
  );
  for(const token of ['readTrustMission','clearTrustMission','ACTIVE TRUST MISSION','Resume mission','Clear mission'])if(!source.includes(token))throw new Error(`Progress trust mission integration missing ${token}.`);
  if(source!==before){write(path,source);changed.push(path)}
}

console.log(`Consumer progression canonicalized to /progress with trust missions integrated (${changed.length?changed.join(', '):'source already canonical'}).`);
