import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { SectionHeader, useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';

type Metric = { event_name:string; events:number };
type Session = {
  session_id:string;
  visitor_label:string;
  started_at:string;
  last_seen_at:string;
  last_action:string;
  event_count:number;
};
type Event = {
  event_name:string;
  occurred_at:string;
  location_name:string|null;
  context:Record<string,unknown>;
};
type Snapshot = {
  updated_at:string;
  days:number;
  historical_guest_sessions:number;
  tracked_events:number;
  tracked_sessions:number;
  approximate_visitors:number;
  engaged_sessions:number;
  navigation_sessions:number;
  zero_result_sessions:number;
  returning_visitors:number;
  registrations_linked:number;
  acquisition_events:Metric[];
  events_by_type:Metric[];
  recent_sessions:Session[];
};
function format(value:unknown){return typeof value==='number'?value.toLocaleString():'Unavailable'}
function readable(name:string){return String(name).replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase())}
function dateTime(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':date.toLocaleString()}
export default function GuestInsights(){
  const theme=usePlatformTheme();
  const card=useOSCardStyle();
  const [days,setDays]=useState<7|30>(7);
  const [data,setData]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Session|null>(null);
  const [events,setEvents]=useState<Event[]>([]);
  const [detailBusy,setDetailBusy]=useState(false);
  const load=useCallback(async()=>{
    const {data:response,error:rpcError}=await getKleenestSupabaseClient().rpc('owner_guest_journey_snapshot',{p_days:days});
    if(rpcError)throw rpcError;
    if(!response || typeof response.tracked_events!=='number' || !Array.isArray(response.recent_sessions))throw new Error('Guest Insights returned incomplete data.');
    setData(response as Snapshot);
    setError('');
  },[days]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setSelected(null);
    setEvents([]);
    void load().catch(reason=>{if(active){setData(null);setError(reason?.message||'Guest Insights unavailable.')}}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[load]);
  const refresh=async()=>{
    setRefreshing(true);
    try{await load()}catch(reason:any){setError(reason?.message||'Refresh unavailable.')}finally{setRefreshing(false)}
  };
  const open=async(session:Session)=>{
    if(selected?.session_id===session.session_id){setSelected(null);setEvents([]);return}
    setSelected(session);
    setEvents([]);
    setDetailBusy(true);
    try{
      const result=await getKleenestSupabaseClient().rpc('owner_guest_journey_session',{p_session_id:session.session_id});
      if(result.error)throw result.error;
      setEvents(Array.isArray(result.data)?result.data:[]);
    }catch(reason:any){setError(reason?.message||'Could not load guest timeline.')}
    finally{setDetailBusy(false)}
  };
  const MetricCard=({title,value,detail}:{title:string;value:unknown;detail:string})=><View style={{...card,flexGrow:1,minWidth:138,flexBasis:'43%',gap:5}}>
    <Text style={{color:theme.muted,fontSize:12,fontWeight:'700'}}>{title}</Text>
    <Text style={{color:theme.ink,fontSize:25,fontWeight:'900'}}>{format(value)}</Text>
    <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>{detail}</Text>
  </View>;
  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,paddingBottom:80,gap:13,backgroundColor:theme.canvas}}>
    <SectionHeader title="Guest Insights" body="Anonymous journeys, engagement, acquisition and friction. Private to the platform owner."/>
    <View style={{flexDirection:'row',gap:9}}>
      {([7,30] as const).map(period=><Pressable key={period} onPress={()=>setDays(period)} accessibilityRole="button" accessibilityState={{selected:days===period}} style={{...card,paddingVertical:10,backgroundColor:days===period?theme.accent:theme.surface,flex:1,alignItems:'center'}}>
        <Text style={{color:days===period?theme.accentText:theme.ink,fontWeight:'900'}}>{period} days</Text>
      </Pressable>)}
    </View>
    {loading?<ActivityIndicator size="large" color={theme.accent}/>:null}
    {error?<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>:null}
    {data?<>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <MetricCard title="Guest sessions · legacy tally" value={data.historical_guest_sessions} detail="Recorded foreground sessions, not people"/>
        <MetricCard title="Journeys tracked" value={data.tracked_sessions} detail="Sessions with detailed event coverage"/>
        <MetricCard title="Approximate visitors" value={data.approximate_visitors} detail="Distinct first-party IDs; not guaranteed unique people"/>
        <MetricCard title="Returning visitor IDs" value={data.returning_visitors} detail="Seen in multiple tracked sessions"/>
        <MetricCard title="Engaged sessions" value={data.engaged_sessions} detail="Selected a place, navigated or started a review"/>
        <MetricCard title="Navigated" value={data.navigation_sessions} detail="Sessions with directions started"/>
        <MetricCard title="No-results sessions" value={data.zero_result_sessions} detail="Missing results worth investigating"/>
        <MetricCard title="Linked registrations" value={data.registrations_linked} detail="Recently created accounts linked to prior guest activity"/>
      </View>
      <View style={{...card,gap:6}}>
        <Text style={{color:theme.ink,fontWeight:'900',fontSize:16}}>Understanding coverage</Text>
        <Text style={{color:theme.muted,lineHeight:21}}>Legacy session tally and historical acquisition events use different identifiers. They cannot be merged into verified unique visitors. Detailed journeys and conversions are only counted from the new instrumented release onward.</Text>
        <Text style={{color:theme.muted}}>Updated {dateTime(data.updated_at)} · {format(data.tracked_events)} detailed events recorded for this period</Text>
      </View>
      <View style={{...card,gap:9}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Acquisition actions · historical source</Text>
        {data.acquisition_events?.length?data.acquisition_events.map(item=><View key={item.event_name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}>
          <Text style={{color:theme.muted,flex:1}}>{readable(item.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(item.events)}</Text>
        </View>):<Text style={{color:theme.muted}}>No events in this window.</Text>}
        <Text style={{color:theme.muted,fontSize:12}}>Install intent does not prove an installation. Actions may repeat.</Text>
      </View>
      <View style={{...card,gap:9}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Guest behavior · newly tracked</Text>
        {data.events_by_type?.length?data.events_by_type.map(item=><View key={item.event_name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}>
          <Text style={{color:theme.muted,flex:1}}>{readable(item.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(item.events)}</Text>
        </View>):<Text style={{color:theme.muted}}>New telemetry will appear after the updated app records guest activity.</Text>}
      </View>
      <View style={{gap:9}}>
        <SectionHeader title="Recent guest sessions" body="Choose a session to inspect its chronological actions, without personal identity or raw location history."/>
        {!data.recent_sessions?.length?<View style={card}><Text style={{color:theme.muted}}>No detailed guest sessions recorded yet.</Text></View>:null}
        {data.recent_sessions?.map(session=><View key={session.session_id} style={{...card,gap:7}}>
          <Pressable accessibilityRole="button" accessibilityState={{expanded:selected?.session_id===session.session_id}} onPress={()=>void open(session)} style={{gap:4}}>
            <Text style={{color:theme.accent,fontSize:16,fontWeight:'900'}}>Guest {session.visitor_label}  {selected?.session_id===session.session_id?'▴':'▾'}</Text>
            <Text style={{color:theme.ink}}>{readable(session.last_action)} · {format(session.event_count)} events</Text>
            <Text style={{color:theme.muted,fontSize:12}}>Last active {dateTime(session.last_seen_at)}</Text>
          </Pressable>
          {selected?.session_id===session.session_id?<View style={{gap:8,borderTopWidth:1,borderColor:theme.line,paddingTop:10}}>
            {detailBusy?<ActivityIndicator color={theme.accent}/>:null}
            {!detailBusy&&events.length===0?<Text style={{color:theme.muted}}>No events available for this session.</Text>:null}
            {!detailBusy&&events.map((entry,i)=><View key={i} style={{gap:2,paddingVertical:5}}>
              <Text style={{color:theme.ink,fontWeight:'800'}}>{readable(entry.event_name)}{entry.location_name?` · ${entry.location_name}`:''}</Text>
              <Text style={{color:theme.muted,fontSize:12}}>{dateTime(entry.occurred_at)}</Text>
              {entry.context&&Object.keys(entry.context).length?<Text style={{color:theme.muted,fontSize:12}}>{Object.entries(entry.context).map(([key,value])=>`${readable(key)}: ${String(value)}`).join(' · ')}</Text>:null}
            </View>)}
          </View>:null}
        </View>)}
      </View>
      <Text style={{color:theme.muted,lineHeight:19,fontSize:12}}>Guest identifiers are pseudonymous first-party random IDs. No device fingerprinting, IP addresses, exact GPS traces or raw search strings are saved by this system. Events are capped per session and retained for up to 30 days while new activity is arriving.</Text>
    </>:null}
  </ScrollView>;
}
