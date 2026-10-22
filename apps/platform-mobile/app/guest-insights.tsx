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
type Visitor = {
  visitor_label:string;
  first_seen_at:string;
  last_seen_at:string;
  session_count:number;
  event_count:number;
  active_days:number;
  place_selections:number;
  navigation_starts:number;
  review_actions:number;
  install_actions:number;
  friction_events:number;
  registration_linked:boolean;
  last_action:string;
  sessions:Session[];
};
type VisitorFilter='all'|'returning'|'multi_day'|'single'|'friction'|'engaged';
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
  install_browser_events?:Array<{device_kind:string;browser_kind:string;event_name:string;events:number}>;
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
  const [visitors,setVisitors]=useState<Visitor[]>([]);
  const [visitorError,setVisitorError]=useState('');
  const [selectedVisitor,setSelectedVisitor]=useState<string|null>(null);
  const [visitorFilter,setVisitorFilter]=useState<VisitorFilter>('all');
  const [visitorSort,setVisitorSort]=useState<'recent'|'frequent'>('recent');
  const [events,setEvents]=useState<Event[]>([]);
  const [detailBusy,setDetailBusy]=useState(false);
  const load=useCallback(async()=>{
    const [snapshot,groups]=await Promise.all([
      getKleenestSupabaseClient().rpc('owner_guest_journey_snapshot',{p_days:days}),
      getKleenestSupabaseClient().rpc('owner_guest_visitor_groups',{p_days:days}),
    ]);
    const {data:response,error:rpcError}=snapshot;
    if(rpcError)throw rpcError;
    if(!response || typeof response.tracked_events!=='number' || !Array.isArray(response.recent_sessions))throw new Error('Guest Insights returned incomplete data.');
    setData(response as Snapshot);
    if(groups.error || !Array.isArray(groups.data)){
      setVisitors([]);
      setVisitorError(groups.error?.message||'Guest grouping unavailable.');
    }else{
      setVisitors(groups.data as Visitor[]);
      setVisitorError('');
    }
    setError('');
  },[days]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setSelected(null);
    setSelectedVisitor(null);
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
  const installCount=(name:string)=>data?.acquisition_events?.find(item=>item.event_name===name)?.events??0;
  const visibleVisitors=visitors.filter(visitor=>{
    if(visitorFilter==='returning')return visitor.session_count>1;
    if(visitorFilter==='multi_day')return visitor.active_days>1;
    if(visitorFilter==='single')return visitor.session_count===1;
    if(visitorFilter==='friction')return visitor.friction_events>0;
    if(visitorFilter==='engaged')return visitor.place_selections+visitor.navigation_starts+visitor.review_actions>0;
    return true;
  }).sort((a,b)=>visitorSort==='frequent'
    ? b.session_count-a.session_count || Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at)
    : Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at));
  const filterLabels:Record<VisitorFilter,string>={all:'All',returning:'Repeat sessions',multi_day:'Multi-day',single:'One session',friction:'Friction',engaged:'Engaged'};
  const MetricCard=({title,value,detail}:{title:string;value:unknown;detail:string})=><View style={{...card,flexGrow:1,minWidth:138,flexBasis:'43%',gap:5}}>
    <Text style={{color:theme.muted,fontSize:12,fontWeight:'700'}}>{title}</Text>
    <Text style={{color:theme.ink,fontSize:25,fontWeight:'900'}}>{format(value)}</Text>
    <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>{detail}</Text>
  </View>;
  return <ScrollView style={{flex:1,backgroundColor:theme.canvas}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,paddingBottom:80,gap:13,backgroundColor:theme.canvas,minHeight:'100%'}}>
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
      <View style={{...card,gap:8}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Installation progress</Text>
        {(['landing_view','install_intent','install_guidance_view','install_prompt_accepted','install_prompt_dismissed','install_success','installed_app_launch'] as const).map(name=><View key={name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}><Text style={{color:theme.muted,flex:1}}>{readable(name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(installCount(name))}</Text></View>)}
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Events are not unique people. New install stages begin after the upgrade; older versions could count an accepted browser prompt as installation success.</Text>
        <Text style={{color:theme.ink,fontWeight:'900'}}>Install activity by device and browser</Text>
        {data.install_browser_events?.length ? data.install_browser_events.filter(entry=>['install_intent','install_success','installed_app_launch'].includes(entry.event_name)).map((entry,i)=><View key={i} style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={{color:theme.muted,flex:1,fontSize:12}}>{readable(entry.device_kind)} · {readable(entry.browser_kind)} · {readable(entry.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(entry.events)}</Text></View>) : <Text style={{color:theme.muted,fontSize:12}}>Breakdown begins when the upgraded instrumentation records activity.</Text>}
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
        <SectionHeader title="Guest histories" body="Group observed sessions by their existing first-party visitor identifier. One identifier can still be shared, reset or reused; it does not prove a person's identity."/>
        {visitorError?<Text accessibilityRole="alert" style={{color:theme.danger}}>Grouped histories unavailable: {visitorError}. Showing recent individual sessions instead.</Text>:null}
        {!visitorError&&visitors.length>0?<View style={{gap:9}}>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            {(['all','returning','multi_day','single','friction','engaged'] as const).map(filter=><Pressable key={filter} accessibilityRole="button" accessibilityState={{selected:visitorFilter===filter}} onPress={()=>setVisitorFilter(filter)} style={{borderWidth:1,borderColor:visitorFilter===filter?theme.accent:theme.line,backgroundColor:visitorFilter===filter?theme.accent:theme.surface,borderRadius:9,paddingHorizontal:11,paddingVertical:8}}>
              <Text style={{color:visitorFilter===filter?theme.accentText:theme.ink,fontWeight:'800',fontSize:12}}>{filterLabels[filter]}</Text>
            </Pressable>)}
          </View>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10}}>
            <Text style={{color:theme.muted,fontSize:12}}>{visibleVisitors.length} grouped IDs shown · {visitors.length} loaded</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Change guest sorting" onPress={()=>setVisitorSort(value=>value==='recent'?'frequent':'recent')} style={{padding:9,borderRadius:8,borderWidth:1,borderColor:theme.line}}>
              <Text style={{color:theme.accent,fontWeight:'800',fontSize:12}}>{visitorSort==='recent'?'Most recent ▾':'Most sessions ▾'}</Text>
            </Pressable>
          </View>
          {visitors.length < (data?.approximate_visitors||0)?<Text style={{color:theme.muted,fontSize:12}}>Showing the 200 most recently active IDs at most; totals include all IDs in the period.</Text>:null}
          {!visibleVisitors.length?<View style={card}><Text style={{color:theme.muted}}>No guest histories match this filter.</Text></View>:null}
          {visibleVisitors.map(visitor=><View key={visitor.visitor_label} style={{...card,gap:8}}>
            <Pressable accessibilityRole="button" accessibilityState={{expanded:selectedVisitor===visitor.visitor_label}} onPress={()=>{
              setSelectedVisitor(value=>value===visitor.visitor_label?null:visitor.visitor_label);
              setSelected(null);setEvents([]);
            }} style={{gap:4}}>
              <Text style={{color:theme.accent,fontWeight:'900',fontSize:16}}>Guest {visitor.visitor_label} · {visitor.session_count>1?'Returning':'One observed session'} {selectedVisitor===visitor.visitor_label?'▴':'▾'}</Text>
              <Text style={{color:theme.ink,fontWeight:'700'}}>{format(visitor.session_count)} sessions · {format(visitor.event_count)} events · {format(visitor.active_days)} active days</Text>
              <Text style={{color:theme.muted,fontSize:12}}>Last action: {readable(visitor.last_action)} · {dateTime(visitor.last_seen_at)}</Text>
              <Text style={{color:theme.muted,fontSize:12}}>First observed in period: {dateTime(visitor.first_seen_at)}</Text>
            </Pressable>
            {selectedVisitor===visitor.visitor_label?<View style={{gap:9,borderTopWidth:1,borderColor:theme.line,paddingTop:10}}>
              <Text style={{color:theme.ink,fontWeight:'800'}}>Behavior across sessions</Text>
              <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Places opened: {format(visitor.place_selections)} · Directions: {format(visitor.navigation_starts)} · Review actions: {format(visitor.review_actions)} · Installation actions: {format(visitor.install_actions)} · Search friction: {format(visitor.friction_events)}</Text>
              {visitor.registration_linked?<Text style={{color:theme.accent,fontWeight:'800'}}>Registration linked to this guest ID</Text>:null}
              <Text style={{color:theme.ink,fontWeight:'800'}}>Recent sessions ({visitor.sessions.length} shown of {visitor.session_count})</Text>
              {visitor.sessions.map(session=><View key={session.session_id} style={{borderTopWidth:1,borderColor:theme.line,paddingTop:7,gap:4}}>
                <Pressable accessibilityRole="button" accessibilityState={{expanded:selected?.session_id===session.session_id}} onPress={()=>void open(session)} style={{gap:3,paddingVertical:5}}>
                  <Text style={{color:theme.accent,fontWeight:'800'}}>{readable(session.last_action)} · {format(session.event_count)} events {selected?.session_id===session.session_id?'▴':'▾'}</Text>
                  <Text style={{color:theme.muted,fontSize:12}}>{dateTime(session.started_at)} to {dateTime(session.last_seen_at)}</Text>
                </Pressable>
                {selected?.session_id===session.session_id?<View style={{gap:7,paddingLeft:8}}>
                  {detailBusy?<ActivityIndicator color={theme.accent}/>:null}
                  {!detailBusy&&!events.length?<Text style={{color:theme.muted}}>No events available for this session.</Text>:null}
                  {!detailBusy&&events.map((entry,i)=><View key={i} style={{gap:2,paddingVertical:4}}>
                    <Text style={{color:theme.ink,fontWeight:'800'}}>{readable(entry.event_name)}{entry.location_name?` · ${entry.location_name}`:''}</Text>
                    <Text style={{color:theme.muted,fontSize:12}}>{dateTime(entry.occurred_at)}</Text>
                    {entry.context&&Object.keys(entry.context).length?<Text style={{color:theme.muted,fontSize:12}}>{Object.entries(entry.context).map(([key,value])=>`${readable(key)}: ${String(value)}`).join(' · ')}</Text>:null}
                  </View>)}
                </View>:null}
              </View>)}
            </View>:null}
          </View>)}
        </View>:null}
        {visitorError?data.recent_sessions.map(session=><View key={session.session_id} style={{...card,gap:4}}>
          <Pressable accessibilityRole="button" onPress={()=>void open(session)}>
            <Text style={{color:theme.accent,fontWeight:'900'}}>Guest {session.visitor_label} · {readable(session.last_action)}</Text>
            <Text style={{color:theme.muted,fontSize:12}}>{dateTime(session.last_seen_at)} · {format(session.event_count)} events</Text>
          </Pressable>
          {selected?.session_id===session.session_id&&events.map((entry,i)=><Text key={i} style={{color:theme.muted,fontSize:12}}>{dateTime(entry.occurred_at)} · {readable(entry.event_name)}</Text>)}
        </View>):null}
        {!visitorError&&!visitors.length?<View style={card}><Text style={{color:theme.muted}}>No detailed guest sessions recorded yet.</Text></View>:null}
      </View>
      <Text style={{color:theme.muted,lineHeight:19,fontSize:12}}>Guest identifiers are pseudonymous first-party random IDs. No device fingerprinting, IP addresses, exact GPS traces or raw search strings are saved by this system. Events are capped per session and retained for up to 30 days while new activity is arriving.</Text>
    </>:null}
  </ScrollView>;
}
