import { Link } from 'expo-router';
import { useCallback,useEffect,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';
import { DiagnosticDisclosure,HealthCard,OSHero,SectionHeader,StatusPill } from '../components/KleenestOS';
import { getOwnerOperationsBundle } from '../services/ownerAdmin';
import { usePlatformTheme } from '../services/theme';

type Ops=Awaited<ReturnType<typeof getOwnerOperationsBundle>>;
function count(value:unknown){
  if(Array.isArray(value))return value.length;
  if(value&&typeof value==='object')return Object.keys(value as Record<string,unknown>).length;
  return Number(value||0);
}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function newestFirst(rows:Record<string,unknown>[]){
  return rows.sort((a,b)=>{
    const aTime=Date.parse(String(a.created_at||''))||0;
    const bTime=Date.parse(String(b.created_at||''))||0;
    return bTime-aTime;
  });
}
function activityRows(value:unknown):Record<string,unknown>[]{
  if(Array.isArray(value))return newestFirst(value.map(object));
  const record=object(value);
  for(const key of ['events','items','rows','results'])if(Array.isArray(record[key]))return newestFirst((record[key] as unknown[]).map(object));
  return [];
}
function humanize(value:unknown,fallback='Platform event'){
  if(typeof value!=='string'||!value.trim())return fallback;
  const label=value.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  return label.charAt(0).toUpperCase()+label.slice(1);
}
function activityTime(value:unknown){
  if(typeof value!=='string')return 'Time unavailable';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(date);
}
function activityTone(value:unknown):'good'|'warning'|'danger'|'neutral'{
  const status=String(value||'').toLowerCase();
  if(/fail|error|blocked|denied/.test(status))return 'danger';
  if(/pending|review|warning|retry/.test(status))return 'warning';
  if(/recorded|success|complete|delivered|resolved/.test(status))return 'good';
  return 'neutral';
}
function ActivityEntry({event}:{event:Record<string,unknown>}){
  const theme=usePlatformTheme();
  const action=typeof event.action==='string'?event.action:humanize(event.event_type);
  const type=humanize(event.event_type,'Platform activity');
  const status=humanize(event.status,'Recorded');
  return <View style={{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line,borderRadius:14,padding:13,gap:7}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <Text style={{fontSize:15,fontWeight:'800',color:theme.ink,flex:1}}>{action}</Text>
      <StatusPill label={status} tone={activityTone(event.status)}/>
    </View>
    <Text style={{fontSize:12,color:theme.muted}}>{type} · {activityTime(event.created_at)}</Text>
  </View>;
}

export default function Operations(){
  const theme=usePlatformTheme();
  const[data,setData]=useState<Ops|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setBusy(true);setError(null);
    try{setData(await getOwnerOperationsBundle())}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  },[]);
  useEffect(()=>{void load()},[load]);
  const overview=object(data?.overview),integrity=object(data?.integrity);
  const activity=activityRows(data?.activity);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={{padding:18,gap:16,paddingBottom:70,backgroundColor:theme.canvas}}>
    <Link href="/ai-jobs" asChild><Pressable accessibilityRole="link" accessibilityLabel="Open AI investigations and results" style={{padding:15,gap:6,borderWidth:2,borderRadius:16,borderColor:theme.accent,backgroundColor:theme.surface}}><Text style={{color:theme.accent,fontSize:11,fontWeight:"900",letterSpacing:1}}>KLEENESTOS AI</Text><Text style={{color:theme.ink,fontSize:20,fontWeight:"900"}}>AI Jobs & Results →</Text><Text style={{color:theme.muted}}>Review model findings, queued investigations, independent challenges and provider status.</Text></Pressable></Link>
    <OSHero eyebrow="KLEENESTOS · PLATFORM HEALTH" title="Platform Health" body="Monitor integrity, delivery, backend resources and recent platform activity. Interactive Discovery is the canonical acquisition path; legacy national-ingestion controls are retired, and current operations live in the dedicated Ingestion Control center."/>
    <View style={{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line,borderRadius:16,padding:14,gap:4}}>
      <Text style={{fontWeight:'900',color:theme.ink}}>Discovery is the acquisition authority</Text>
      <Text style={{color:theme.muted}}>Platform Health focuses on integrity, delivery and backend resources; ingestion operations are managed in the dedicated Ingestion Control center.</Text>
    </View>
    {error?<View style={{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.danger,borderRadius:16,padding:14,gap:4}}><Text style={{fontWeight:'900',color:theme.danger}}>Platform health unavailable</Text><Text style={{color:theme.danger}}>{error}</Text></View>:null}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
      <HealthCard label="Integrity" value={count(integrity)} detail="Authoritative integrity summary signals"/>
      <HealthCard label="Activity" value={count(data?.activity)} detail="Recent audited platform events"/>
      <HealthCard label="Resources" value={count(data?.resources)} detail="Backend resource catalog entries"/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Platform health" body="Current service health and integrity signals."/>
      <DiagnosticDisclosure title="technical overview details" value={overview}/>
      <DiagnosticDisclosure title="technical integrity details" value={integrity}/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Delivery health" body="Web and native notification delivery in the last 24 hours."/>
      <DiagnosticDisclosure title="technical web push details" value={data?.push}/>
      <DiagnosticDisclosure title="technical native push details" value={data?.nativePush}/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Backend resources" body="Resource details for platform support. Technical fields are available when needed."/>
      <DiagnosticDisclosure title="technical backend resource details" value={data?.resources}/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Recent platform activity" body="A readable timeline of recent administrative and system events."/>
      {activity.length?activity.slice(0,30).map((event,index)=><ActivityEntry key={String(event.id||index)} event={event}/>):<View style={{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line,borderRadius:14,padding:14}}><Text style={{color:theme.muted}}>No recent platform activity is available.</Text></View>}
    </View>
  </ScrollView>
}
