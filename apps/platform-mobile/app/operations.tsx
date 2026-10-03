import { useCallback,useEffect,useState } from 'react';
import { RefreshControl,ScrollView,Text,View } from 'react-native';
import { DiagnosticDisclosure,HealthCard,OSHero,SectionHeader } from '../components/KleenestOS';
import { getOwnerOperationsBundle } from '../services/ownerAdmin';
import { usePlatformTheme } from '../services/theme';

type Ops=Awaited<ReturnType<typeof getOwnerOperationsBundle>>;
function count(value:unknown){
  if(Array.isArray(value))return value.length;
  if(value&&typeof value==='object')return Object.keys(value as Record<string,unknown>).length;
  return Number(value||0);
}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}

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
  return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={{padding:18,gap:16,paddingBottom:70,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · PLATFORM HEALTH" title="Platform Health" body="Monitor integrity, delivery, backend resources and recent platform activity. Interactive Discovery is the canonical acquisition path; legacy national-ingestion controls are retired."/>
    {error?<View style={{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.danger,borderRadius:16,padding:14,gap:4}}><Text style={{fontWeight:'900',color:theme.danger}}>Platform health unavailable</Text><Text style={{color:theme.danger}}>{error}</Text></View>:null}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
      <HealthCard label="Integrity" value={count(integrity)} detail="Authoritative integrity summary signals"/>
      <HealthCard label="Activity" value={count(data?.activity)} detail="Recent audited platform events"/>
      <HealthCard label="Resources" value={count(data?.resources)} detail="Backend resource catalog entries"/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Platform health" body="Authoritative overview and integrity diagnostics without obsolete ingestion controls."/>
      <DiagnosticDisclosure title="system overview diagnostics" value={overview}/>
      <DiagnosticDisclosure title="data integrity diagnostics" value={integrity}/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Delivery health" body="Web and native notification delivery in the last 24 hours."/>
      <DiagnosticDisclosure title="push delivery diagnostics" value={data?.push}/>
      <DiagnosticDisclosure title="native push diagnostics" value={data?.nativePush}/>
    </View>
    <View style={{gap:9}}>
      <SectionHeader title="Backend resources" body="Canonical resource state and recent audited activity."/>
      <DiagnosticDisclosure title="backend resource catalog" value={data?.resources}/>
      <DiagnosticDisclosure title="recent platform activity" value={data?.activity}/>
    </View>
  </ScrollView>
}
