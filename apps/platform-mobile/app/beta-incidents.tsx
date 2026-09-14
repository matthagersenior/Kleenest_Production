import { useEffect,useMemo,useState } from 'react';
import { Modal,Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';
import {
  listOwnerBetaIncidents,
  listOwnerBetaReportEvents,
  setOwnerBetaIncidentStatus,
  type BetaIncident,
  type BetaIncidentStatus,
  type BetaReportEvent,
} from '@kleenest/mobile-core';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';

const statuses:BetaIncidentStatus[]=['new','reproduced','investigating','fixed','shipped'];
const filters:(BetaIncidentStatus|'all')[]=['all',...statuses];

function tone(status:BetaIncidentStatus):'good'|'warning'|'danger'|'neutral'{
  if(status==='new'||status==='reproduced')return'danger';
  if(status==='investigating')return'warning';
  if(status==='fixed'||status==='shipped')return'good';
  return'neutral';
}
function when(value:string){try{return new Date(value).toLocaleString()}catch{return value}}
function short(value:unknown,max=180){const result=String(value??'').trim();return result.length>max?result.slice(0,max-1)+'…':result}

export default function BetaIncidentsScreen(){
  const theme=usePlatformTheme();
  const card=useOSCardStyle();
  const[filter,setFilter]=useState<BetaIncidentStatus|'all'>('all');
  const[rows,setRows]=useState<BetaIncident[]>([]);
  const[selected,setSelected]=useState<BetaIncident|null>(null);
  const[events,setEvents]=useState<BetaReportEvent[]>([]);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');

  async function load(nextFilter:BetaIncidentStatus|'all'=filter){
    setBusy(true);
    try{
      setRows(await listOwnerBetaIncidents(160,nextFilter==='all'?null:nextFilter));
      setMessage('');
    }catch(error:any){setMessage(error?.message||'Beta incidents could not be loaded.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load(filter)},[filter]);

  async function openIncident(incident:BetaIncident){
    setSelected(incident);
    setEvents([]);
    try{setEvents(await listOwnerBetaReportEvents(incident.id,60))}
    catch(error:any){setMessage(error?.message||'Incident reports could not be loaded.')}
  }
  async function changeStatus(status:BetaIncidentStatus){
    if(!selected)return;
    setBusy(true);
    try{
      await setOwnerBetaIncidentStatus(selected.id,status);
      const refreshed={...selected,status,updated_at:new Date().toISOString()};
      setSelected(refreshed);
      await load(filter);
      setMessage(status==='fixed'||status==='shipped'?'Status updated. Signed-in reporters were notified to retry the issue.':'Incident status updated.');
    }catch(error:any){setMessage(error?.message||'Incident status could not be updated.');setBusy(false)}
  }

  const counts=useMemo(()=>({
    active:rows.filter(row=>['new','reproduced','investigating'].includes(row.status)).length,
    repeats:rows.reduce((sum,row)=>sum+Math.max(0,Number(row.occurrence_count||0)-1),0),
  }),[rows]);

  return <>
    <ScrollView
      refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load(filter)}/>}
      contentContainerStyle={{padding:15,paddingBottom:90,gap:14,backgroundColor:theme.canvas}}
    >
      <OSHero
        eyebrow="KLEENESTOS · OPEN BETA"
        title="BETA INCIDENTS"
        body="Live reports from the app, automatically deduplicated by failure signature so repeated user taps become evidence instead of duplicate tickets."
      >
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
          <StatusPill label={`${counts.active} ACTIVE`} tone={counts.active?'warning':'good'}/>
          <StatusPill label={`${counts.repeats} REPEATS`} tone={counts.repeats?'warning':'neutral'}/>
          <StatusPill label={`${rows.length} SHOWN`} tone="neutral"/>
        </View>
      </OSHero>

      {message?<View style={{...card,borderColor:theme.warning}}><Text style={{color:theme.warning,fontWeight:'800'}}>{message}</Text></View>:null}

      <View style={{gap:8}}>
        <SectionHeader title="Incident queue" body="New and reproduced failures stay at the top. Open one to see exact reports, runtime/build information, breadcrumbs and the latest raw error."/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
          {filters.map(item=>{
            const active=filter===item;
            return <Pressable key={item} onPress={()=>setFilter(item)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:active?theme.accent:theme.accentSoft}}>
              <Text style={{fontWeight:'900',fontSize:11,color:active?theme.accentText:theme.accent}}>{item.replaceAll('_',' ').toUpperCase()}</Text>
            </Pressable>;
          })}
        </ScrollView>
      </View>

      <View style={{gap:9}}>
        {rows.map(row=><Pressable key={row.id} onPress={()=>void openIncident(row)} style={{...card,gap:8}}>
          <View style={{flexDirection:'row',alignItems:'flex-start',gap:10}}>
            <View style={{flex:1,gap:3}}>
              <Text style={{fontSize:16,fontWeight:'900',color:theme.ink}}>{row.title}</Text>
              <Text style={{fontSize:12,color:theme.muted,fontWeight:'700'}}>{row.app_surface} · {row.category} · last seen {when(row.last_seen)}</Text>
            </View>
            <StatusPill label={row.status.toUpperCase()} tone={tone(row.status)}/>
          </View>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            <StatusPill label={`${row.occurrence_count} REPORT${row.occurrence_count===1?'':'S'}`} tone={row.occurrence_count>1?'warning':'neutral'}/>
            {row.last_app_version?<StatusPill label={`APP ${row.last_app_version}`} tone="neutral"/>:null}
            {row.last_runtime_version?<StatusPill label={`RUNTIME ${short(row.last_runtime_version,28)}`} tone="neutral"/>:null}
          </View>
          {row.last_route?<Text style={{color:theme.accent,fontWeight:'800'}}>Screen · {row.last_route}</Text>:null}
          {row.last_error?<Text selectable style={{color:theme.muted,lineHeight:18}}>{short(row.last_error,260)}</Text>:null}
        </Pressable>)}
        {!rows.length&&!busy?<View style={card}><Text style={{fontSize:16,fontWeight:'900',color:theme.ink}}>No incidents in this view.</Text><Text style={{color:theme.muted}}>Beta reports will appear here as soon as they are submitted or a captured failure reconnects.</Text></View>:null}
      </View>
    </ScrollView>

    <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={()=>setSelected(null)}>
      {selected?<ScrollView contentContainerStyle={{padding:16,paddingBottom:60,gap:13,backgroundColor:theme.canvas}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
          <View style={{flex:1,gap:3}}>
            <Text style={{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:theme.accent}}>INCIDENT {selected.id.slice(0,8).toUpperCase()}</Text>
            <Text style={{fontSize:25,lineHeight:29,fontWeight:'900',color:theme.ink}}>{selected.title}</Text>
          </View>
          <Pressable onPress={()=>setSelected(null)} style={{padding:10,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Close</Text></Pressable>
        </View>

        <View style={{...card,gap:8}}>
          <SectionHeader title="Triage state" body="Fixed and Shipped notify signed-in reporters that they should retry the original problem."/>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            {statuses.map(status=><Pressable key={status} disabled={busy} onPress={()=>void changeStatus(status)} style={{paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:selected.status===status?theme.accent:theme.accentSoft,opacity:busy?0.65:1}}>
              <Text style={{fontWeight:'900',fontSize:10,color:selected.status===status?theme.accentText:theme.accent}}>{status.replaceAll('_',' ').toUpperCase()}</Text>
            </Pressable>)}
          </View>
        </View>

        <View style={{...card,gap:6}}>
          <SectionHeader title="Latest diagnostic" body={`${selected.occurrence_count} total report${selected.occurrence_count===1?'':'s'} · first seen ${when(selected.first_seen)}`}/>
          {selected.last_route?<Text style={{color:theme.ink,fontWeight:'800'}}>Route: {selected.last_route}</Text>:null}
          {selected.last_error?<Text selectable style={{fontFamily:'monospace',fontSize:11,lineHeight:17,color:theme.muted}}>{selected.last_error}</Text>:null}
          <Text selectable style={{fontFamily:'monospace',fontSize:10,lineHeight:16,color:theme.muted}}>{JSON.stringify(selected.sample_metadata||{},null,2)}</Text>
        </View>

        <View style={{gap:8}}>
          <SectionHeader title="Individual reports" body="Manual notes and automatic captures remain separate even when they resolve to the same incident."/>
          {events.map(event=><View key={event.id} style={{...card,gap:6}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}>
              <StatusPill label={event.report_kind.toUpperCase()} tone={event.report_kind==='automatic'?'warning':'neutral'}/>
              <Text style={{fontSize:11,color:theme.muted,fontWeight:'700'}}>{when(event.created_at)}</Text>
            </View>
            <Text style={{color:theme.ink,fontWeight:'800',lineHeight:19}}>{event.message}</Text>
            <Text style={{fontSize:11,color:theme.muted}}>{event.platform||'unknown platform'} · app {event.app_version||'unknown'} · runtime {short(event.runtime_version,34)}</Text>
            {Array.isArray(event.breadcrumbs)&&event.breadcrumbs.length?<Text selectable style={{fontFamily:'monospace',fontSize:10,lineHeight:15,color:theme.muted}}>Breadcrumbs: {JSON.stringify(event.breadcrumbs,null,2)}</Text>:null}
          </View>)}
          {!events.length?<View style={card}><Text style={{color:theme.muted}}>No individual event payloads loaded.</Text></View>:null}
        </View>
      </ScrollView>:null}
    </Modal>
  </>;
}
